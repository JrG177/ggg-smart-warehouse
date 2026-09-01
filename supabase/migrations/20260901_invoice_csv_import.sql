-- Guarda la cabecera, partidas y archivos originales de facturas importadas desde CSV.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'invoice-source-documents',
  'invoice-source-documents',
  false,
  15728640,
  array[
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'text/plain',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "invoice source files read" on storage.objects;
create policy "invoice source files read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'invoice-source-documents');

drop policy if exists "invoice source files insert" on storage.objects;
create policy "invoice source files insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'invoice-source-documents');

drop policy if exists "invoice source files update" on storage.objects;
create policy "invoice source files update"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'invoice-source-documents')
  with check (bucket_id = 'invoice-source-documents');

drop policy if exists "invoice source files delete" on storage.objects;
create policy "invoice source files delete"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'invoice-source-documents');

create table if not exists public.invoice_imports (
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  source_file_name text not null,
  raw_invoice_identifier text not null,
  invoice_date date,
  fiscal_week smallint check (
    fiscal_week is null or fiscal_week between 1 and 53
  ),
  client_code text,
  supplier_code text,
  currency text not null default 'USD',
  invoice_total numeric(18, 4) not null default 0,
  total_quantity numeric(18, 4) not null default 0,
  total_weight numeric(18, 4) not null default 0,
  package_count integer not null default 0,
  incoterm text,
  invoice_country text,
  container_number text,
  customs_entry text,
  observations text,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_import_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoice_imports(invoice_id) on delete cascade,
  line_number integer not null check (line_number > 0),
  part_number text not null,
  tariff_code text,
  description text,
  commercial_quantity numeric(18, 4) not null check (commercial_quantity > 0),
  commercial_unit_code text,
  unit_price numeric(18, 4) not null default 0,
  total_price numeric(18, 4) not null default 0,
  tariff_quantity numeric(18, 4) not null default 0,
  tariff_unit_code text,
  weight numeric(18, 4) not null default 0,
  origin text,
  seller text,
  package_count numeric(18, 4) not null default 0,
  created_at timestamptz not null default now(),
  unique (invoice_id, line_number)
);

create table if not exists public.invoice_source_documents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  document_type text not null check (document_type in ('csv', 'evidence')),
  created_at timestamptz not null default now()
);

-- Corrige instalaciones donde las líneas se relacionaron directamente con invoices.
-- PostgREST necesita esta relación para anidar las partidas dentro de invoice_imports.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'invoice_import_lines_invoice_id_fkey'
      and conrelid = 'public.invoice_import_lines'::regclass
      and confrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoice_import_lines
      drop constraint invoice_import_lines_invoice_id_fkey;

    alter table public.invoice_import_lines
      add constraint invoice_import_lines_invoice_id_fkey
      foreign key (invoice_id)
      references public.invoice_imports(invoice_id)
      on delete cascade;
  end if;
end;
$$;

notify pgrst, 'reload schema';

create index if not exists invoice_import_lines_invoice_idx
  on public.invoice_import_lines (invoice_id, line_number);

create index if not exists invoice_import_lines_part_number_idx
  on public.invoice_import_lines (part_number);

create index if not exists invoice_source_documents_invoice_idx
  on public.invoice_source_documents (invoice_id);

alter table public.invoice_imports enable row level security;
alter table public.invoice_import_lines enable row level security;
alter table public.invoice_source_documents enable row level security;

drop policy if exists "invoice imports app access" on public.invoice_imports;
create policy "invoice imports app access"
  on public.invoice_imports
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "invoice import lines app access" on public.invoice_import_lines;
create policy "invoice import lines app access"
  on public.invoice_import_lines
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "invoice source documents app access"
  on public.invoice_source_documents;
create policy "invoice source documents app access"
  on public.invoice_source_documents
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.invoice_imports
  to anon, authenticated;
grant select, insert, update, delete on public.invoice_import_lines
  to anon, authenticated;
grant select, insert, update, delete on public.invoice_source_documents
  to anon, authenticated;

