-- Registra cada intento de escaneo físico durante la preparación de una factura.

create table if not exists public.invoice_load_scans (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  warehouse_package_id uuid references public.warehouse_packages(id) on delete set null,
  raw_code text not null,
  part_number text,
  quantity numeric(18, 4) not null default 0,
  result text not null check (
    result in (
      'accepted',
      'not_in_invoice',
      'duplicate',
      'quantity_exceeded',
      'not_found',
      'ambiguous',
      'assigned_elsewhere',
      'unavailable'
    )
  ),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_load_scans_invoice_idx
  on public.invoice_load_scans (invoice_id, created_at desc);

create index if not exists invoice_load_scans_package_idx
  on public.invoice_load_scans (warehouse_package_id);

create unique index if not exists invoice_load_scans_accepted_package_unique
  on public.invoice_load_scans (invoice_id, warehouse_package_id)
  where result = 'accepted' and warehouse_package_id is not null;

alter table public.invoice_load_scans enable row level security;

drop policy if exists "invoice load scans app access"
  on public.invoice_load_scans;

create policy "invoice load scans app access"
  on public.invoice_load_scans
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete
  on public.invoice_load_scans
  to anon, authenticated;

notify pgrst, 'reload schema';
