import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye,
  FileText,
  PackagePlus,
  RefreshCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type ReceptionStatus =
  | 'in_progress'
  | 'completed'

type OperationalStatus =
  | 'received'
  | 'in_billing'
  | 'billed'
  | 'ready_to_load'
  | 'loading'
  | 'shipped'

type ReceptionRow = {
  id: string
  reception_number: string
  carrier: string
  other_carrier: string | null
  trailer: string
  pallet_count: number
  seal: string | null
  reception_date: string
  reception_time: string
  status: ReceptionStatus
  operational_status: OperationalStatus
  has_discrepancy: boolean
  created_at: string
  is_archived: boolean
}

function getReceptionStatusLabel(
  status: ReceptionStatus,
) {
  if (status === 'completed') {
    return 'Recepción completada'
  }

  return 'En registro'
}

function getOperationalStatusLabel(
  status: OperationalStatus,
) {
  if (status === 'received') {
    return 'Recibido'
  }

  if (status === 'in_billing') {
    return 'En facturación'
  }

  if (status === 'billed') {
    return 'Facturado'
  }

  if (status === 'ready_to_load') {
    return 'Listo para carga'
  }

  if (status === 'loading') {
    return 'Cargando'
  }

  return 'Embarcado'
}

function getCarrierName(
  reception: ReceptionRow,
) {
  if (
    reception.carrier === 'Other' &&
    reception.other_carrier
  ) {
    return reception.other_carrier
  }

  return reception.carrier
}

function formatDate(
  dateValue: string,
) {
  if (!dateValue) {
    return '—'
  }

  const [year, month, day] =
    dateValue.split('-')

  if (
    !year ||
    !month ||
    !day
  ) {
    return dateValue
  }

  return `${month}/${day}/${year}`
}

function formatTime(
  timeValue: string,
) {
  if (!timeValue) {
    return '—'
  }

  const [
    hourString,
    minuteString,
  ] =
    timeValue.split(':')

  const hour =
    Number(hourString)

  const minute =
    minuteString ||
    '00'

  if (
    Number.isNaN(hour)
  ) {
    return timeValue
  }

  const suffix =
    hour >= 12
      ? 'PM'
      : 'AM'

  const formattedHour =
    hour % 12 ||
    12

  return `${formattedHour}:${minute} ${suffix}`
}

