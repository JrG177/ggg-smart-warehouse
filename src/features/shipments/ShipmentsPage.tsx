import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  RefreshCcw,
  Search,
  Truck,
} from 'lucide-react'

import {
  supabase,
} from '../../lib/supabase'

type Part = {
  id: string
  part_number: string
  quantity: number
  boxes: number | null
  packages: number | null
  pallet_ref: string | null
}

type Pallet = {
  id: string
  pallet_number: number
  inventory_status: string
  administrative_status: string
  pallet_parts: Part[]
}

type Reception = {
  id: string
  reception_number: string | null
  carrier: string
  other_carrier: string | null
  trailer: string
  reception_date: string
  pallets: Pallet[]
}

type InvoiceReception = {
  id: string
  reception_id: string
  reviewed: boolean
  receptions:
    | Reception
    | Reception[]
    | null
}

type Invoice = {
  id: string
  invoice_number: string
  carrier: string
  package_count: number
  status: 'open' | 'completed'
  completed_at: string | null
  created_at: string
  invoice_receptions: InvoiceReception[]
}

type Shipment = {
  id: string
  invoice_id: string
  package_count: number
  shipped_at: string
  created_at: string
  invoices:
    | Invoice
    | Invoice[]
    | null
}

function getInvoice(
  shipment:
    Shipment,
): Invoice | null {
  if (!shipment.invoices) {
    return null
  }

  return Array.isArray(
    shipment.invoices,
  )
    ? shipment.invoices[0] ||
        null
    : shipment.invoices
}

function getReception(
  item:
    InvoiceReception,
): Reception | null {
  if (!item.receptions) {
    return null
  }

  return Array.isArray(
    item.receptions,
  )
    ? item.receptions[0] ||
        null
    : item.receptions
}

function getSummary(
  reception:
    Reception | null,
) {
  const parts =
    reception?.pallets.flatMap(
      (
        pallet,
      ) =>
        pallet.pallet_parts,
    ) || []

  const partNumbers =
    Array.from(
      new Set(
        parts.map(
          (
            part,
          ) =>
            part.part_number,
        ),
      ),
    )

  const totalQuantity =
    parts.reduce(
      (
        total,
        part,
      ) =>
        total +
        Number(
          part.quantity ||
            0,
        ),
      0,
    )

  const totalPackages =
    parts.reduce(
      (
        total,
        part,
      ) =>
        total +
        Number(
          part.packages ||
            0,
        ),
      0,
    )

  return {
    partNumbers,
    totalQuantity,
    totalPackages,
  }
}

function isOsdReception(
  reception:
    Reception | null,
) {
  return Boolean(
    reception?.pallets.some(
      (
        pallet,
      ) =>
        [
          'osd',
          'osd_completed',
          'billed_osd',
        ].includes(
          pallet.administrative_status,
        ),
    ),
  )
}

function formatDate(
  value:
    string | null,
) {
  if (!value) {
    return '—'
  }

  return new Intl
    .DateTimeFormat(
      'es-MX',
      {
        year:
          'numeric',
        month:
          'short',
        day:
          '2-digit',
      },
    )
    .format(
      new Date(
        value,
      ),
    )
}

