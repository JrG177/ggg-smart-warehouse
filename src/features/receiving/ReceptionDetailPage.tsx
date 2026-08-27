import {
  useEffect,
  useState,
} from 'react'

import {
  ArrowLeft,
  Barcode,
  Box,
  Camera,
  FileText,
  Image,
  ImagePlus,
  Package,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-react'

import {
  useNavigate,
  useParams,
} from 'react-router-dom'

import {
  getReceptionById,
  updateReception,
  updateReceptionPallet,
  type PhotoType,
  type ReceptionDetail,
  type ReceptionPallet,
  type ReceptionPhoto,
  type UpdatePalletPartInput,
} from '../../services/receivingService'
import {
  listNormalReceptionPackages,
  type NormalReceptionWarehousePackage,
} from '../../services/normalReceptionPackageService'
import { WarehouseQrLabel } from './components/WarehouseQrLabel'
import './warehouseQrPrint.css'

type ArrivalEditForm = {
  carrier: string
  otherCarrier: string
  trailer: string
  seal: string
  receptionDate: string
  receptionTime: string
}

type PalletEditForm = {
  packingListReference: string
  invoice: string
  damaged: boolean
  notes: string
  documentationComplete: boolean
  parts:
    UpdatePalletPartInput[]
}

type ReplacementPhotos = {
  packing_list: File | null
  pallet_label: File | null
  pallet_photo: File | null
  bol: File | null
  damage: File | null
}
const carriers = [
  'XPO',
  'CENTRAL',
  'MTY',
  'IZI',
  'UPS',
  'Other',
]

function formatDate(
  dateValue: string,
) {
  if (!dateValue) {
    return '—'
  }

  const [
    year,
    month,
    day,
  ] =
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
    Number(
      hourString,
    )

  const minute =
    minuteString ||
    '00'

  if (
    Number.isNaN(
      hour,
    )
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

function getStatusLabel(
  status:
    ReceptionDetail['status'],
) {
  if (
    status ===
    'completed'
  ) {
    return 'Recepción completada'
  }

  if (
    status ===
    'issue'
  ) {
    return 'Con discrepancia'
  }

  return 'En registro'
}

function getPhotoLabel(
  type:
    ReceptionPhoto['photo_type'],
) {
  if (
    type ===
    'packing_list'
  ) {
    return 'Packing List'
  }

  if (
    type ===
    'pallet_label'
  ) {
    return 'Etiqueta de Tarima'
  }

  if (
    type ===
    'pallet_photo'
  ) {
    return 'Foto de Tarima'
  }

  if (
    type ===
    'damage'
  ) {
    return 'Evidencia de daño'
  }

  return 'BOL'
}

function getReceptionNumber(
  reception:
    ReceptionDetail,
) {
  return reception.reception_number
}

function createEmptyReplacementPhotos():
  ReplacementPhotos {
  return {
    packing_list:
      null,

    pallet_label:
      null,

    pallet_photo:
      null,

    bol:
      null,

    damage:
      null,
  }
}

function createPalletEditForm(
  pallet:
    ReceptionPallet,
): PalletEditForm {
  return {
    packingListReference:
      pallet
        .packing_list_reference ||
      '',

    invoice:
      pallet.invoice ||
      '',

    damaged:
      pallet.damaged,

    notes:
      pallet.notes ||
      '',

    documentationComplete:
      pallet
        .documentation_complete,

    parts:
      pallet.parts.map(
        (part) => ({
          partNumber:
            part.part_number,

          quantity:
            String(
              part.quantity,
            ),

          packages:
            part.packages ===
            null
              ? ''
              : String(
                  part.packages,
                ),

          boxes:
            'boxes' in part &&
            part.boxes !==
              null
              ? String(
                  part.boxes,
                )
              : '',

          palletReference:
            'pallet_reference' in part &&
            part.pallet_reference
              ? String(
                  part.pallet_reference,
                )
              : String(
                  pallet.pallet_number,
                ),
        }),
      ),
  }
}

export function ReceptionDetailPage() {
  const {
    id,
  } =
    useParams()

  const navigate =
    useNavigate()

  const [
    reception,
    setReception,
  ] =
    useState<
      ReceptionDetail | null
    >(
      null,
    )

  const [
    trackedPackages,
    setTrackedPackages,
  ] = useState<NormalReceptionWarehousePackage[]>([])

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    )

  const [
    error,
    setError,
  ] =
    useState(
      '',
    )

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState(
      '',
    )

  const [
    editingArrival,
    setEditingArrival,
  ] =
    useState(
      false,
    )

  const [
    arrivalForm,
    setArrivalForm,
  ] =
    useState<
      ArrivalEditForm | null
    >(
      null,
    )

  const [
    savingArrival,
    setSavingArrival,
  ] =
    useState(
      false,
    )

  const [
    editingPalletId,
    setEditingPalletId,
  ] =
    useState<
      string | null
    >(
      null,
    )

  const [
    palletEditForm,
    setPalletEditForm,
  ] =
    useState<
      PalletEditForm | null
    >(
      null,
    )

  const [
    replacementPhotos,
    setReplacementPhotos,
  ] =
    useState<ReplacementPhotos>(
      createEmptyReplacementPhotos(),
    )

  const [
    savingPallet,
    setSavingPallet,
  ] =
    useState(
      false,
    )

  const loadReception =
    async () => {
      if (!id) {
        setError(
          'No se encontró el ID de la recepción.',
        )

        setLoading(
          false,
        )

        return
      }

      try {
        setLoading(
          true,
        )

        setError(
          '',
        )

        const [data, packages] = await Promise.all([
          getReceptionById(id),
          listNormalReceptionPackages(id),
        ])

        setReception(
          data,
        )

        setTrackedPackages(packages)
      } catch (
        loadError
      ) {
        console.error(
          loadError,
        )

        if (
          loadError instanceof
          Error
        ) {
          setError(
            loadError.message,
          )
        } else {
          setError(
            'No se pudo cargar la recepción.',
          )
        }
      } finally {
        setLoading(
          false,
        )
      }
    }

  useEffect(
    () => {
      void loadReception()
    },
    [id],
  )

  const showSuccess = (
    message: string,
  ) => {
    setSuccessMessage(
      message,
    )

    window.setTimeout(
      () => {
        setSuccessMessage(
          '',
        )
      },
      3000,
    )
  }

  const startEditingArrival =
    () => {
      if (
        !reception
      ) {
        return
      }

      const isKnownCarrier =
        carriers
          .filter(
            (carrier) =>
              carrier !==
              'Other',
          )
          .includes(
            reception.carrier,
          )

      setArrivalForm({
        carrier:
          reception.other_carrier
            ? 'Other'
            : isKnownCarrier
              ? reception.carrier
              : 'Other',

        otherCarrier:
          reception.other_carrier ||
          (
            isKnownCarrier
              ? ''
              : reception.carrier
          ),

        trailer:
          reception.trailer,

        seal:
          reception.seal ||
          '',

        receptionDate:
          reception.reception_date,

        receptionTime:
          reception.reception_time
            .slice(
              0,
              5,
            ),
      })

      setEditingArrival(
        true,
      )

      setError(
        '',
      )
    }

  const cancelEditingArrival =
    () => {
      setEditingArrival(
        false,
      )

      setArrivalForm(
        null,
      )

      setError(
        '',
      )
    }

  const saveArrivalChanges =
    async () => {
      if (
        !reception ||
        !arrivalForm
      ) {
        return
      }

      if (
        !arrivalForm
          .trailer
          .trim()
      ) {
        setError(
          'El trailer o caja es obligatorio.',
        )

        return
      }

      if (
        arrivalForm
          .carrier ===
          'Other' &&
        !arrivalForm
          .otherCarrier
          .trim()
      ) {
        setError(
          'Escribe el nombre del carrier.',
        )

        return
      }

      try {
        setSavingArrival(
          true,
        )

        setError(
          '',
        )

        await updateReception(
          reception.id,
          arrivalForm,
        )

        await loadReception()

        setEditingArrival(
          false,
        )

        setArrivalForm(
          null,
        )

        showSuccess(
          'Datos de llegada actualizados correctamente.',
        )
      } catch (
        saveError
      ) {
        if (
          saveError instanceof
          Error
        ) {
          setError(
            saveError.message,
          )
        }
      } finally {
        setSavingArrival(
          false,
        )
      }
    }

  const startEditingPallet =
    (
      pallet:
        ReceptionPallet,
    ) => {
      setEditingPalletId(
        pallet.id,
      )

      setPalletEditForm(
        createPalletEditForm(
          pallet,
        ),
      )

      setReplacementPhotos(
        createEmptyReplacementPhotos(),
      )

      setError(
        '',
      )
    }

  const cancelEditingPallet =
    () => {
      setEditingPalletId(
        null,
      )

      setPalletEditForm(
        null,
      )

      setReplacementPhotos(
        createEmptyReplacementPhotos(),
      )

      setError(
        '',
      )
    }

  const updatePartField =
    (
      index:
        number,

      field:
        keyof UpdatePalletPartInput,

      value:
        string,
    ) => {
      setPalletEditForm(
        (
          previous,
        ) => {
          if (
            !previous
          ) {
            return previous
          }

          return {
            ...previous,

            parts:
              previous
                .parts
                .map(
                  (
                    part,
                    partIndex,
                  ) =>
                    partIndex ===
                    index
                      ? {
                          ...part,

                          [field]:
                            value,
                        }
                      : part,
                ),
          }
        },
      )
    }

  const addPart =
    () => {
      setPalletEditForm(
        (
          previous,
        ) => {
          if (
            !previous
          ) {
            return previous
          }

          return {
            ...previous,

            parts: [
              ...previous.parts,

              {
                partNumber:
                  '',

                quantity:
                  '',

                packages:
                  '',

                boxes:
                  '',

                palletReference:
                  '',
              },
            ],
          }
        },
      )
    }

  const removePart =
    (
      index:
        number,
    ) => {
      setPalletEditForm(
        (
          previous,
        ) => {
          if (
            !previous ||
            previous
              .parts
              .length <=
              1
          ) {
            return previous
          }

          return {
            ...previous,

            parts:
              previous
                .parts
                .filter(
                  (
                    _,
                    partIndex,
                  ) =>
                    partIndex !==
                    index,
                ),
          }
        },
      )
    }

  const selectReplacementPhoto =
    (
      type:
        PhotoType,

      files:
        FileList | null,
    ) => {
      if (
        !files ||
        files.length ===
        0
      ) {
        return
      }

      const file =
        files[0]

      setReplacementPhotos(
        (
          previous,
        ) => ({
          ...previous,

          [type]:
            file,
        }),
      )
    }

  const savePalletChanges =
    async (
      pallet:
        ReceptionPallet,
    ) => {
      if (
        !reception ||
        !palletEditForm
      ) {
        return
      }

      for (
        const part of
        palletEditForm.parts
      ) {
        if (
          !part
            .partNumber
            .trim()
        ) {
          setError(
            'Todos los números de parte deben estar capturados.',
          )

          return
        }

        if (
          !part.quantity ||
          Number(
            part.quantity,
          ) <= 0
        ) {
          setError(
            'Todas las cantidades deben ser mayores a cero.',
          )

          return
        }
      }

      try {
        setSavingPallet(
          true,
        )

        setError(
          '',
        )

        await updateReceptionPallet(
          reception.id,
          pallet.id,
          {
            ...palletEditForm,

            replacementPhotos,
          },
        )

        await loadReception()

        setEditingPalletId(
          null,
        )

        setPalletEditForm(
          null,
        )

        setReplacementPhotos(
          createEmptyReplacementPhotos(),
        )

        showSuccess(
          `Pallet ${pallet.pallet_number} actualizado correctamente.`,
        )
      } catch (
        saveError
      ) {
        if (
          saveError instanceof
          Error
        ) {
          setError(
            saveError.message,
          )
        }
      } finally {
        setSavingPallet(
          false,
        )
      }
    }

  if (
    loading
  ) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Cargando recepción...
      </div>
    )
  }

  if (
    !reception
  ) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() =>
            navigate(
              '/receiving',
            )
          }
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft
            size={
              18
            }
          />

          Volver a recepción
        </button>

        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
          {error ||
            'No se encontró la recepción.'}
        </div>
      </div>
    )
  }

  const carrier =
    reception
      .other_carrier ||
    reception.carrier

  const hasDamage =
    reception
      .pallets
      .some(
        (
          pallet,
        ) =>
          pallet.damaged,
      )

  const totalParts =
    reception
      .pallets
      .reduce(
        (
          total,
          pallet,
        ) =>
          total +
          pallet.parts
            .length,
        0,
      )

  const totalPackages =
    reception
      .pallets
      .reduce(
        (
          total,
          pallet,
        ) =>
          total +
          pallet.parts
            .reduce(
              (
                palletTotal,
                part,
              ) =>
                palletTotal +
                (
                  part.packages ||
                  0
                ),
              0,
            ),
        0,
      )

  const totalEvidence =
    reception
      .pallets
      .reduce(
        (
          total,
          pallet,
        ) =>
          total +
          pallet.photos
            .length,
        0,
      )

  return (
    <div className="reception-detail-page space-y-8">
      <section>
        <button
          type="button"
          onClick={() =>
            navigate(
              '/receiving',
            )
          }
          className="inline-flex items-center gap-2 text-sm text-slate-600 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft
            size={
              18
            }
          />

          Volver a recepción
        </button>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Expediente de recepción
            </p>

            <h1 className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">
              {getReceptionNumber(
                reception,
              )}
            </h1>

            <p className="mt-2 text-xs text-slate-600 dark:text-slate-500">
              ID interno:{' '}
              {
                reception.id
              }
            </p>
          </div>

          <span
            className={[
              'inline-flex w-fit rounded-full px-4 py-2 text-sm font-semibold',

              reception.status ===
              'completed'
                ? 'bg-emerald-500/10 text-emerald-400'
                : reception.status ===
                    'issue'
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-amber-500/10 text-amber-400',
            ].join(
              ' ',
            )}
          >
            {getStatusLabel(
              reception.status,
            )}
          </span>
        </div>
      </section>

      {successMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-400">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-400">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Pallets"
          value={String(
            reception
              .pallets
              .length,
          )}
          icon={
            Package
          }
        />

        <MetricCard
          title="Números de parte"
          value={String(
            totalParts,
          )}
          icon={
            Box
          }
        />

        <MetricCard
          title="Cajas / bultos"
          value={String(
            totalPackages,
          )}
          icon={
            FileText
          }
        />

        <MetricCard
          title="Material con daños"
          value={
            hasDamage
              ? 'Sí'
              : 'No'
          }
          icon={
            TriangleAlert
          }
        />
      </section>

      {trackedPackages.length > 0 && (
        <section className="rounded-2xl border border-emerald-500/25 bg-white p-5 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Barcode size={21} className="text-emerald-500" />
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  Paquetes rastreables y QR de GGG
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {trackedPackages.length} {trackedPackages.length === 1 ? 'label registrada' : 'labels registradas'} en esta recepción.
              </p>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              <Printer size={18} />
              Imprimir QR
            </button>
          </div>

          <div className="warehouse-qr-print mt-5 grid gap-3 md:grid-cols-2">
            {trackedPackages.map((item) => (
              <WarehouseQrLabel key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Truck
                size={
                  21
                }
                className="text-emerald-400"
              />

              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                Datos de llegada
              </h2>
            </div>

            {!editingArrival ? (
              <button
                type="button"
                onClick={
                  startEditingArrival
                }
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/50 hover:text-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white"
              >
                <Pencil
                  size={
                    14
                  }
                />

                Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    savingArrival
                  }
                  onClick={
                    cancelEditingArrival
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  <X
                    size={
                      14
                    }
                  />

                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={
                    savingArrival
                  }
                  onClick={() =>
                    void saveArrivalChanges()
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
                >
                  <Save
                    size={
                      14
                    }
                  />

                  {savingArrival
                    ? 'Guardando...'
                    : 'Guardar'}
                </button>
              </div>
            )}
          </div>

          {!editingArrival ||
          !arrivalForm ? (
            <div className="mt-6 space-y-4">
              <DetailRow
                label="Carrier"
                value={
                  carrier
                }
              />

              <DetailRow
                label="Trailer / Caja"
                value={
                  reception.trailer
                }
              />

              <DetailRow
                label="Fecha"
                value={formatDate(
                  reception
                    .reception_date,
                )}
              />

              <DetailRow
                label="Hora"
                value={formatTime(
                  reception
                    .reception_time,
                )}
              />

              <DetailRow
                label="Pallets esperados"
                value={String(
                  reception
                    .pallet_count,
                )}
              />

              <DetailRow
                label="Sello"
                value={
                  reception.seal ||
                  'No capturado'
                }
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              <EditField
                label="Carrier"
              >
                <select
                  value={
                    arrivalForm
                      .carrier
                  }
                  onChange={(
                    event,
                  ) =>
                    setArrivalForm(
                      {
                        ...arrivalForm,

                        carrier:
                          event
                            .target
                            .value,
                      },
                    )
                  }
                  className="input-style"
                >
                  {carriers.map(
                    (
                      carrierOption,
                    ) => (
                      <option
                        key={
                          carrierOption
                        }
                        value={
                          carrierOption
                        }
                      >
                        {
                          carrierOption
                        }
                      </option>
                    ),
                  )}
                </select>
              </EditField>

              {arrivalForm
                .carrier ===
                'Other' && (
                <EditField
                  label="Nombre del carrier"
                >
                  <input
                    value={
                      arrivalForm
                        .otherCarrier
                    }
                    onChange={(
                      event,
                    ) =>
                      setArrivalForm(
                        {
                          ...arrivalForm,

                          otherCarrier:
                            event
                              .target
                              .value,
                        },
                      )
                    }
                    className="input-style"
                  />
                </EditField>
              )}

              <EditField
                label="Trailer / Caja"
              >
                <input
                  value={
                    arrivalForm
                      .trailer
                  }
                  onChange={(
                    event,
                  ) =>
                    setArrivalForm(
                      {
                        ...arrivalForm,

                        trailer:
                          event
                            .target
                            .value,
                      },
                    )
                  }
                  className="input-style"
                />
              </EditField>

              <div className="grid gap-4 sm:grid-cols-2">
                <EditField
                  label="Fecha"
                >
                  <input
                    type="date"
                    value={
                      arrivalForm
                        .receptionDate
                    }
                    onChange={(
                      event,
                    ) =>
                      setArrivalForm(
                        {
                          ...arrivalForm,

                          receptionDate:
                            event
                              .target
                              .value,
                        },
                      )
                    }
                    className="input-style"
                  />
                </EditField>

                <EditField
                  label="Hora"
                >
                  <input
                    type="time"
                    value={
                      arrivalForm
                        .receptionTime
                    }
                    onChange={(
                      event,
                    ) =>
                      setArrivalForm(
                        {
                          ...arrivalForm,

                          receptionTime:
                            event
                              .target
                              .value,
                        },
                      )
                    }
                    className="input-style"
                  />
                </EditField>
              </div>

              <EditField
                label="Sello"
              >
                <input
                  value={
                    arrivalForm
                      .seal
                  }
                  onChange={(
                    event,
                  ) =>
                    setArrivalForm(
                      {
                        ...arrivalForm,

                        seal:
                          event
                            .target
                            .value,
                      },
                    )
                  }
                  className="input-style"
                />
              </EditField>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
            Resumen de material
          </h2>

          <div className="mt-6 space-y-4">
            <DetailRow
              label="Pallets registrados"
              value={String(
                reception
                  .pallets
                  .length,
              )}
            />

            <DetailRow
              label="Números de parte"
              value={String(
                totalParts,
              )}
            />

            <DetailRow
              label="Cajas / bultos"
              value={String(
                totalPackages,
              )}
            />

            <DetailRow
              label="Material dañado"
              value={
                hasDamage
                  ? 'Sí'
                  : 'No'
              }
            />

            <DetailRow
              label="Evidencias registradas"
              value={String(
                totalEvidence,
              )}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
          Pallets de la recepción
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          Detalle completo del material y sus evidencias.
        </p>

        <div className="mt-6 space-y-6">
          {reception.pallets.map(
            (
              pallet,
            ) => {
              const isEditing =
                editingPalletId ===
                pallet.id

              return (
                <article
                  key={
                    pallet.id
                  }
                  className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                        Pallet{' '}
                        {
                          pallet
                            .pallet_number
                        }
                      </h3>

                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-500">
                        ID:{' '}
                        {
                          pallet.id
                        }
                      </p>
                    </div>

                    {!isEditing ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            pallet.damaged
                              ? 'rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400'
                              : 'rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400'
                          }
                        >
                          {pallet.damaged
                            ? 'Material dañado'
                            : 'Sin daños'}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            startEditingPallet(
                              pallet,
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-500/50 dark:border-slate-700 dark:text-slate-300"
                        >
                          <Pencil
                            size={
                              14
                            }
                          />

                          Editar pallet
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={
                            savingPallet
                          }
                          onClick={
                            cancelEditingPallet
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300"
                        >
                          <X
                            size={
                              14
                            }
                          />

                          Cancelar
                        </button>

                        <button
                          type="button"
                          disabled={
                            savingPallet
                          }
                          onClick={() =>
                            void savePalletChanges(
                              pallet,
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
                        >
                          <Save
                            size={
                              14
                            }
                          />

                          {savingPallet
                            ? 'Guardando...'
                            : 'Guardar cambios'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    {!isEditing ||
                    !palletEditForm ? (
                      <>
                        <div className="grid gap-5 md:grid-cols-3">
                          <DetailRow
                            label="Packing List"
                            value={
                              pallet
                                .packing_list_reference ||
                              'No capturado'
                            }
                          />

                          <DetailRow
                            label="Factura"
                            value={
                              pallet.invoice ||
                              'No capturada'
                            }
                          />

                          <DetailRow
                            label="Documentación"
                            value={
                              pallet
                                .documentation_complete
                                ? 'Completa'
                                : 'Incompleta'
                            }
                          />
                        </div>

                        {pallet.notes && (
                          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                            <p className="text-xs uppercase text-slate-600 dark:text-slate-500">
                              Observaciones
                            </p>

                            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                              {
                                pallet.notes
                              }
                            </p>
                          </div>
                        )}

                        <PartsTable
                          pallet={
                            pallet
                          }
                        />

                        <EvidenceGallery
                          pallet={
                            pallet
                          }
                        />
                      </>
                    ) : (
                      <div className="space-y-8">
                        <div className="grid gap-4 md:grid-cols-2">
                          <EditField
                            label="Packing List / Referencia"
                          >
                            <input
                              value={
                                palletEditForm
                                  .packingListReference
                              }
                              onChange={(
                                event,
                              ) =>
                                setPalletEditForm(
                                  {
                                    ...palletEditForm,

                                    packingListReference:
                                      event
                                        .target
                                        .value,
                                  },
                                )
                              }
                              className="input-style"
                            />
                          </EditField>

                          <EditField
                            label="Factura"
                          >
                            <input
                              value={
                                palletEditForm
                                  .invoice
                              }
                              onChange={(
                                event,
                              ) =>
                                setPalletEditForm(
                                  {
                                    ...palletEditForm,

                                    invoice:
                                      event
                                        .target
                                        .value,
                                  },
                                )
                              }
                              className="input-style"
                            />
                          </EditField>

                          <EditField
                            label="¿Presenta daños?"
                          >
                            <select
                              value={
                                palletEditForm
                                  .damaged
                                  ? 'Sí'
                                  : 'No'
                              }
                              onChange={(
                                event,
                              ) =>
                                setPalletEditForm(
                                  {
                                    ...palletEditForm,

                                    damaged:
                                      event
                                        .target
                                        .value ===
                                      'Sí',
                                  },
                                )
                              }
                              className="input-style"
                            >
                              <option>
                                No
                              </option>

                              <option>
                                Sí
                              </option>
                            </select>
                          </EditField>

                          <EditField
                            label="Documentación completa"
                          >
                            <select
                              value={
                                palletEditForm
                                  .documentationComplete
                                  ? 'Sí'
                                  : 'No'
                              }
                              onChange={(
                                event,
                              ) =>
                                setPalletEditForm(
                                  {
                                    ...palletEditForm,

                                    documentationComplete:
                                      event
                                        .target
                                        .value ===
                                      'Sí',
                                  },
                                )
                              }
                              className="input-style"
                            >
                              <option>
                                Sí
                              </option>

                              <option>
                                No
                              </option>
                            </select>
                          </EditField>
                        </div>

                        <EditField
                          label="Observaciones"
                        >
                          <textarea
                            value={
                              palletEditForm
                                .notes
                            }
                            onChange={(
                              event,
                            ) =>
                              setPalletEditForm(
                                {
                                  ...palletEditForm,

                                  notes:
                                    event
                                      .target
                                      .value,
                                },
                              )
                            }
                            rows={
                              3
                            }
                            className="input-style"
                          />
                        </EditField>

                        <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
                          <h4 className="font-semibold text-slate-950 dark:text-white">
                            Números de parte
                          </h4>

                          <div className="mt-4 space-y-4">
                            {palletEditForm.parts.map(
                              (
                                part,
                                index,
                              ) => (
                                <div
                                  key={
                                    index
                                  }
                                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                                >
                                  <div className="flex justify-between">
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                      Parte{' '}
                                      {index +
                                        1}
                                    </p>

                                    {palletEditForm
                                      .parts
                                      .length >
                                      1 && (
                                      <button
                                        onClick={() =>
                                          removePart(
                                            index,
                                          )
                                        }
                                        className="text-red-400"
                                      >
                                        <Trash2
                                          size={
                                            16
                                          }
                                        />
                                      </button>
                                    )}
                                  </div>

                                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                                    <EditField
                                      label="Número de parte"
                                    >
                                      <input
                                        value={
                                          part.partNumber
                                        }
                                        onChange={(
                                          event,
                                        ) =>
                                          updatePartField(
                                            index,
                                            'partNumber',
                                            event
                                              .target
                                              .value,
                                          )
                                        }
                                        className="input-style"
                                      />
                                    </EditField>

                                    <EditField
                                      label="Cantidad"
                                    >
                                      <input
                                        type="number"
                                        min="1"
                                        value={
                                          part.quantity
                                        }
                                        onChange={(
                                          event,
                                        ) =>
                                          updatePartField(
                                            index,
                                            'quantity',
                                            event
                                              .target
                                              .value,
                                          )
                                        }
                                        className="input-style"
                                      />
                                    </EditField>

                                    <EditField
                                      label="Cajas / bultos"
                                    >
                                      <input
                                        type="number"
                                        min="0"
                                        value={
                                          part.packages
                                        }
                                        onChange={(
                                          event,
                                        ) =>
                                          updatePartField(
                                            index,
                                            'packages',
                                            event
                                              .target
                                              .value,
                                          )
                                        }
                                        className="input-style"
                                      />
                                    </EditField>
                                  </div>
                                </div>
                              ),
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={
                              addPart
                            }
                            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-400"
                          >
                            <Plus
                              size={
                                15
                              }
                            />

                            Agregar número de parte
                          </button>
                        </div>

                        <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
                          <h4 className="font-semibold text-slate-950 dark:text-white">
                            Reemplazar evidencias
                          </h4>

                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-500">
                            Solo selecciona las fotografías que quieras cambiar. Las demás se conservarán.
                          </p>

                          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {(
                              [
                                'packing_list',
                                'pallet_label',
                                'pallet_photo',
                                'bol',
                                'damage',
                              ] as PhotoType[]
                            ).map(
                              (
                                type,
                              ) => (
                                <ReplacementPhotoBox
                                  key={
                                    type
                                  }
                                  type={
                                    type
                                  }
                                  selectedFile={
                                    replacementPhotos[
                                      type
                                    ]
                                  }
                                  existingPhoto={
                                    pallet.photos.find(
                                      (
                                        photo,
                                      ) =>
                                        photo.photo_type ===
                                        type,
                                    )
                                  }
                                  onChange={(
                                    files,
                                  ) =>
                                    selectReplacementPhoto(
                                      type,
                                      files,
                                    )
                                  }
                                />
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              )
            },
          )}
        </div>
      </section>

      <style>
        {`
          /* ============================================================
             RECEPTION DETAIL PAGE — LIGHT / DARK LOCAL FIX
             Estas reglas SOLO afectan esta página y no cambian el resto
             del sistema.
             ============================================================ */

          html:not(.dark) .reception-detail-page {
            color: #0b2444;
          }

          html:not(.dark) .reception-detail-page .text-white,
          html:not(.dark) .reception-detail-page .text-slate-950,
          html:not(.dark) .reception-detail-page .dark\\:text-white,
          html:not(.dark) .reception-detail-page .dark\\:text-slate-200 {
            color: #0b2444 !important;
          }

          html:not(.dark) .reception-detail-page .text-slate-200 {
            color: #0b2444 !important;
          }

          html:not(.dark) .reception-detail-page .text-slate-300,
          html:not(.dark) .reception-detail-page .text-slate-400,
          html:not(.dark) .reception-detail-page .dark\\:text-slate-300,
          html:not(.dark) .reception-detail-page .dark\\:text-slate-400 {
            color: #475569 !important;
          }

          html:not(.dark) .reception-detail-page .text-slate-500,
          html:not(.dark) .reception-detail-page .text-slate-600,
          html:not(.dark) .reception-detail-page .dark\\:text-slate-500 {
            color: #64748b !important;
          }

          html:not(.dark) .reception-detail-page .bg-white,
          html:not(.dark) .reception-detail-page .dark\\:bg-slate-900 {
            background-color: #ffffff !important;
          }

          html:not(.dark) .reception-detail-page .bg-slate-50,
          html:not(.dark) .reception-detail-page .dark\\:bg-slate-950 {
            background-color: #f8fafc !important;
          }

          html:not(.dark) .reception-detail-page .border-slate-200,
          html:not(.dark) .reception-detail-page .dark\\:border-slate-800 {
            border-color: #dfe6ee !important;
          }

          html:not(.dark) .reception-detail-page .border-slate-300,
          html:not(.dark) .reception-detail-page .dark\\:border-slate-700 {
            border-color: #cbd5e1 !important;
          }

          html:not(.dark) .reception-detail-page .dark\\:divide-slate-800 {
            border-color: #dfe6ee !important;
          }

          html.dark .reception-detail-page {
            color: #f4f7fb;
          }

          html.dark .reception-detail-page .text-slate-950,
          html.dark .reception-detail-page .dark\\:text-white,
          html.dark .reception-detail-page .text-white {
            color: #f4f7fb !important;
          }

          html.dark .reception-detail-page .text-slate-700,
          html.dark .reception-detail-page .dark\\:text-slate-300,
          html.dark .reception-detail-page .text-slate-300 {
            color: #c4d0df !important;
          }

          html.dark .reception-detail-page .text-slate-600,
          html.dark .reception-detail-page .dark\\:text-slate-400,
          html.dark .reception-detail-page .text-slate-400 {
            color: #a7b6c8 !important;
          }

          html.dark .reception-detail-page .dark\\:text-slate-500,
          html.dark .reception-detail-page .text-slate-500 {
            color: #8fa0b5 !important;
          }

          html.dark .reception-detail-page .bg-white,
          html.dark .reception-detail-page .dark\\:bg-slate-900 {
            background-color: #0e1c2f !important;
          }

          html.dark .reception-detail-page .bg-slate-50,
          html.dark .reception-detail-page .dark\\:bg-slate-950 {
            background-color: #07111f !important;
          }

          html.dark .reception-detail-page .border-slate-200,
          html.dark .reception-detail-page .dark\\:border-slate-800 {
            border-color: #20344f !important;
          }

          html.dark .reception-detail-page .border-slate-300,
          html.dark .reception-detail-page .dark\\:border-slate-700 {
            border-color: #2d4563 !important;
          }

          .input-style {
            width: 100%;
            border-radius: 0.75rem;
            border: 1px solid rgb(203 213 225);
            background: white;
            padding: 0.75rem 1rem;
            color: rgb(15 23 42);
            outline: none;
          }

          .input-style::placeholder {
            color: rgb(100 116 139);
          }

          .input-style:focus {
            border-color: rgb(16 185 129);
          }

          .dark .input-style {
            border-color: rgb(51 65 85);
            background: rgb(2 6 23);
            color: white;
          }

          .dark .input-style::placeholder {
            color: rgb(71 85 105);
          }
        `}
      </style>
    </div>
  )
}

function PartsTable({
  pallet,
}: {
  pallet:
    ReceptionPallet
}) {
  return (
    <div className="mt-8">
      <h4 className="font-semibold text-slate-950 dark:text-white">
        Números de parte
      </h4>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500">
            <tr>
              <th className="px-5 py-4">
                Número de parte
              </th>

              <th className="px-5 py-4">
                Cantidad
              </th>

              <th className="px-5 py-4">
                Cajas / bultos
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {pallet.parts.map(
              (
                part,
              ) => (
                <tr
                  key={
                    part.id
                  }
                >
                  <td className="px-5 py-4 font-medium text-slate-950 dark:text-white">
                    {
                      part.part_number
                    }
                  </td>

                  <td className="px-5 py-4 text-slate-700 dark:text-slate-300">
                    {
                      part.quantity
                    }
                  </td>

                  <td className="px-5 py-4 text-slate-700 dark:text-slate-300">
                    {part.packages ??
                      '—'}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EvidenceGallery({
  pallet,
}: {
  pallet:
    ReceptionPallet
}) {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-3">
        <Image
          size={
            20
          }
          className="text-emerald-400"
        />

        <h4 className="font-semibold text-slate-950 dark:text-white">
          Evidencias
        </h4>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {pallet.photos.map(
          (
            photo,
          ) => (
            <div
              key={
                photo.id
              }
            >
              {photo.signed_url ? (
                <a
                  href={
                    photo.signed_url
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={
                      photo.signed_url
                    }
                    alt={getPhotoLabel(
                      photo.photo_type,
                    )}
                    className="h-48 w-full rounded-xl border border-slate-800 object-cover"
                  />
                </a>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950">
                  Imagen no disponible
                </div>
              )}

              <p className="mt-2 text-center text-sm font-medium text-slate-700 dark:text-slate-300">
                {getPhotoLabel(
                  photo.photo_type,
                )}
              </p>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function ReplacementPhotoBox({
  type,
  selectedFile,
  existingPhoto,
  onChange,
}: {
  type:
    PhotoType

  selectedFile:
    File | null

  existingPhoto:
    ReceptionPhoto | undefined

  onChange:
    (
      files:
        FileList | null,
    ) => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-center text-sm font-semibold text-slate-700 dark:text-slate-300">
        {getPhotoLabel(
          type,
        )}
      </p>

      {selectedFile ? (
        <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-center text-xs text-emerald-400">
          Nueva foto seleccionada:
          <br />

          {
            selectedFile.name
          }
        </div>
      ) : existingPhoto
          ?.signed_url ? (
        <img
          src={
            existingPhoto
              .signed_url
          }
          alt=""
          className="mt-3 h-28 w-full rounded-lg object-cover"
        />
      ) : null}

      <div className="mt-3 flex justify-center gap-2">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(
              event,
            ) => {
              onChange(
                event
                  .target
                  .files,
              )

              event.target.value =
                ''
            }}
          />

          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2 py-2 text-xs font-semibold text-slate-950">
            <Camera
              size={
                14
              }
            />

            Cámara
          </span>
        </label>

        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(
              event,
            ) => {
              onChange(
                event
                  .target
                  .files,
              )

              event.target.value =
                ''
            }}
          />

          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300">
            <ImagePlus
              size={
                14
              }
            />

            Galería
          </span>
        </label>
      </div>
    </div>
  )
}

function EditField({
  label,
  children,
}: {
  label:
    string

  children:
    React.ReactNode
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-slate-600 dark:text-slate-400">
        {label}
      </span>

      {children}
    </label>
  )
}

function DetailRow({
  label,
  value,
}: {
  label:
    string

  value:
    string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-slate-600 dark:text-slate-500">
        {label}
      </span>

      <span className="text-right text-sm font-medium text-slate-950 dark:text-slate-200">
        {value}
      </span>
    </div>
  )
}

function MetricCard({
  title,
  value,
  icon:
    Icon,
}: {
  title:
    string

  value:
    string

  icon:
    React.ComponentType<{
      size?:
        number

      className?:
        string
    }>
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {title}
          </p>

          <p className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">
            {value}
          </p>
        </div>

        <div className="rounded-xl bg-slate-100 p-3 text-emerald-600 dark:bg-slate-800 dark:text-emerald-400">
          <Icon
            size={
              21
            }
          />
        </div>
      </div>
    </article>
  )
}
