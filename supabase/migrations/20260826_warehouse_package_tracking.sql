-- Crea paquetes rastreables a partir de labels industriales P/K/Q/V/3S/4S.
-- El tracking_code es el único dato incluido en el QR interno de GGG.

create table if not exists public.warehouse_packages (
  id uuid primary key default gen_random_uuid(),
  tracking_code text not null unique default (
    'GGG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  quick_reception_id uuid references public.quick_receptions(id) on delete cascade,
  part_number text not null,
  purchase_order text,
  quantity integer check (quantity is null or quantity > 0),
  supplier_code text,
  supplier_package_id text,
  supplier_package_type text check (
    supplier_package_type is null or supplier_package_type in ('3S', '4S')
  ),
  raw_codes jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (
    status in ('received', 'assigned', 'shipped')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists warehouse_packages_quick_reception_idx
  on public.warehouse_packages (quick_reception_id);

create index if not exists warehouse_packages_part_number_idx
  on public.warehouse_packages (part_number);

create index if not exists warehouse_packages_tracking_code_idx
  on public.warehouse_packages (tracking_code);

create unique index if not exists warehouse_packages_supplier_id_unique
  on public.warehouse_packages (
    quick_reception_id,
    supplier_package_type,
    supplier_package_id
  )
  where supplier_package_id is not null;

alter table public.warehouse_packages enable row level security;

drop policy if exists "warehouse packages app access" on public.warehouse_packages;
create policy "warehouse packages app access"
  on public.warehouse_packages
  for all
  to anon, authenticated
  using (true)
  with check (true);
