-- Estado operativo por bulto y casos OS&D creados desde recepción.

alter table public.warehouse_packages
  add column if not exists condition_status text not null default 'good';
alter table public.warehouse_packages
  add column if not exists exception_reason text;
alter table public.warehouse_packages
  add column if not exists exception_notes text;

alter table public.warehouse_packages
  drop constraint if exists warehouse_packages_status_check;
alter table public.warehouse_packages
  add constraint warehouse_packages_status_check
  check (status in ('received', 'assigned', 'osd_hold', 'shipped'));

alter table public.warehouse_packages
  drop constraint if exists warehouse_packages_condition_status_check;
alter table public.warehouse_packages
  add constraint warehouse_packages_condition_status_check
  check (condition_status in ('good', 'damaged', 'missing_packing'));

create table if not exists public.inventory_osd_cases (
  id uuid primary key default gen_random_uuid(),
  warehouse_package_id uuid not null references public.warehouse_packages(id) on delete cascade,
  reception_id uuid references public.receptions(id) on delete cascade,
  reason text not null check (reason in ('damage', 'missing_packing')),
  notes text,
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (warehouse_package_id)
);

create index if not exists inventory_osd_cases_status_idx
  on public.inventory_osd_cases (status, created_at desc);

alter table public.inventory_osd_cases enable row level security;
drop policy if exists "inventory osd cases app access" on public.inventory_osd_cases;
create policy "inventory osd cases app access"
  on public.inventory_osd_cases for all to anon, authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.inventory_osd_cases to anon, authenticated;
notify pgrst, 'reload schema';