export function ReceivingPage() {
  const navigate =
    useNavigate()

  const [
    receipts,
    setReceipts,
  ] =
    useState<ReceptionRow[]>([])

  const [
    searchTerm,
    setSearchTerm,
  ] =
    useState('')

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false)

  const [
    updatingReceptionStatusId,
    setUpdatingReceptionStatusId,
  ] =
    useState<string | null>(
      null,
    )

  const [
    updatingOperationalStatusId,
    setUpdatingOperationalStatusId,
  ] =
    useState<string | null>(
      null,
    )

  const [
    updatingDiscrepancyId,
    setUpdatingDiscrepancyId,
  ] =
    useState<string | null>(
      null,
    )

  const [
    deletingReceptionId,
    setDeletingReceptionId,
  ] =
    useState<string | null>(
      null,
    )

  const [
    error,
    setError,
  ] =
    useState('')

  const loadReceipts =
    async (
      showRefreshing =
        false,
    ) => {
      if (
        showRefreshing
      ) {
        setRefreshing(
          true,
        )
      } else {
        setLoading(
          true,
        )
      }

      setError('')

      const {
        data,
        error:
          supabaseError,
      } = await supabase
        .from(
          'receptions',
        )
        .select(`
          id,
          reception_number,
          carrier,
          other_carrier,
          trailer,
          pallet_count,
          seal,
          reception_date,
          reception_time,
          status,
          operational_status,
          has_discrepancy,
          created_at,
          is_archived
        `)
        .eq(
          'is_archived',
          false,
        )
        .order(
          'created_at',
          {
            ascending:
              false,
          },
        )

      if (
        supabaseError
      ) {
        console.error(
          'Error cargando recepciones:',
          supabaseError,
        )

        setError(
          `No se pudieron cargar las recepciones: ${supabaseError.message}`,
        )

        setReceipts([])
      } else {
        setReceipts(
          (
            data || []
          ) as ReceptionRow[],
        )
      }

      setLoading(false)
      setRefreshing(false)
    }

  useEffect(() => {
    void loadReceipts()
  }, [])

  const updateReceptionStatus =
    async (
      receptionId: string,
      newStatus:
        ReceptionStatus,
    ) => {
      const previousReceipts =
        receipts

      setUpdatingReceptionStatusId(
        receptionId,
      )

      setReceipts(
        (
          currentReceipts,
        ) =>
          currentReceipts.map(
            (
              receipt,
            ) =>
              receipt.id ===
              receptionId
                ? {
                    ...receipt,
                    status:
                      newStatus,
                  }
                : receipt,
          ),
      )

      const {
        error:
          updateError,
      } = await supabase
        .from(
          'receptions',
        )
        .update({
          status:
            newStatus,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          receptionId,
        )

      if (
        updateError
      ) {
        setReceipts(
          previousReceipts,
        )

        setError(
          `No se pudo actualizar el estado de recepción: ${updateError.message}`,
        )
      }

      setUpdatingReceptionStatusId(
        null,
      )
    }

  const updateOperationalStatus =
    async (
      receptionId: string,
      newStatus:
        OperationalStatus,
    ) => {
      const previousReceipts =
        receipts

      setUpdatingOperationalStatusId(
        receptionId,
      )

      setReceipts(
        (
          currentReceipts,
        ) =>
          currentReceipts.map(
            (
              receipt,
            ) =>
              receipt.id ===
              receptionId
                ? {
                    ...receipt,
                    operational_status:
                      newStatus,
                  }
                : receipt,
          ),
      )

      const {
        error:
          updateError,
      } = await supabase
        .from(
          'receptions',
        )
        .update({
          operational_status:
            newStatus,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          receptionId,
        )

      if (
        updateError
      ) {
        setReceipts(
          previousReceipts,
        )

        setError(
          `No se pudo actualizar el estado operativo: ${updateError.message}`,
        )
      }

      setUpdatingOperationalStatusId(
        null,
      )
    }

  const updateDiscrepancy =
    async (
      receptionId: string,
      hasDiscrepancy: boolean,
    ) => {
      const previousReceipts =
        receipts

      setUpdatingDiscrepancyId(
        receptionId,
      )

      setReceipts(
        (
          currentReceipts,
        ) =>
          currentReceipts.map(
            (
              receipt,
            ) =>
              receipt.id ===
              receptionId
                ? {
                    ...receipt,
                    has_discrepancy:
                      hasDiscrepancy,
                  }
                : receipt,
          ),
      )

      const {
        error:
          updateError,
      } = await supabase
        .from(
          'receptions',
        )
        .update({
          has_discrepancy:
            hasDiscrepancy,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          receptionId,
        )

      if (
        updateError
      ) {
        setReceipts(
          previousReceipts,
        )

        setError(
          `No se pudo actualizar la discrepancia: ${updateError.message}`,
        )
      }

      setUpdatingDiscrepancyId(
        null,
      )
    }


  const archiveReception =
    async (
      receipt:
        ReceptionRow,
    ) => {
      const confirmed =
        window.confirm(
          `¿Eliminar ${receipt.reception_number} de la lista de recepciones?\n\nEl registro no se borrará permanentemente. Quedará archivado para conservar el historial.`,
        )

      if (
        !confirmed
      ) {
        return
      }

      try {
        setDeletingReceptionId(
          receipt.id,
        )

        setError(
          '',
        )

        const {
          error:
            archiveError,
        } =
          await supabase
            .from(
              'receptions',
            )
            .update({
              is_archived:
                true,

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'id',
              receipt.id,
            )

        if (
          archiveError
        ) {
          throw new Error(
            archiveError.message,
          )
        }

        setReceipts(
          (
            current,
          ) =>
            current.filter(
              (
                item,
              ) =>
                item.id !==
                receipt.id,
            ),
        )
      } catch (
        archiveError
      ) {
        setError(
          archiveError instanceof
            Error
            ? archiveError.message
            : 'No se pudo eliminar la recepción.',
        )
      } finally {
        setDeletingReceptionId(
          null,
        )
      }
    }

  const filteredReceipts =
    useMemo(() => {
      const normalizedSearch =
        searchTerm
          .trim()
          .toLowerCase()

      if (
        !normalizedSearch
      ) {
        return receipts
      }

      return receipts.filter(
        (
          receipt,
        ) => {
          const carrier =
            getCarrierName(
              receipt,
            )

          return [
            receipt.id,
            receipt.reception_number,
            carrier,
            receipt.trailer,
            receipt.status,
            receipt.operational_status,
            getReceptionStatusLabel(
              receipt.status,
            ),
            getOperationalStatusLabel(
              receipt.operational_status,
            ),
            receipt.has_discrepancy
              ? 'discrepancia'
              : 'sin discrepancia',
          ].some(
            (
              value,
            ) =>
              String(
                value,
              )
                .toLowerCase()
                .includes(
                  normalizedSearch,
                ),
          )
        },
      )
    }, [
      receipts,
      searchTerm,
    ])

  const completedCount =
    receipts.filter(
      (
        receipt,
      ) =>
        receipt.status ===
        'completed',
    ).length

  const inProgressCount =
    receipts.filter(
      (
        receipt,
      ) =>
        receipt.status ===
        'in_progress',
    ).length

  const discrepancyCount =
    receipts.filter(
      (
        receipt,
      ) =>
        receipt.has_discrepancy,
    ).length

  const totalPallets =
    receipts.reduce(
      (
        total,
        receipt,
      ) =>
        total +
        receipt.pallet_count,
      0,
    )

  return (
    <div className="space-y-8">

      <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-slate-400">
            Operación de entrada
          </p>

          <h1 className="mt-2 text-3xl font-bold text-white">
            Recepción
          </h1>

          <p className="mt-2 max-w-2xl text-slate-400">
            Consulta y administra las recepciones registradas en GGG Smart Warehouse.
          </p>
        </div>

        <button
          onClick={() =>
            navigate(
              '/receiving/new',
            )
          }
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          <PackagePlus
            size={20}
          />

          Nueva recepción
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-4">

        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Recepciones registradas
          </p>

          <p className="mt-3 text-3xl font-bold text-white">
            {
              receipts.length
            }
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {
              totalPallets
            }{' '}
            pallets registrados
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Recepción completada
          </p>

          <p className="mt-3 text-3xl font-bold text-emerald-400">
            {
              completedCount
            }
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Registros finalizados
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            En registro
          </p>

          <p className="mt-3 text-3xl font-bold text-amber-400">
            {
              inProgressCount
            }
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Recepciones pendientes
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Con discrepancia
          </p>

          <p className="mt-3 text-3xl font-bold text-red-400">
            {
              discrepancyCount
            }
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Requieren seguimiento
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900">

        <div className="flex flex-col gap-4 border-b border-slate-800 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Recepciones recientes
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Registros guardados en Supabase
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <div className="relative w-full sm:w-80">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />

              <input
                type="text"
                value={
                  searchTerm
                }
                onChange={(
                  event,
                ) =>
                  setSearchTerm(
                    event.target.value,
                  )
                }
                placeholder="Buscar recepción, carrier, trailer o ID..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500"
              />
            </div>

            <button
              type="button"
              disabled={
                refreshing
              }
              onClick={() =>
                void loadReceipts(
                  true,
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
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

        {error && (
          <div className="border-b border-slate-800 px-6 py-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {
                error
              }
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">

            <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-4">
                  Recepción
                </th>

                <th className="px-5 py-4">
                  Carrier
                </th>

                <th className="px-5 py-4">
                  Trailer
                </th>

                <th className="px-5 py-4">
                  Pallets
                </th>

                <th className="px-5 py-4">
                  Fecha / Hora
                </th>

                <th className="px-5 py-4">
                  Recibido por
                </th>

                <th className="px-5 py-4">
                  Discrepancia
                </th>

                <th className="px-5 py-4">
                  Estado recepción
                </th>

                <th className="px-5 py-4">
                  Estado operativo
                </th>

                <th className="px-5 py-4">
                  Acción
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      10
                    }
                    className="px-6 py-12 text-center text-sm text-slate-500"
                  >
                    Cargando recepciones...
                  </td>
                </tr>
              ) : filteredReceipts.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={
                      10
                    }
                    className="px-6 py-12 text-center text-sm text-slate-500"
                  >
                    {searchTerm
                      ? 'No se encontraron recepciones con esa búsqueda.'
                      : 'Todavía no hay recepciones registradas.'}
                  </td>
                </tr>
              ) : (
                filteredReceipts.map(
                  (
                    receipt,
                  ) => {
                    return (
                      <tr
                        key={
                          receipt.id
                        }
                        className="transition hover:bg-slate-800/50"
                      >
                        <td className="px-5 py-5">
                          <p className="font-semibold text-white">
                            {
                              receipt.reception_number
                            }
                          </p>

                          <p className="mt-1 text-xs text-slate-600">
                            {receipt.id.slice(
                              0,
                              8,
                            )}
                          </p>
                        </td>

                        <td className="px-5 py-5 text-slate-300">
                          {getCarrierName(
                            receipt,
                          )}
                        </td>

                        <td className="px-5 py-5 text-slate-300">
                          {
                            receipt.trailer
                          }
                        </td>

                        <td className="px-5 py-5 text-slate-300">
                          {
                            receipt.pallet_count
                          }
                        </td>

                        <td className="px-5 py-5">
                          <p className="text-sm text-slate-300">
                            {formatDate(
                              receipt.reception_date,
                            )}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {formatTime(
                              receipt.reception_time,
                            )}
                          </p>
                        </td>

                        <td className="px-5 py-5">
                          <span className="text-sm text-slate-500">
                            Pendiente de usuarios
                          </span>
                        </td>

                        <td className="px-5 py-5">
                          <select
                            value={
                              receipt.has_discrepancy
                                ? 'yes'
                                : 'no'
                            }
                            disabled={
                              updatingDiscrepancyId ===
                              receipt.id
                            }
                            onChange={(
                              event,
                            ) =>
                              void updateDiscrepancy(
                                receipt.id,
                                event.target.value ===
                                  'yes',
                              )
                            }
                            className={[
                              'rounded-xl border px-3 py-2 text-xs font-semibold outline-none transition',
                              receipt.has_discrepancy
                                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                            ].join(
                              ' ',
                            )}
                          >
                            <option value="no">
                              Sin discrepancia
                            </option>

                            <option value="yes">
                              Con discrepancia
                            </option>
                          </select>
                        </td>

                        <td className="px-5 py-5">
                          <select
                            value={
                              receipt.status
                            }
                            disabled={
                              updatingReceptionStatusId ===
                              receipt.id
                            }
                            onChange={(
                              event,
                            ) =>
                              void updateReceptionStatus(
                                receipt.id,
                                event.target.value as ReceptionStatus,
                              )
                            }
                            className={[
                              'rounded-xl border px-3 py-2 text-xs font-semibold outline-none transition',
                              receipt.status ===
                              'completed'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                            ].join(
                              ' ',
                            )}
                          >
                            <option value="in_progress">
                              En registro
                            </option>

                            <option value="completed">
                              Recepción completada
                            </option>
                          </select>
                        </td>

                        <td className="px-5 py-5">
                          <select
                            value={
                              receipt.operational_status
                            }
                            disabled={
                              updatingOperationalStatusId ===
                              receipt.id
                            }
                            onChange={(
                              event,
                            ) =>
                              void updateOperationalStatus(
                                receipt.id,
                                event.target.value as OperationalStatus,
                              )
                            }
                            className={[
                              'rounded-xl border px-3 py-2 text-xs font-semibold outline-none transition',
                              receipt.operational_status ===
                              'shipped'
                                ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                                : receipt.operational_status ===
                                    'ready_to_load'
                                  ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                                  : receipt.operational_status ===
                                      'loading'
                                    ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                                    : receipt.operational_status ===
                                        'billed'
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                      : receipt.operational_status ===
                                          'in_billing'
                                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                        : 'border-slate-700 bg-slate-800 text-slate-300',
                            ].join(
                              ' ',
                            )}
                          >
                            <option value="received">
                              Recibido
                            </option>

                            <option value="in_billing">
                              En facturación
                            </option>

                            <option value="billed">
                              Facturado
                            </option>

                            <option value="ready_to_load">
                              Listo para carga
                            </option>

                            <option value="loading">
                              Cargando
                            </option>

                            <option value="shipped">
                              Embarcado
                            </option>
                          </select>
                        </td>

                        <td className="px-5 py-5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/receiving/${receipt.id}`,
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-emerald-500/50 hover:bg-slate-800 hover:text-white"
                            >
                              <Eye
                                size={
                                  15
                                }
                              />

                              Ver detalle
                            </button>

                            <button
                              type="button"
                              title="Eliminar recepción"
                              aria-label={`Eliminar ${receipt.reception_number}`}
                              disabled={
                                deletingReceptionId ===
                                receipt.id
                              }
                              onClick={() =>
                                void archiveReception(
                                  receipt,
                                )
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2
                                size={
                                  16
                                }
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  },
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-800 p-3 text-emerald-400">
              <FileText
                size={21}
              />
            </div>

            <div>
              <h2 className="font-semibold text-white">
                Flujo de recepción
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Proceso actual del sistema
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {[
              'Registrar llegada del trailer',
              'Definir cantidad esperada de pallets',
              'Registrar cada pallet individualmente',
              'Capturar números de parte y cantidades',
              'Registrar daños y observaciones',
              'Adjuntar Packing List, Etiqueta, Foto de Tarima y BOL',
              'Completar verificación',
              'Guardar recepción en Supabase',
            ].map(
              (
                step,
                index,
              ) => (
                <div
                  key={
                    step
                  }
                  className="flex items-center gap-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-emerald-400">
                    {index +
                      1}
                  </div>

                  <span className="text-sm text-slate-300">
                    {
                      step
                    }
                  </span>
                </div>
              ),
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-white">
            Estado del módulo
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Funciones activas actualmente:
          </p>

          <div className="mt-6 space-y-3">
            {[
              'Recepciones guardadas en base de datos',
              'Pallets vinculados a cada recepción',
              'Múltiples números de parte por pallet',
              'Cuatro evidencias obligatorias por pallet',
              'Fotos almacenadas en Supabase Storage',
              'Búsqueda de recepciones reales',
              'Estado de recepción independiente',
              'Estado operativo con actualización rápida',
              'Control independiente de discrepancias',
            ].map(
              (
                item,
              ) => (
                <div
                  key={
                    item
                  }
                  className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
                >
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />

                  <span className="text-sm text-slate-300">
                    {
                      item
                    }
                  </span>
                </div>
              ),
            )}
          </div>
        </article>
      </section>
    </div>
  )
}