create or replace function public.create_imported_invoice_with_receptions(
  p_invoice_id uuid,
  p_invoice_number text,
  p_carrier text,
  p_package_count integer,
  p_reception_ids uuid[],
  p_photo_paths text[],
  p_import_header jsonb,
  p_import_lines jsonb,
  p_source_documents jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_array_length(coalesce(p_import_lines, '[]'::jsonb)) = 0 then
    raise exception 'La factura importada debe contener al menos una partida.';
  end if;

  perform public.create_invoice_with_receptions(
    p_invoice_id,
    p_invoice_number,
    p_carrier,
    p_package_count,
    p_reception_ids,
    coalesce(p_photo_paths, array[]::text[])
  );

  insert into public.invoice_imports (
    invoice_id,
    source_file_name,
    raw_invoice_identifier,
    invoice_date,
    fiscal_week,
    client_code,
    supplier_code,
    currency,
    invoice_total,
    total_quantity,
    total_weight,
    package_count,
    incoterm,
    invoice_country,
    container_number,
    customs_entry,
    observations
  ) values (
    p_invoice_id,
    p_import_header ->> 'source_file_name',
    p_import_header ->> 'raw_invoice_identifier',
    nullif(p_import_header ->> 'invoice_date', '')::date,
    nullif(p_import_header ->> 'fiscal_week', '')::smallint,
    nullif(p_import_header ->> 'client_code', ''),
    nullif(p_import_header ->> 'supplier_code', ''),
    coalesce(nullif(p_import_header ->> 'currency', ''), 'USD'),
    coalesce(nullif(p_import_header ->> 'invoice_total', '')::numeric, 0),
    coalesce(nullif(p_import_header ->> 'total_quantity', '')::numeric, 0),
    coalesce(nullif(p_import_header ->> 'total_weight', '')::numeric, 0),
    coalesce(nullif(p_import_header ->> 'package_count', '')::integer, 0),
    nullif(p_import_header ->> 'incoterm', ''),
    nullif(p_import_header ->> 'invoice_country', ''),
    nullif(p_import_header ->> 'container_number', ''),
    nullif(p_import_header ->> 'customs_entry', ''),
    nullif(p_import_header ->> 'observations', '')
  );

  insert into public.invoice_import_lines (
    invoice_id,
    line_number,
    part_number,
    tariff_code,
    description,
    commercial_quantity,
    commercial_unit_code,
    unit_price,
    total_price,
    tariff_quantity,
    tariff_unit_code,
    weight,
    origin,
    seller,
    package_count
  )
  select
    p_invoice_id,
    coalesce(nullif(item.value ->> 'line_number', '')::integer, item.ordinality::integer),
    item.value ->> 'part_number',
    nullif(item.value ->> 'tariff_code', ''),
    nullif(item.value ->> 'description', ''),
    (item.value ->> 'commercial_quantity')::numeric,
    nullif(item.value ->> 'commercial_unit_code', ''),
    coalesce(nullif(item.value ->> 'unit_price', '')::numeric, 0),
    coalesce(nullif(item.value ->> 'total_price', '')::numeric, 0),
    coalesce(nullif(item.value ->> 'tariff_quantity', '')::numeric, 0),
    nullif(item.value ->> 'tariff_unit_code', ''),
    coalesce(nullif(item.value ->> 'weight', '')::numeric, 0),
    nullif(item.value ->> 'origin', ''),
    nullif(item.value ->> 'seller', ''),
    coalesce(nullif(item.value ->> 'package_count', '')::numeric, 0)
  from jsonb_array_elements(p_import_lines) with ordinality as item(value, ordinality);

  insert into public.invoice_source_documents (
    invoice_id,
    file_name,
    storage_path,
    mime_type,
    document_type
  )
  select
    p_invoice_id,
    document.value ->> 'file_name',
    document.value ->> 'storage_path',
    coalesce(
      nullif(document.value ->> 'mime_type', ''),
      'application/octet-stream'
    ),
    document.value ->> 'document_type'
  from jsonb_array_elements(
    coalesce(p_source_documents, '[]'::jsonb)
  ) as document(value);

  return p_invoice_id;
end;
$$;

revoke all on function public.create_imported_invoice_with_receptions(
  uuid, text, text, integer, uuid[], text[], jsonb, jsonb, jsonb
) from public;

grant execute on function public.create_imported_invoice_with_receptions(
  uuid, text, text, integer, uuid[], text[], jsonb, jsonb, jsonb
) to anon, authenticated;
