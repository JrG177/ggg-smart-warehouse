import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FileImage,
  RefreshCcw,
  Search,
  X,
} from 'lucide-react'

import { supabase } from '../../lib/supabase'

type InvoicePartCheck = {
  id: string
  invoice_id: string
  pallet_part_id: string
  reviewed: boolean
}

type Part = {
  id: string
  part_number: string
  quantity: number
  packages: number | null
  invoice_part_checks: InvoicePartCheck[]
}

type Pallet = {
  id: string
  pallet_number: number
  damaged: boolean
  location_code: string | null
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


type OsdQueueRow = {
  id: string
  pallet_id: string
  status: 'pending' | 'completed'
  reviewed: boolean
  created_at: string
  pallets:
    | {
        id: string
        pallet_number: number
        administrative_status: string
        pallet_parts: Part[]
        receptions:
          | {
              id: string
              reception_number: string | null
              carrier: string
              other_carrier: string | null
              trailer: string
            }
          | Array<{
              id: string
              reception_number: string | null
              carrier: string
              other_carrier: string | null
              trailer: string
            }>
          | null
      }
    | Array<{
        id: string
        pallet_number: number
        administrative_status: string
        pallet_parts: Part[]
        receptions:
          | {
              id: string
              reception_number: string | null
              carrier: string
              other_carrier: string | null
              trailer: string
            }
          | Array<{
              id: string
              reception_number: string | null
              carrier: string
              other_carrier: string | null
              trailer: string
            }>
          | null
      }>
    | null
}

type InvoicePhotoRow = {
  id: string
  invoice_id: string
  photo_path: string
  sort_order: number
}

type Invoice = {
  id: string
  invoice_number: string
  carrier: string
  package_count: number
  invoice_photo_path: string | null
  status: 'open' | 'completed'
  completed_at: string | null
  created_at: string
  invoice_receptions:
    InvoiceReception[]
}

function getReception(
  item: InvoiceReception,
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

function getCarrier(
  reception:
    Reception | null,
) {
  if (!reception) {
    return '—'
  }

  return (
    reception.other_carrier ||
    reception.carrier
  )
}

function getReceptionSummary(
  reception:
    Reception | null,
) {
  const parts =
    reception?.pallets.flatMap(
      (pallet) =>
        pallet.pallet_parts,
    ) || []

  const partNumbers =
    Array.from(
      new Set(
        parts.map(
          (part) =>
            part.part_number,
        ),
      ),
    )

  const totalQuantity =
    parts.reduce(
      (total, part) =>
        total +
        Number(
          part.quantity || 0,
        ),
      0,
    )

  const totalPackages =
    parts.reduce(
      (total, part) =>
        total +
        Number(
          part.packages || 0,
        ),
      0,
    )

  return {
    partNumbers,
    totalQuantity,
    totalPackages,
    parts,
  }
}

export function BillingPage() {
  const [invoices, setInvoices] =
    useState<Invoice[]>([])

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [searchTerm, setSearchTerm] =
    useState('')

  const [
    completionPackageCounts,
    setCompletionPackageCounts,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({})

  const [statusTab, setStatusTab] =
    useState<'open' | 'completed' | 'osd'>(
      'open',
    )

  const [
    osdRows,
    setOsdRows,
  ] =
    useState<OsdQueueRow[]>([])

  const [
    expandedReceptions,
    setExpandedReceptions,
  ] =
    useState<Record<string, boolean>>(
      {},
    )

  const [error, setError] =
    useState('')

  const [
    invoiceViewerOpen,
    setInvoiceViewerOpen,
  ] = useState(false)

  const [
    invoiceViewerLoading,
    setInvoiceViewerLoading,
  ] = useState(false)

  const [
    invoiceViewerTitle,
    setInvoiceViewerTitle,
  ] = useState('')

  const [
    invoiceViewerUrls,
    setInvoiceViewerUrls,
  ] = useState<string[]>([])

  const [
    invoiceViewerIndex,
    setInvoiceViewerIndex,
  ] = useState(0)

  const loadInvoices =
    async (
      showRefresh = false,
    ) => {
      if (showRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')

      if (
        statusTab ===
        'osd'
      ) {
        const {
          data,
          error:
            osdError,
        } = await supabase
          .from('osd_queue')
          .select(`
            id,
            pallet_id,
            status,
            reviewed,
            created_at,
            pallets (
              id,
              pallet_number,
              administrative_status,
              pallet_parts (
                id,
                part_number,
                quantity,
                packages
              ),
              receptions (
                id,
                reception_number,
                carrier,
                other_carrier,
                trailer
              )
            )
          `)
          .eq(
            'status',
            'pending',
          )
          .order(
            'created_at',
            {
              ascending:
                true,
            },
          )

        if (osdError) {
          setError(
            osdError.message,
          )

          setOsdRows([])
        } else {
          setOsdRows(
            (
              data ||
              []
            ) as OsdQueueRow[],
          )
        }

        setLoading(false)
        setRefreshing(false)
        return
      }

      const {
        data,
        error: invoiceError,
      } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          carrier,
          package_count,
          invoice_photo_path,
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
                damaged,
                location_code,
                pallet_parts (
                  id,
                  part_number,
                  quantity,
                  packages,
                  invoice_part_checks (
                    id,
                    invoice_id,
                    pallet_part_id,
                    reviewed
                  )
                )
              )
            )
          )
        `)
        .eq('status', statusTab)
        .order('created_at', {
          ascending: false,
        })

      if (invoiceError) {
        setError(
          invoiceError.message,
        )
        setInvoices([])
      } else {
        setInvoices(
          (data || []) as Invoice[],
        )
      }

      setLoading(false)
      setRefreshing(false)
    }

  useEffect(() => {
    void loadInvoices()
  }, [statusTab])

  const filteredInvoices =
    useMemo(
      () => {
        const search =
          searchTerm
            .trim()
            .toLowerCase()

        if (!search) {
          return invoices
        }

        return invoices.filter(
          (invoice) =>
            [
              invoice.invoice_number,
              invoice.carrier,
              ...invoice.invoice_receptions.map(
                (item) =>
                  getReception(item)
                    ?.reception_number ||
                  '',
              ),
            ].some(
              (value) =>
                value
                  .toLowerCase()
                  .includes(search),
            ),
        )
      },
      [
        invoices,
        searchTerm,
      ],
    )

  const toggleReception =
    (
      id: string,
    ) => {
      setExpandedReceptions(
        (current) => ({
          ...current,
          [id]:
            !current[id],
        }),
      )
    }

  const completeInvoice =
    async (
      invoice:
        Invoice,
    ) => {
      const invoiceParts =
        invoice
          .invoice_receptions
          .flatMap(
            (
              item,
            ) =>
              getReception(
                item,
              )?.pallets.flatMap(
                (
                  pallet,
                ) =>
                  pallet.pallet_parts,
              ) ||
              [],
          )

      const allReviewed =
        invoiceParts.length >
          0 &&
        invoiceParts.every(
          (
            part,
          ) =>
            part
              .invoice_part_checks
              .some(
                (
                  check,
                ) =>
                  check.invoice_id ===
                    invoice.id &&
                  check.reviewed,
              ),
        )

      const finalPackageCount =
        Number(
          completionPackageCounts[
            invoice.id
          ] ||
            '',
        )

      if (
        !allReviewed
      ) {
        setError(
          'Debes marcar todas las recepciones antes de completar la factura.',
        )
        return
      }

      if (
        !Number.isInteger(
          finalPackageCount,
        ) ||
        finalPackageCount <
          1
      ) {
        setError(
          'Captura un # de Bultos válido antes de completar la factura.',
        )
        return
      }

      try {
        setError(
          '',
        )

        const {
          error:
            completeError,
        } =
          await supabase
            .rpc(
              'complete_invoice_and_create_shipment',
              {
                p_invoice_id:
                  invoice.id,

                p_package_count:
                  finalPackageCount,
              },
            )

        if (
          completeError
        ) {
          throw new Error(
            completeError.message,
          )
        }

        setCompletionPackageCounts(
          (
            current,
          ) => {
            const next = {
              ...current,
            }

            delete next[
              invoice.id
            ]

            return next
          },
        )

        await loadInvoices()

        alert(
          'Factura completada y enviada automáticamente a Embarques.',
        )
      } catch (
        completeError
      ) {
        setError(
          completeError instanceof
            Error
            ? completeError.message
            : 'No se pudo completar la factura.',
        )
      }
    }


  const toggleInvoicePartReviewed =
    async (
      invoiceId:
        string,
      part:
        Part,
      checked:
        boolean,
    ) => {
      try {
        setError('')

        const {
          error:
            upsertError,
        } =
          await supabase
            .from(
              'invoice_part_checks',
            )
            .upsert(
              {
                invoice_id:
                  invoiceId,

                pallet_part_id:
                  part.id,

                reviewed:
                  checked,

                updated_at:
                  new Date()
                    .toISOString(),
              },
              {
                onConflict:
                  'invoice_id,pallet_part_id',
              },
            )

        if (
          upsertError
        ) {
          throw new Error(
            upsertError.message,
          )
        }

        await loadInvoices()
      } catch (
        updateError
      ) {
        setError(
          updateError instanceof
            Error
            ? updateError.message
            : 'No se pudo actualizar el check del número de parte.',
        )
      }
    }


  const toggleOsdReviewed =
    async (
      row:
        OsdQueueRow,
      checked:
        boolean,
    ) => {
      const {
        error:
          updateError,
      } = await supabase
        .from(
          'osd_queue',
        )
        .update({
          reviewed:
            checked,
        })
        .eq(
          'id',
          row.id,
        )

      if (updateError) {
        setError(
          updateError.message,
        )
        return
      }

      setOsdRows(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              row.id
                ? {
                    ...item,
                    reviewed:
                      checked,
                  }
                : item,
          ),
      )
    }

  const completeOsd =
    async (
      row:
        OsdQueueRow,
    ) => {
      if (!row.reviewed) {
        return
      }

      try {
        const {
          error:
            queueError,
        } = await supabase
          .from(
            'osd_queue',
          )
          .update({
            status:
              'completed',
            completed_at:
              new Date()
                .toISOString(),
            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            row.id,
          )

        if (queueError) {
          throw new Error(
            queueError.message,
          )
        }

        const {
          error:
            palletError,
        } = await supabase
          .from(
            'pallets',
          )
          .update({
            administrative_status:
              'osd_completed',
          })
          .eq(
            'id',
            row.pallet_id,
          )

        if (palletError) {
          throw new Error(
            palletError.message,
          )
        }

        setOsdRows(
          (current) =>
            current.filter(
              (item) =>
                item.id !==
                row.id,
            ),
        )
      } catch (osdError) {
        setError(
          osdError instanceof Error
            ? osdError.message
            : 'No se pudo completar OS&D.',
        )
      }
    }

  const closeInvoiceViewer =
    () => {
      setInvoiceViewerOpen(false)
      setInvoiceViewerLoading(false)
      setInvoiceViewerTitle('')
      setInvoiceViewerUrls([])
      setInvoiceViewerIndex(0)
    }

  const openInvoicePhotos =
    async (
      invoice: Invoice,
    ) => {
      try {
        setError('')
        setInvoiceViewerOpen(true)
        setInvoiceViewerLoading(true)
        setInvoiceViewerTitle(
          invoice.invoice_number,
        )
        setInvoiceViewerUrls([])
        setInvoiceViewerIndex(0)

        const {
          data: photoRows,
          error: photosError,
        } = await supabase
          .from('invoice_photos')
          .select(`
            id,
            invoice_id,
            photo_path,
            sort_order
          `)
          .eq(
            'invoice_id',
            invoice.id,
          )
          .order(
            'sort_order',
            {
              ascending: true,
            },
          )

        if (photosError) {
          throw new Error(
            photosError.message,
          )
        }

        const savedPaths =
          (
            photoRows ||
            []
          )
            .map(
              (
                photo,
              ) =>
                (
                  photo as InvoicePhotoRow
                ).photo_path,
            )
            .filter(
              (
                path,
              ): path is string =>
                Boolean(path),
            )

        const uniquePaths =
          Array.from(
            new Set(
              savedPaths.length >
                0
                ? savedPaths
                : invoice.invoice_photo_path
                  ? [
                      invoice.invoice_photo_path,
                    ]
                  : [],
            ),
          )

        if (
          uniquePaths.length ===
          0
        ) {
          throw new Error(
            'Esta factura no tiene fotografías guardadas.',
          )
        }

        const signedResults =
          await Promise.all(
            uniquePaths.map(
              async (
                path,
              ) => {
                const {
                  data,
                  error:
                    signedUrlError,
                } =
                  await supabase.storage
                    .from(
                      'invoice-documents',
                    )
                    .createSignedUrl(
                      path,
                      60 * 10,
                    )

                if (
                  signedUrlError
                ) {
                  return null
                }

                return data.signedUrl
              },
            ),
          )

        const validUrls =
          signedResults.filter(
            (
              url,
            ): url is string =>
              Boolean(url),
          )

        if (
          validUrls.length ===
          0
        ) {
          throw new Error(
            'No se pudieron abrir las fotografías de la factura.',
          )
        }

        setInvoiceViewerUrls(
          validUrls,
        )
      } catch (
        viewerError
      ) {
        closeInvoiceViewer()

        setError(
          viewerError instanceof
            Error
            ? viewerError.message
            : 'No se pudieron cargar las fotografías de la factura.',
        )
      } finally {
        setInvoiceViewerLoading(
          false,
        )
      }
    }

  const showPreviousInvoicePhoto =
    () => {
      setInvoiceViewerIndex(
        (
          current,
        ) =>
          current === 0
            ? invoiceViewerUrls.length -
              1
            : current - 1,
      )
    }

  const showNextInvoicePhoto =
    () => {
      setInvoiceViewerIndex(
        (
          current,
        ) =>
          current ===
          invoiceViewerUrls.length -
            1
            ? 0
            : current + 1,
      )
    }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-slate-400">
          Proceso administrativo
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Factura
        </h1>

        <p className="mt-2 text-slate-400">
          Cada factura funciona como una lista donde puedes agregar varias recepciones.
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-400">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setStatusTab('open')
              }
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                statusTab === 'open'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'border border-slate-700 text-slate-300',
              ].join(' ')}
            >
              Facturas abiertas
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusTab(
                  'completed',
                )
              }
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                statusTab === 'completed'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'border border-slate-700 text-slate-300',
              ].join(' ')}
            >
              Historial
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusTab(
                  'osd',
                )
              }
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                statusTab === 'osd'
                  ? 'bg-red-500 text-white'
                  : 'border border-slate-700 text-slate-300',
              ].join(' ')}
            >
              OS&amp;D
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />

              <input
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(
                    event.target.value,
                  )
                }
                placeholder="Buscar factura o recepción..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-4 text-sm outline-none sm:w-80"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                void loadInvoices(true)
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold"
            >
              <RefreshCcw
                size={17}
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
              Cargando...
            </div>
          ) : statusTab ===
            'osd' ? (
            <div className="space-y-3">
              {osdRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center text-slate-500">
                  No hay registros pendientes en OS&amp;D.
                </div>
              ) : (
                osdRows.map(
                  (row) => {
                    const pallet =
                      Array.isArray(
                        row.pallets,
                      )
                        ? row.pallets[0] ||
                          null
                        : row.pallets

                    const receptionData =
                      pallet?.receptions

                    const reception =
                      Array.isArray(
                        receptionData,
                      )
                        ? receptionData[0] ||
                          null
                        : receptionData

                    const parts =
                      pallet?.pallet_parts ||
                      []

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

                    return (
                      <article
                        key={row.id}
                        className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4"
                      >
                        <div className="grid gap-3 lg:grid-cols-[180px_1fr_140px_140px_auto_auto] lg:items-center">
                          <span className="font-bold text-red-400">
                            {reception?.reception_number ||
                              'Sin folio'}
                          </span>

                          <span className="text-sm text-slate-300">
                            {parts.length > 0
                              ? parts
                                  .map(
                                    (
                                      part,
                                    ) =>
                                      part.part_number,
                                  )
                                  .join(', ')
                              : 'Sin número de parte'}
                          </span>

                          <span className="text-sm text-slate-300">
                            {totalQuantity} piezas
                          </span>

                          <span className="text-sm text-slate-300">
                            {totalPackages} bultos
                          </span>

                          <input
                            type="checkbox"
                            checked={
                              row.reviewed
                            }
                            onChange={(event) =>
                              void toggleOsdReviewed(
                                row,
                                event.target.checked,
                              )
                            }
                            className="h-5 w-5 cursor-pointer accent-red-500"
                          />

                          <button
                            type="button"
                            disabled={
                              !row.reviewed
                            }
                            onClick={() =>
                              void completeOsd(
                                row,
                              )
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <CheckCircle2 size={15} />
                            Completar OS&amp;D
                          </button>
                        </div>
                      </article>
                    )
                  },
                )
              )}
            </div>
          ) : filteredInvoices.length ===
            0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center text-slate-500">
              No hay facturas en esta sección.
            </div>
          ) : (
            <div className="space-y-6">
              {filteredInvoices.map(
                (invoice) => {
                  const invoiceParts =
                    invoice
                      .invoice_receptions
                      .flatMap(
                        (
                          item,
                        ) =>
                          getReception(
                            item,
                          )?.pallets.flatMap(
                            (
                              pallet,
                            ) =>
                              pallet.pallet_parts,
                          ) ||
                          [],
                      )

                  const allReviewed =
                    invoiceParts.length >
                      0 &&
                    invoiceParts.every(
                      (
                        part,
                      ) =>
                        part
                          .invoice_part_checks
                          .some(
                            (
                              check,
                            ) =>
                              check.invoice_id ===
                                invoice.id &&
                              check.reviewed,
                          ),
                    )

                  return (
                  <article
                    key={invoice.id}
                    className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"
                  >
                    <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xl font-bold">
                          {invoice.invoice_number}
                        </p>

                        <p className="mt-1 text-sm text-slate-400">
                          {invoice.carrier} · {invoice.package_count} bultos · {invoice.invoice_receptions.length} recepciones
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {invoice.invoice_photo_path && (
                          <button
                            type="button"
                            onClick={() =>
                              void openInvoicePhotos(
                                invoice,
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold"
                          >
                            <FileImage size={17} />
                            Ver factura
                          </button>
                        )}

                        {invoice.status ===
                          'open' && (
                          <>
                            <label className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2">
                              <span className="whitespace-nowrap text-xs font-semibold text-slate-400">
                                # de Bultos
                              </span>

                              <input
                                type="number"
                                min="1"
                                inputMode="numeric"
                                value={
                                  completionPackageCounts[
                                    invoice.id
                                  ] ||
                                  ''
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setCompletionPackageCounts(
                                    (
                                      current,
                                    ) => ({
                                      ...current,

                                      [invoice.id]:
                                        event
                                          .target
                                          .value,
                                    }),
                                  )
                                }
                                placeholder="0"
                                className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-sm outline-none"
                              />
                            </label>

                            <button
                              type="button"
                              disabled={
                                !allReviewed ||
                                !Number.isInteger(
                                  Number(
                                    completionPackageCounts[
                                      invoice.id
                                    ] ||
                                      '',
                                  ),
                                ) ||
                                Number(
                                  completionPackageCounts[
                                    invoice.id
                                  ] ||
                                    0,
                                ) <
                                  1
                              }
                              onClick={() =>
                                void completeInvoice(
                                  invoice,
                                )
                              }
                              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              Completar factura
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="divide-y divide-slate-800">
                      {invoice.invoice_receptions.map(
                        (item) => {
                          const reception =
                            getReception(item)

                          const summary =
                            getReceptionSummary(
                              reception,
                            )

                          const expanded =
                            expandedReceptions[
                              item.id
                            ]

                          return (
                            <div
                              key={item.id}
                              className="p-4"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  toggleReception(
                                    item.id,
                                  )
                                }
                                className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 text-left lg:grid-cols-[auto_180px_1fr_140px_140px_auto]"
                              >
                                <span className="pt-1 text-slate-500">
                                  {expanded
                                    ? (
                                      <ChevronDown size={18} />
                                    )
                                    : (
                                      <ChevronRight size={18} />
                                    )}
                                </span>

                                <span className="font-semibold text-white">
                                  {reception?.reception_number ||
                                    'Sin folio'}
                                </span>

                                <span className="text-sm text-slate-300">
                                  {summary.partNumbers.length > 0
                                    ? summary.partNumbers.join(', ')
                                    : 'Sin número de parte'}
                                </span>

                                <span className="text-sm text-slate-300">
                                  {summary.totalQuantity} piezas
                                </span>

                                <span className="text-sm text-slate-300">
                                  {summary.totalPackages} bultos
                                </span>

                                <span className="text-right text-xs text-slate-500">
                                  {summary.parts.filter(
                                    (
                                      part,
                                    ) =>
                                      part
                                        .invoice_part_checks
                                        .some(
                                          (
                                            check,
                                          ) =>
                                            check.invoice_id ===
                                              invoice.id &&
                                            check.reviewed,
                                        ),
                                  ).length}
                                  /
                                  {summary.parts.length}
                                  {' '}revisados
                                </span>
                              </button>

                              {expanded && (
                                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
                                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    <Info
                                      label="Carrier"
                                      value={getCarrier(
                                        reception,
                                      )}
                                    />

                                    <Info
                                      label="Trailer"
                                      value={
                                        reception?.trailer ||
                                        '—'
                                      }
                                    />

                                    <Info
                                      label="Fecha"
                                      value={
                                        reception?.reception_date ||
                                        '—'
                                      }
                                    />

                                    <Info
                                      label="Pallets"
                                      value={String(
                                        reception?.pallets.length ||
                                          0,
                                      )}
                                    />
                                  </div>

                                  <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800">
                                    <table className="w-full min-w-[650px] text-left">
                                      <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                                        <tr>
                                          <th className="px-4 py-3">
                                            Número de parte
                                          </th>
                                          <th className="px-4 py-3">
                                            Cantidad
                                          </th>
                                          <th className="px-4 py-3">
                                            # de bultos
                                          </th>
                                          <th className="px-4 py-3 text-center">
                                            Check
                                          </th>
                                        </tr>
                                      </thead>

                                      <tbody className="divide-y divide-slate-800">
                                        {summary.parts.map(
                                          (part) => (
                                            <tr key={part.id}>
                                              <td className="px-4 py-3 font-semibold">
                                                {part.part_number}
                                              </td>
                                              <td className="px-4 py-3">
                                                {part.quantity}
                                              </td>
                                              <td className="px-4 py-3">
                                                {part.packages ??
                                                  '—'}
                                              </td>

                                              <td className="px-4 py-3 text-center">
                                                <input
                                                  type="checkbox"
                                                  checked={
                                                    part
                                                      .invoice_part_checks
                                                      .some(
                                                        (
                                                          check,
                                                        ) =>
                                                          check.invoice_id ===
                                                            invoice.id &&
                                                          check.reviewed,
                                                      )
                                                  }
                                                  onChange={(
                                                    event,
                                                  ) =>
                                                    void toggleInvoicePartReviewed(
                                                      invoice.id,
                                                      part,
                                                      event.target.checked,
                                                    )
                                                  }
                                                  className="h-5 w-5 cursor-pointer accent-emerald-500"
                                                />
                                              </td>
                                            </tr>
                                          ),
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
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

      {invoiceViewerOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${invoiceViewerTitle}`}
          onClick={closeInvoiceViewer}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-700 px-5 py-4">
              <div>
                <p className="text-sm text-slate-400">
                  Fotografías de la factura
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  {invoiceViewerTitle}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeInvoiceViewer}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"
                aria-label="Cerrar visor"
                title="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            {invoiceViewerLoading ? (
              <div className="flex min-h-[420px] items-center justify-center text-slate-400">
                Cargando fotografías...
              </div>
            ) : (
              <>
                <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40 p-4 sm:p-6">
                  {invoiceViewerUrls.length >
                    1 && (
                    <button
                      type="button"
                      onClick={
                        showPreviousInvoicePhoto
                      }
                      className="absolute left-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
                      aria-label="Foto anterior"
                      title="Foto anterior"
                    >
                      <ChevronLeft size={26} />
                    </button>
                  )}

                  {invoiceViewerUrls[
                    invoiceViewerIndex
                  ] && (
                    <a
                      href={
                        invoiceViewerUrls[
                          invoiceViewerIndex
                        ]
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex max-h-[68vh] w-full items-center justify-center"
                      title="Abrir fotografía en una pestaña nueva"
                    >
                      <img
                        src={
                          invoiceViewerUrls[
                            invoiceViewerIndex
                          ]
                        }
                        alt={`Factura ${invoiceViewerTitle}, foto ${invoiceViewerIndex + 1}`}
                        className="max-h-[68vh] max-w-full rounded-xl object-contain"
                      />
                    </a>
                  )}

                  {invoiceViewerUrls.length >
                    1 && (
                    <button
                      type="button"
                      onClick={
                        showNextInvoicePhoto
                      }
                      className="absolute right-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
                      aria-label="Siguiente foto"
                      title="Siguiente foto"
                    >
                      <ChevronRight size={26} />
                    </button>
                  )}
                </div>

                <div className="border-t border-slate-700 p-4">
                  <p className="mb-3 text-center text-sm font-semibold text-slate-300">
                    Foto{' '}
                    {invoiceViewerIndex +
                      1}{' '}
                    de{' '}
                    {
                      invoiceViewerUrls.length
                    }
                  </p>

                  {invoiceViewerUrls.length >
                    1 && (
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {invoiceViewerUrls.map(
                        (
                          url,
                          index,
                        ) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() =>
                              setInvoiceViewerIndex(
                                index,
                              )
                            }
                            className={[
                              'h-20 w-24 shrink-0 overflow-hidden rounded-xl border-2 bg-black/40',
                              invoiceViewerIndex ===
                              index
                                ? 'border-emerald-500'
                                : 'border-slate-700',
                            ].join(' ')}
                            aria-label={`Mostrar foto ${index + 1}`}
                          >
                            <img
                              src={url}
                              alt={`Miniatura ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Info({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">
        {value}
      </p>
    </div>
  )
}