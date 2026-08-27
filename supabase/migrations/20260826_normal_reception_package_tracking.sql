-- Extiende los QR internos de GGG para paquetes capturados en recepciones normales.

alter table public.warehouse_packages
  add column if not exists reception_id uuid
    references public.receptions(id) on delete cascade;

alter table public.warehouse_packages
  add column if not exists pallet_id uuid
    references public.pallets(id) on delete cascade;

create index if not exists warehouse_packages_reception_idx
  on public.warehouse_packages (reception_id);

create index if not exists warehouse_packages_pallet_idx
  on public.warehouse_packages (pallet_id);

create unique index if not exists warehouse_packages_normal_supplier_id_unique
  on public.warehouse_packages (
    reception_id,
    pallet_id,
    supplier_package_type,
    supplier_package_id
  )
  where reception_id is not null
    and supplier_package_id is not null;
