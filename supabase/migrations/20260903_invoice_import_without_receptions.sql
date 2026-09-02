-- Permite guardar la factura de Excel antes de relacionarla con recepciones.

create or replace function public.create_imported_invoice_without_receptions(
  p_invoice_id uuid,
  p_invoice_number text,
  p_carrier text,
  p_package_count integer,
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

  insert into public.invoices (
    id,
    invoice_number,
    carrier,
    package_count,
    invoice_photo_path,
    status
  ) values (
    p_invoice_id,
    p_invoice_number,
    p_carrier,
    p_package_count,
    p_photo_paths[1],
    'open'
  );

  insert into public.invoice_photos (
    invoice_id,
    photo_path,
    sort_order
  )
  select
    p_invoice_id,
    photo.path,
    photo.ordinality::integer - 1
  from unnest(coalesce(p_photo_paths, array[]::text[]))
    with ordinality as photo(path, ordinality);

  insert into public.invoice_imports (
    invoice_id, source_file_name, raw_invoice_identifier, invoice_date,
    fiscal_week, client_code, supplier_code, currency, invoice_total,
    total_quantity, total_weight, package_count, incoterm, invoice_country,
    container_number, customs_entry, observations
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
    invoice_id, line_number, part_number, tariff_code, description,
    commercial_quantity, commercial_unit_code, unit_price, total_price,
    tariff_quantity, tariff_unit_code, weight, origin, seller, package_count
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
    invoice_id, file_name, storage_path, mime_type, document_type
  )
  select
    p_invoice_id,
    document.value ->> 'file_name',
    document.value ->> 'storage_path',
    coalesce(nullif(document.value ->> 'mime_type', ''), 'application/octet-stream'),
    document.value ->> 'document_type'
  from jsonb_array_elements(coalesce(p_source_documents, '[]'::jsonb))
    as document(value);

  return p_invoice_id;
end;
$$;

revoke all on function public.create_imported_invoice_without_receptions(
  uuid, text, text, integer, text[], jsonb, jsonb, jsonb
) from public;

grant execute on function public.create_imported_invoice_without_receptions(
  uuid, text, text, integer, text[], jsonb, jsonb, jsonb
) to anon, authenticated;

notify pgrst, 'reload schema';
