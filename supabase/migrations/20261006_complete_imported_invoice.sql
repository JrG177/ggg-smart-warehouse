-- Ejecutar completo en Supabase SQL Editor.
-- Conserva firma, permisos y comportamiento de facturas normales.
begin;

create or replace function public.complete_invoice_and_create_shipment(
  p_invoice_id uuid,
  p_package_count integer
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_shipment_id uuid;
  v_total_parts integer;
  v_reviewed_parts integer;
  v_status text;
  v_missing text;
begin
  if p_package_count is null or p_package_count < 1 then
    raise exception 'El número de bultos debe ser mayor a cero.';
  end if;

  -- Serializa dos intentos de completar la misma factura.
  select status into v_status
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found or v_status is distinct from 'open' then
    raise exception 'La factura no existe o ya fue completada.';
  end if;

  if exists (
    select 1 from public.invoice_imports where invoice_id = p_invoice_id
  ) then
    if not exists (
      select 1 from public.invoice_import_lines where invoice_id = p_invoice_id
    ) then
      raise exception 'La factura importada no tiene partidas.';
    end if;

    if exists (
      select 1 from public.invoice_import_lines
      where invoice_id = p_invoice_id
        and (regexp_replace(upper(coalesce(part_number, '')), '[^A-Z0-9]', '', 'g') = ''
          or commercial_quantity is null or commercial_quantity <= 0)
    ) then
      raise exception 'La factura importada contiene una parte o cantidad inválida.';
    end if;

    -- Misma normalización de parte que el escáner: mayúsculas, letras y dígitos.
    -- Agrupa partidas repetidas; únicamente suma intentos aceptados.
    with expected as (
      select regexp_replace(upper(part_number), '[^A-Z0-9]', '', 'g') as part_key,
             min(part_number) as part_number,
             round(sum(commercial_quantity)::numeric, 4) as quantity
      from public.invoice_import_lines
      where invoice_id = p_invoice_id
      group by 1
    ), scanned as (
      select regexp_replace(upper(coalesce(part_number, '')), '[^A-Z0-9]', '', 'g') as part_key,
             round(sum(quantity)::numeric, 4) as quantity
      from public.invoice_load_scans
      where invoice_id = p_invoice_id and result = 'accepted'
      group by 1
    ), differences as (
      select coalesce(e.part_number, s.part_key) as part_number,
             coalesce(e.quantity, 0) as expected_quantity,
             coalesce(s.quantity, 0) as scanned_quantity
      from expected e full join scanned s on s.part_key = e.part_key
      where e.part_key is null or s.part_key is null
         or e.quantity <> s.quantity
    )
    select string_agg(format('%s (factura: %s, escaneado: %s)',
                            part_number, expected_quantity, scanned_quantity), '; ')
    into v_missing
    from (select * from differences order by part_number limit 5) d;

    if v_missing is not null then
      raise exception 'Las cantidades escaneadas no coinciden con la factura. %', v_missing;
    end if;
  else
    select count(distinct pp.id) into v_total_parts
    from public.invoice_receptions ir
    join public.pallets p on p.reception_id = ir.reception_id
    join public.pallet_parts pp on pp.pallet_id = p.id
    where ir.invoice_id = p_invoice_id;

    if v_total_parts = 0 then
      raise exception 'La factura no tiene números de parte.';
    end if;

    select count(distinct ipc.pallet_part_id) into v_reviewed_parts
    from public.invoice_part_checks ipc
    where ipc.invoice_id = p_invoice_id and ipc.reviewed = true
      and ipc.pallet_part_id in (
        select pp.id
        from public.invoice_receptions ir
        join public.pallets p on p.reception_id = ir.reception_id
        join public.pallet_parts pp on pp.pallet_id = p.id
        where ir.invoice_id = p_invoice_id
      );

    if v_reviewed_parts <> v_total_parts then
      raise exception 'Debes marcar todos los números de parte antes de completar la factura. Marcados: %, Total: %.',
        v_reviewed_parts, v_total_parts;
    end if;
  end if;

  insert into public.shipments (invoice_id, package_count, shipped_at)
  values (p_invoice_id, p_package_count, now())
  on conflict (invoice_id) do update set
    package_count = excluded.package_count,
    shipped_at = excluded.shipped_at
  returning id into v_shipment_id;

  update public.invoices set
    status = 'completed', package_count = p_package_count,
    completed_at = now(), updated_at = now()
  where id = p_invoice_id;

  update public.pallets p set
    inventory_status = 'shipped',
    administrative_status = case
      when p.administrative_status in ('osd', 'osd_completed', 'billed_osd')
        then 'billed_osd'
      else 'billed'
    end
  where p.reception_id in (
    select ir.reception_id from public.invoice_receptions ir
    where ir.invoice_id = p_invoice_id
  );

  return v_shipment_id;
end;
$function$;

notify pgrst, 'reload schema';
commit;
