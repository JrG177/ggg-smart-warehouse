-- Reserva paquetes aceptados, los marca enviados al completar factura y conserva auditoría diaria.

create table if not exists public.warehouse_activity_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  part_number text,
  quantity numeric(18, 4),
  details jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists warehouse_activity_log_created_idx
  on public.warehouse_activity_log (created_at desc);
create index if not exists warehouse_activity_log_part_idx
  on public.warehouse_activity_log (part_number, created_at desc);

alter table public.warehouse_activity_log enable row level security;
drop policy if exists "warehouse activity log app access" on public.warehouse_activity_log;
create policy "warehouse activity log app access"
  on public.warehouse_activity_log for all to anon, authenticated
  using (true) with check (true);
grant select, insert on public.warehouse_activity_log to anon, authenticated;

create or replace function public.assign_package_after_invoice_scan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.result = 'accepted' and new.warehouse_package_id is not null then
    update public.warehouse_packages
      set status = 'assigned', updated_at = now()
      where id = new.warehouse_package_id and status = 'received';
  end if;

  insert into public.warehouse_activity_log (
    event_type, entity_type, entity_id, part_number, quantity, details
  ) values (
    'invoice_scan', 'invoice', new.invoice_id, new.part_number, new.quantity,
    jsonb_build_object('result', new.result, 'message', new.message, 'raw_code', new.raw_code,
      'warehouse_package_id', new.warehouse_package_id)
  );
  return new;
end;
$$;

drop trigger if exists invoice_load_scan_inventory_sync on public.invoice_load_scans;
create trigger invoice_load_scan_inventory_sync
after insert on public.invoice_load_scans
for each row execute function public.assign_package_after_invoice_scan();

create or replace function public.ship_packages_after_invoice_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    update public.warehouse_packages as package
      set status = 'shipped', updated_at = now()
      where package.id in (
        select scan.warehouse_package_id
        from public.invoice_load_scans as scan
        where scan.invoice_id = new.id
          and scan.result = 'accepted'
          and scan.warehouse_package_id is not null
      );

    insert into public.warehouse_activity_log (event_type, entity_type, entity_id, details)
    values ('invoice_completed', 'invoice', new.id,
      jsonb_build_object('invoice_number', new.invoice_number, 'package_count', new.package_count));
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_completion_inventory_sync on public.invoices;
create trigger invoice_completion_inventory_sync
after update of status on public.invoices
for each row execute function public.ship_packages_after_invoice_completion();

create or replace function public.log_warehouse_package_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.warehouse_activity_log (event_type, entity_type, entity_id, part_number, quantity, details)
    values ('package_received', 'warehouse_package', new.id, new.part_number, new.quantity,
      jsonb_build_object('tracking_code', new.tracking_code, 'status', new.status,
        'condition', new.condition_status, 'reception_id', new.reception_id,
        'quick_reception_id', new.quick_reception_id));
  elsif old.status is distinct from new.status then
    insert into public.warehouse_activity_log (event_type, entity_type, entity_id, part_number, quantity, details)
    values ('package_status_changed', 'warehouse_package', new.id, new.part_number, new.quantity,
      jsonb_build_object('from', old.status, 'to', new.status, 'tracking_code', new.tracking_code));
  end if;
  return new;
end;
$$;

drop trigger if exists warehouse_package_activity on public.warehouse_packages;
create trigger warehouse_package_activity
after insert or update of status on public.warehouse_packages
for each row execute function public.log_warehouse_package_activity();

create or replace function public.log_inventory_osd_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.warehouse_activity_log (event_type, entity_type, entity_id, details)
  values (
    case when tg_op = 'INSERT' then 'osd_opened' else 'osd_updated' end,
    'inventory_osd_case', new.id,
    jsonb_build_object('warehouse_package_id', new.warehouse_package_id,
      'reception_id', new.reception_id, 'reason', new.reason, 'status', new.status,
      'notes', new.notes)
  );
  return new;
end;
$$;

drop trigger if exists inventory_osd_activity on public.inventory_osd_cases;
create trigger inventory_osd_activity
after insert or update on public.inventory_osd_cases
for each row execute function public.log_inventory_osd_activity();

notify pgrst, 'reload schema';
