-- A1 isolated from invoices/pallets: revision checks prevent lost updates.
begin;
create table if not exists public.a1_workspace (
  id text primary key check (id = 'a1'),
  revision integer not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.a1_workspace(id,data)
values ('a1','{"version":1,"boxes":[],"invoices":[],"events":[]}'::jsonb)
on conflict (id) do nothing;
alter table public.a1_workspace enable row level security;
drop policy if exists "a1 app read" on public.a1_workspace;
create policy "a1 app read" on public.a1_workspace for select to anon,authenticated using (true);
grant select on public.a1_workspace to anon,authenticated;
revoke insert,update,delete on public.a1_workspace from anon,authenticated;
create or replace function public.save_a1_workspace(p_revision integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  previous public.a1_workspace%rowtype;
  b jsonb; old_box jsonb; inv jsonb; old_inv jsonb; box_id text;
  seen text[] := '{}'; names text[] := '{}'; linked text[] := '{}';
begin
  select * into previous from public.a1_workspace where id='a1' for update;
  if previous.id is null then raise exception 'A1 compartido no está inicializado.'; end if;
  if p_revision is null or previous.revision <> p_revision then raise exception 'Otro equipo actualizó A1. Los datos se recargaron; vuelve a intentar. No se sobrescribió ningún registro.'; end if;
  if (p_data->>'version') is distinct from '1' or jsonb_typeof(p_data->'boxes') is distinct from 'array' or jsonb_typeof(p_data->'invoices') is distinct from 'array' or jsonb_typeof(p_data->'events') is distinct from 'array' then raise exception 'Datos A1 inválidos.'; end if;
  -- Preserve records and audit history; ordinary clients cannot authorize releases.
  for old_box in select value from jsonb_array_elements(previous.data->'boxes') loop
    if not exists(select 1 from jsonb_array_elements(p_data->'boxes') n where n->>'id'=old_box->>'id') then raise exception 'No se pueden eliminar cajas del historial.'; end if;
  end loop;
  if jsonb_array_length(p_data->'events') <> jsonb_array_length(previous.data->'events')+1 then raise exception 'Se requiere un evento de auditoría.'; end if;
  if exists(select 1 from jsonb_array_elements(previous.data->'events') with ordinality e(value,i) where value is distinct from (p_data->'events')->(i::integer-1)) then raise exception 'No se puede alterar el historial.'; end if;
  for b in select value from jsonb_array_elements(p_data->'boxes') loop
    if coalesce(b->>'id','')='' or coalesce(b->>'tracking','')='' or b->>'id'=any(seen) then raise exception 'Caja sin identificación o duplicada.'; end if;
    seen := array_append(seen,b->>'id');
    if b->>'tracking'=any(names) then raise exception 'Tracking duplicado.'; end if;
    names := array_append(names,b->>'tracking');
    if coalesce(b->>'receivedDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha de recepción inválida.'; end if;
    perform (b->>'receivedDate')::date;
    if b->>'classification'='osnd' and coalesce(b->>'note','')='' then raise exception 'Agrega una observación para OSND.'; end if;
    if b ? 'classification' and b->>'classification' not in ('normal','nom','osnd') then raise exception 'Clasificación inválida.'; end if;
    if b ? 'receptionClosedAt' and coalesce(b->>'classification','')='' then raise exception 'Clasifica cada caja antes de finalizar.'; end if;
    select value into old_box from jsonb_array_elements(previous.data->'boxes') where value->>'id'=b->>'id';
    if b->'externalRelease' is distinct from old_box->'externalRelease' then raise exception 'El operador no puede autorizar liberaciones OSND.'; end if;
    if old_box is not null then
      if old_box->>'tracking' is distinct from b->>'tracking' then raise exception 'El tracking recibido no se puede cambiar desde A1 compartido.'; end if;
      if old_box ? 'departedAt' and old_box is distinct from b then raise exception 'Una caja que ya salió conserva su registro.'; end if;
      if (coalesce(old_box->>'osd','')<>'' or old_box->>'classification'='osnd') and not(old_box ? 'externalRelease') and (coalesce(b->>'osd','')='' or b->>'classification' is distinct from 'osnd') then raise exception 'OSND retenida: se requiere autorización externa.'; end if;
    end if;
    if b ? 'departedAt' then
      if coalesce(b->>'classification','')='' or not(b ? 'receptionClosedAt') then raise exception 'Finaliza la recepción antes de dar salida.'; end if;
      if (coalesce(b->>'osd','')<>'' or b->>'classification'='osnd') and not(b ? 'externalRelease') then raise exception 'OSND retenida: no puede salir.'; end if;
      if coalesce(b->>'departedDate','')='' or (b->>'departedDate')::date < (b->>'receivedDate')::date then raise exception 'Fecha de salida inválida.'; end if;
    end if;
  end loop;
  -- A sticker and a box can each belong to only one current record/invoice.
  if exists(select 1 from jsonb_array_elements(p_data->'boxes') b where coalesce(b->>'number','')<>'' group by b->>'number' having count(*)>1) then raise exception 'Sticker duplicado.'; end if;
  if exists(select 1 from jsonb_array_elements(p_data->'invoices') i group by i->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_data->'invoices') i group by i->>'number' having count(*)>1) then raise exception 'Factura duplicada.'; end if;
  for old_inv in select value from jsonb_array_elements(previous.data->'invoices') loop
    select value into inv from jsonb_array_elements(p_data->'invoices') where value->>'id'=old_inv->>'id';
    if inv is null then raise exception 'No se pueden eliminar facturas.'; end if;
    if old_inv->>'departedAt' is not null and old_inv is distinct from inv then raise exception 'No se puede modificar una factura que ya salió.'; end if;
  end loop;
  for inv in select value from jsonb_array_elements(p_data->'invoices') loop
    if coalesce(inv->>'id','')='' or coalesce(inv->>'number','')='' or coalesce(inv->>'loadedIn','')='' or jsonb_typeof(inv->'boxIds') is distinct from 'array' then raise exception 'Factura inválida.'; end if;
    for box_id in select jsonb_array_elements_text(inv->'boxIds') loop
      if box_id=any(linked) then raise exception 'Una caja no puede estar en dos facturas.'; end if;
      linked:=array_append(linked,box_id);
      select value into b from jsonb_array_elements(p_data->'boxes') where value->>'id'=box_id;
      if b is null or not(b ? 'receptionClosedAt') then raise exception 'Caja inexistente o recepción pendiente.'; end if;
      if (coalesce(b->>'osd','')<>'' or b->>'classification'='osnd') and not(b ? 'externalRelease') then raise exception 'OSND retenida: no se puede facturar.'; end if;
      if inv->>'departedAt' is not null and not(b ? 'departedAt') then raise exception 'Escanea todas las cajas antes de confirmar salida.'; end if;
    end loop;
  end loop;
  update public.a1_workspace set data=p_data,revision=revision+1,updated_at=now() where id='a1' returning * into previous;
  return jsonb_build_object('revision',previous.revision,'data',previous.data);
end;
$$;
revoke all on function public.save_a1_workspace(integer,jsonb) from public;
grant execute on function public.save_a1_workspace(integer,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