export function ShipmentsPage() {
  const [
    shipments,
    setShipments,
  ] =
    useState<
      Shipment[]
    >([])

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    )

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false,
    )

  const [
    searchTerm,
    setSearchTerm,
  ] =
    useState(
      '',
    )

  const [
    error,
    setError,
  ] =
    useState(
      '',
    )

  const loadShipments =
    async (
      showRefresh =
        false,
    ) => {
      if (
        showRefresh
      ) {
        setRefreshing(
          true,
        )
      } else {
        setLoading(
          true,
        )
      }

      setError(
        '',
      )

      const {
        data,
        error:
          queryError,
      } =
        await supabase
          .from(
            'shipments',
          )
          .select(`
            id,
            invoice_id,
            package_count,
            shipped_at,
            created_at,
            invoices (
              id,
              invoice_number,
              carrier,
              package_count,
              status,
              completed_at,
              created_at,
              invoice_receptions (
                id,
                reception_id,
                reviewed,
                receptions (
                  id,
                  reception_number,
                  carrier,
                  other_carrier,
                  trailer,
                  reception_date,
                  pallets (
                    id,
                    pallet_number,
                    inventory_status,
                    administrative_status,
                    pallet_parts (
                      id,
                      part_number,
                      quantity,
                      boxes,
                      packages,
                      pallet_ref
                    )
                  )
                )
              )
            )
          `)
          .order(
            'shipped_at',
            {
              ascending:
                false,
            },
          )

      if (
        queryError
      ) {
        setError(
          queryError.message,
        )

        setShipments(
          [],
        )
      } else {
        setShipments(
          (
            data ||
            []
          ) as Shipment[],
        )
      }

      setLoading(
        false,
      )

      setRefreshing(
        false,
      )
    }

  useEffect(
    () => {
      void loadShipments()
    },
    [],
  )

  const filtered =
    useMemo(
      () => {
        const search =
          searchTerm
            .trim()
            .toLowerCase()

        if (!search) {
          return shipments
        }

        return shipments.filter(
          (
            shipment,
          ) => {
            const invoice =
              getInvoice(
                shipment,
              )

            return [
              invoice
                ?.invoice_number ||
                '',
              invoice
                ?.carrier ||
                '',
              ...(
                invoice
                  ?.invoice_receptions
                  .map(
                    (
                      item,
                    ) =>
                      getReception(
                        item,
                      )
                        ?.reception_number ||
                      '',
                  ) ||
                []
              ),
            ].some(
              (
                value,
              ) =>
                value
                  .toLowerCase()
                  .includes(
                    search,
                  ),
            )
          },
        )
      },
      [
        shipments,
        searchTerm,
      ],
    )

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-slate-400">
          Salida de material
        </p>

        <h1 className="mt-2 text-3xl font-bold text-white">
          Embarques
        </h1>

        <p className="mt-2 text-slate-400">
          Facturas completadas que ya fueron marcadas como embarcadas.
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-400">
          {
            error
          }
        </div>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Truck
              size={
                21
              }
              className="text-emerald-400"
            />

            <div>
              <h2 className="font-semibold text-white">
                Embarques
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Misma vista que Historial de Factura.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Search
                size={
                  18
                }
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />

              <input
                value={
                  searchTerm
                }
                onChange={(
                  event,
                ) =>
                  setSearchTerm(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Buscar factura o recepción..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-4 text-sm outline-none sm:w-80"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                void loadShipments(
                  true,
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300"
            >
              <RefreshCcw
                size={
                  17
                }
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              />

              Actualizar
            </button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              Cargando embarques...
            </div>
          ) : filtered.length ===
            0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center text-slate-500">
              No hay embarques registrados.
            </div>
          ) : (
            <div className="space-y-6">
              {filtered.map(
                (
                  shipment,
                ) => {
                  const invoice =
                    getInvoice(
                      shipment,
                    )

                  if (!invoice) {
                    return null
                  }

                  return (
                    <article
                      key={
                        shipment.id
                      }
                      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"
                    >
                      <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-xl font-bold text-white">
                            {
                              invoice
                                .invoice_number
                            }
                          </p>

                          <p className="mt-1 text-sm text-slate-400">
                            {
                              invoice.carrier
                            }{' '}
                            ·{' '}
                            {
                              shipment
                                .package_count
                            }{' '}
                            bultos ·{' '}
                            {
                              invoice
                                .invoice_receptions
                                .length
                            }{' '}
                            recepciones
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400">
                            Embarcado
                          </span>

                          <span className="text-sm text-slate-500">
                            {
                              formatDate(
                                shipment
                                  .shipped_at,
                              )
                            }
                          </span>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-800">
                        {invoice
                          .invoice_receptions
                          .map(
                            (
                              item,
                            ) => {
                              const reception =
                                getReception(
                                  item,
                                )

                              const summary =
                                getSummary(
                                  reception,
                                )

                              const osd =
                                isOsdReception(
                                  reception,
                                )

                              return (
                                <div
                                  key={
                                    item.id
                                  }
                                  className={[
                                    'grid gap-3 p-4 lg:grid-cols-[200px_1fr_140px_120px]',
                                    osd
                                      ? 'bg-red-500/[0.03]'
                                      : '',
                                  ].join(
                                    ' ',
                                  )}
                                >
                                  <div
                                    className={[
                                      'flex flex-wrap items-center gap-2 font-semibold',
                                      osd
                                        ? 'text-red-400'
                                        : 'text-white',
                                    ].join(
                                      ' ',
                                    )}
                                  >
                                    {reception
                                      ?.reception_number ||
                                      'Sin folio'}

                                    {osd && (
                                      <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">
                                        OS&amp;D
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-sm text-slate-300">
                                    {summary
                                      .partNumbers
                                      .length >
                                    0
                                      ? summary
                                          .partNumbers
                                          .join(
                                            ', ',
                                          )
                                      : 'Sin número de parte'}
                                  </div>

                                  <div className="text-sm text-slate-300">
                                    {
                                      summary
                                        .totalQuantity
                                    }{' '}
                                    piezas
                                  </div>

                                  <div className="text-sm text-slate-300">
                                    {
                                      summary
                                        .totalPackages
                                    }{' '}
                                    bultos
                                  </div>
                                </div>
                              )
                            },
                          )}
                      </div>
                    </article>
                  )
                },
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}