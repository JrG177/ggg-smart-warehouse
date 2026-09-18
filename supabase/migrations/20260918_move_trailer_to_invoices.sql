-- El trailer identifica la unidad de salida y pertenece a la factura,
-- no a la recepción de entrada.
alter table public.invoices
  add column if not exists trailer text not null default '';

create index if not exists invoices_trailer_idx
  on public.invoices (trailer);

create or replace function public.set_invoice_trailer(
  p_invoice_id uuid,
  p_trailer text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invoices
  set trailer = upper(trim(coalesce(p_trailer, '')))
  where id = p_invoice_id;

  if not found then
    raise exception 'Factura no encontrada.';
  end if;
end;
$$;

grant execute on function public.set_invoice_trailer(uuid, text)
  to anon, authenticated;
