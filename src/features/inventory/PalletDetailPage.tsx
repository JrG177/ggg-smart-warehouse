import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  AlertTriangle,
  ArrowLeft,
  Box,
  CalendarDays,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Package,
  ReceiptText,
  ShieldAlert,
  Truck,
} from 'lucide-react'

import {
  Link,
  useParams,
} from 'react-router-dom'

import { supabase } from '../../lib/supabase'

type InventoryStatus =
  | 'available'
  | 'reserved'
  | 'loading'
  | 'shipped'

type AdministrativeStatus =
  | 'none'
  | 'in_billing'
  | 'billed'
  | 'osd'
  | 'osd_completed'
  | 'billed_osd'

type PalletPart = {
  id: string
  part_number: string
  quantity: number
  boxes: number | null
  packages: number | null
  pallet_ref: string | null
}

type PalletPhoto = {
  id: string
  photo_type:
    | 'packing_list'
    | 'pallet_label'
    | 'pallet_photo'
    | 'bol'
    | 'damage'
  storage_path: string
  signed_url: string | null
  created_at: string
}

type ReceptionInfo = {
  id: string
  reception_number: string | null
  carrier: string
  other_carrier: string | null
  trailer: string
  seal: string | null
  reception_date: string
  reception_time: string
}

type PalletDetail = {
  id: string
  reception_id: string
  pallet_number: number
  inventory_status: InventoryStatus
  administrative_status: AdministrativeStatus
  location_code: string | null
  packing_list_reference: string | null
  invoice: string | null
  damaged: boolean
  notes: string | null
  documentation_complete: boolean
  completed: boolean
  created_at: string
  receptions:
    | ReceptionInfo
    | ReceptionInfo[]
    | null
  pallet_parts: PalletPart[]
  pallet_photos: Omit<
    PalletPhoto,
    'signed_url'
  >[]
}

function getReception(
  pallet: PalletDetail,
): ReceptionInfo | null {
  if (!pallet.receptions) {
    return null
  }

  if (Array.isArray(pallet.receptions)) {
    return pallet.receptions[0] || null
  }

  return pallet.receptions
}

function getVisualPalletNumber(
  palletNumber: number,
) {
  return `PLT-${String(
    palletNumber,
  ).padStart(6, '0')}`
}

function formatDate(
  dateValue: string | null | undefined,
) {
  if (!dateValue) {
    return '—'
  }

  const date = new Date(
    `${dateValue}T12:00:00`,
  )

  if (Number.isNaN(date.getTime())) {
    return dateValue
  }

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  ).format(date)
}

function formatTime(
  timeValue: string | null | undefined,
) {
  if (!timeValue) {
    return '—'
  }

  return timeValue.slice(0, 5)
}

function getCarrierName(
  reception: ReceptionInfo | null,
) {
  if (!reception) {
    return '—'
  }

  return (
    reception.other_carrier ||
    reception.carrier ||
    '—'
  )
}

function getInventoryStatusLabel(
  status: InventoryStatus,
) {
  const labels: Record<
    InventoryStatus,
    string
  > = {
    available: 'Disponible',
    reserved: 'Reservado',
    loading: 'Cargando',
    shipped: 'Embarcado',
  }

  return labels[status]
}

function getAdministrativeStatusLabel(
  status: AdministrativeStatus,
) {
  const labels: Record<
    AdministrativeStatus,
    string
  > = {
    none: 'Sin proceso',
    in_billing: 'En facturación',
    billed: 'Facturado',
    osd: 'OS&D abierto',
    osd_completed: 'OS&D completado',
    billed_osd: 'Facturado con OS&D',
  }

  return labels[status]
}

function getInventoryStatusClasses(
  status: InventoryStatus,
) {
  if (status === 'available') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }

  if (status === 'reserved') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  }

  if (status === 'loading') {
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
  }

  return 'border-purple-500/30 bg-purple-500/10 text-purple-300'
}

function getAdministrativeStatusClasses(
  status: AdministrativeStatus,
) {
  if (status === 'billed') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }

  if (status === 'in_billing') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  }

  if (
    status === 'osd' ||
    status === 'billed_osd'
  ) {
    return 'border-red-500/30 bg-red-500/10 text-red-300'
  }

  if (status === 'osd_completed') {
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
  }

  return 'border-slate-700 bg-slate-800 text-slate-300'
}

function getPhotoLabel(
  photoType: PalletPhoto['photo_type'],
) {
  const labels: Record<
    PalletPhoto['photo_type'],
    string
  > = {
    packing_list: 'Packing List',
    pallet_label: 'Etiqueta del pallet',
    pallet_photo: 'Fotografía del pallet',
    bol: 'BOL',
    damage: 'Daño',
  }

  return labels[photoType]
}

export function PalletDetailPage() {
  const { id } = useParams<{
    id: string
  }>()

  const [pallet, setPallet] =
    useState<PalletDetail | null>(null)

  const [photos, setPhotos] =
    useState<PalletPhoto[]>([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  useEffect(() => {
    const loadPallet = async () => {
      if (!id) {
        setError(
          'No se encontró el identificador del pallet.',
        )
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      const {
        data,
        error: palletError,
      } = await supabase
        .from('pallets')
        .select(`
          id,
          reception_id,
          pallet_number,
          inventory_status,
          administrative_status,
          location_code,
          packing_list_reference,
          invoice,
          damaged,
          notes,
          documentation_complete,
          completed,
          created_at,
          receptions (
            id,
            reception_number,
            carrier,
            other_carrier,
            trailer,
            seal,
            reception_date,
            reception_time
          ),
          pallet_parts (
            id,
            part_number,
            quantity,
            boxes,
            packages,
            pallet_ref
          ),
          pallet_photos (
            id,
            photo_type,
            storage_path,
            created_at
          )
        `)
        .eq('id', id)
        .single()

      if (palletError) {
        setError(
          `No se pudo cargar el pallet: ${palletError.message}`,
        )
        setLoading(false)
        return
      }

      const loadedPallet =
        data as PalletDetail

      setPallet(loadedPallet)

      const signedPhotos =
        await Promise.all(
          (
            loadedPallet.pallet_photos ||
            []
          ).map(
            async (photo) => {
              const {
                data: signedUrlData,
                error: signedUrlError,
              } = await supabase.storage
                .from('pallet-evidence')
                .createSignedUrl(
                  photo.storage_path,
                  60 * 60,
                )

              return {
                ...photo,
                signed_url:
                  signedUrlError
                    ? null
                    : signedUrlData.signedUrl,
              }
            },
          ),
        )

      setPhotos(signedPhotos)
      setLoading(false)
    }

    void loadPallet()
  }, [id])

  const reception = pallet
    ? getReception(pallet)
    : null

  const totals = useMemo(() => {
    if (!pallet) {
      return {
        units: 0,
        boxes: 0,
        packages: 0,
      }
    }

    return pallet.pallet_parts.reduce(
      (current, part) => ({
        units:
          current.units +
          Number(part.quantity || 0),

        boxes:
          current.boxes +
          Number(part.boxes || 0),

        packages:
          current.packages +
          Number(part.packages || 0),
      }),
      {
        units: 0,
        boxes: 0,
        packages: 0,
      },
    )
  }, [pallet])

  if (loading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="text-center">
          <LoaderCircle
            size={34}
            className="mx-auto animate-spin text-emerald-400"
          />

          <p className="mt-4 text-sm text-slate-400">
            Cargando información del pallet...
          </p>
        </div>
      </div>
    )
  }

  if (error || !pallet) {
    return (
      <div className="space-y-6">
        <Link
          to="/operations/inventory"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white"
        >
          <ArrowLeft size={17} />
          Volver a inventario
        </Link>

        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={22}
              className="mt-0.5 text-red-400"
            />

            <div>
              <h1 className="font-semibold text-red-300">
                No se pudo abrir el pallet
              </h1>

              <p className="mt-1 text-sm text-red-300/70">
                {error ||
                  'El pallet solicitado no existe.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const visualPalletNumber =
    getVisualPalletNumber(
      pallet.pallet_number,
    )

  return (
    <div className="space-y-8">
      <section>
        <Link
          to="/operations/inventory"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-white"
        >
          <ArrowLeft size={17} />
          Volver a inventario
        </Link>

        <div className="mt-5 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-300">
              <Box size={28} />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-400">
                Detalle del pallet
              </p>

              <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
                {visualPalletNumber}
              </h1>

              <p className="mt-2 text-sm text-slate-400">
                {reception?.reception_number ||
                  'Recepción sin número'}
                {' · '}
                {getCarrierName(reception)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <StatusBadge
              label={getInventoryStatusLabel(
                pallet.inventory_status,
              )}
              className={getInventoryStatusClasses(
                pallet.inventory_status,
              )}
            />

            <StatusBadge
              label={getAdministrativeStatusLabel(
                pallet.administrative_status,
              )}
              className={getAdministrativeStatusClasses(
                pallet.administrative_status,
              )}
            />

            {pallet.damaged && (
              <StatusBadge
                label="Material dañado"
                className="border-red-500/30 bg-red-500/10 text-red-300"
              />
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Package size={19} />}
          label="Unidades"
          value={String(totals.units)}
          helper={`${pallet.pallet_parts.length} número(s) de parte`}
        />

        <MetricCard
          icon={<Box size={19} />}
          label="Cajas"
          value={String(totals.boxes)}
          helper="Total registrado"
        />

        <MetricCard
          icon={<ReceiptText size={19} />}
          label="Bultos"
          value={String(totals.packages)}
          helper="Total registrado"
        />

        <MetricCard
          icon={<MapPin size={19} />}
          label="Ubicación"
          value={
            pallet.location_code ||
            'Sin asignar'
          }
          helper={
            pallet.location_code
              ? 'Ubicación actual'
              : 'Requiere asignación'
          }
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel
            title="Contenido del pallet"
            description="Números de parte y cantidades registradas"
          >
            {pallet.pallet_parts.length ===
            0 ? (
              <EmptyState message="Este pallet no tiene números de parte registrados." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left">
                    <thead className="bg-slate-950/70 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-4">
                          Número de parte
                        </th>
                        <th className="px-5 py-4">
                          Referencia
                        </th>
                        <th className="px-5 py-4 text-right">
                          Cantidad
                        </th>
                        <th className="px-5 py-4 text-right">
                          Cajas
                        </th>
                        <th className="px-5 py-4 text-right">
                          Bultos
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-800">
                      {pallet.pallet_parts.map(
                        (part) => (
                          <tr
                            key={part.id}
                            className="bg-slate-900/40"
                          >
                            <td className="px-5 py-4 font-semibold text-white">
                              {part.part_number}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-400">
                              {part.pallet_ref ||
                                '—'}
                            </td>

                            <td className="px-5 py-4 text-right">
                              {part.quantity}
                            </td>

                            <td className="px-5 py-4 text-right">
                              {part.boxes ??
                                '—'}
                            </td>

                            <td className="px-5 py-4 text-right">
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
            )}
          </Panel>

          <Panel
            title="Evidencias"
            description={`${photos.length} archivo(s) asociado(s)`}
          >
            {photos.length === 0 ? (
              <EmptyState message="No hay evidencias registradas para este pallet." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {photos.map((photo) => (
                  <article
                    key={photo.id}
                    className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
                  >
                    {photo.signed_url ? (
                      <a
                        href={photo.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block"
                      >
                        <img
                          src={photo.signed_url}
                          alt={getPhotoLabel(
                            photo.photo_type,
                          )}
                          className="h-48 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                      </a>
                    ) : (
                      <div className="flex h-48 items-center justify-center bg-slate-900 text-slate-600">
                        <ImageIcon size={30} />
                      </div>
                    )}

                    <div className="p-4">
                      <p className="font-semibold text-white">
                        {getPhotoLabel(
                          photo.photo_type,
                        )}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Evidencia de recepción
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Notas"
            description="Observaciones registradas durante la recepción"
          >
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">
                {pallet.notes ||
                  'No hay notas registradas para este pallet.'}
              </p>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title="Recepción de origen"
            description="Información de entrada al almacén"
          >
            <div className="space-y-1">
              <InformationRow
                icon={<FileText size={17} />}
                label="Recepción"
                value={
                  reception?.reception_number ||
                  '—'
                }
              />

              <InformationRow
                icon={<Truck size={17} />}
                label="Carrier"
                value={getCarrierName(
                  reception,
                )}
              />

              <InformationRow
                icon={<Truck size={17} />}
                label="Trailer"
                value={
                  reception?.trailer ||
                  '—'
                }
              />

              <InformationRow
                icon={
                  <ShieldAlert size={17} />
                }
                label="Sello de entrada"
                value={
                  reception?.seal ||
                  '—'
                }
              />

              <InformationRow
                icon={
                  <CalendarDays size={17} />
                }
                label="Fecha"
                value={formatDate(
                  reception?.reception_date,
                )}
              />

              <InformationRow
                icon={
                  <CalendarDays size={17} />
                }
                label="Hora"
                value={formatTime(
                  reception?.reception_time,
                )}
              />
            </div>

            {reception && (
              <Link
                to={`/operations/receiving/${reception.id}`}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
              >
                Ver recepción completa
              </Link>
            )}
          </Panel>

          <Panel
            title="Documentación"
            description="Control documental del pallet"
          >
            <div className="space-y-1">
              <InformationRow
                icon={
                  pallet.documentation_complete ? (
                    <CheckCircle2
                      size={17}
                      className="text-emerald-400"
                    />
                  ) : (
                    <AlertTriangle
                      size={17}
                      className="text-amber-400"
                    />
                  )
                }
                label="Documentación"
                value={
                  pallet.documentation_complete
                    ? 'Completa'
                    : 'Incompleta'
                }
              />

              <InformationRow
                icon={<FileText size={17} />}
                label="Packing List"
                value={
                  pallet.packing_list_reference ||
                  '—'
                }
              />

              <InformationRow
                icon={
                  <ReceiptText size={17} />
                }
                label="Factura registrada"
                value={
                  pallet.invoice ||
                  '—'
                }
              />

              <InformationRow
                icon={<Box size={17} />}
                label="Captura del pallet"
                value={
                  pallet.completed
                    ? 'Completada'
                    : 'Pendiente'
                }
              />
            </div>
          </Panel>

          <Panel
            title="Historial"
            description="Primer resumen operativo"
          >
            <div className="relative space-y-5 pl-7">
              <div className="absolute bottom-3 left-[7px] top-3 w-px bg-slate-800" />

              <TimelineItem
                title="Pallet registrado"
                description={`${visualPalletNumber} fue creado desde la recepción.`}
                date={formatDate(
                  pallet.created_at.slice(
                    0,
                    10,
                  ),
                )}
              />

              <TimelineItem
                title="Estado actual"
                description={getInventoryStatusLabel(
                  pallet.inventory_status,
                )}
                date="Actual"
              />

              <TimelineItem
                title="Proceso administrativo"
                description={getAdministrativeStatusLabel(
                  pallet.administrative_status,
                )}
                date="Actual"
              />
            </div>

            <p className="mt-5 rounded-xl border border-dashed border-slate-700 px-4 py-3 text-xs leading-5 text-slate-500">
              En el siguiente cambio conectaremos esta sección con una tabla real de auditoría para mostrar usuario, hora, acción y valores anteriores.
            </p>
          </Panel>
        </div>
      </section>
    </div>
  )
}

function StatusBadge({
  label,
  className,
}: {
  label: string
  className: string
}) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold',
        className,
      ].join(' ')}
    >
      {label}
    </span>
  )
}

function MetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode
  label: string
  value: string
  helper: string
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
          {icon}
        </div>

        <p className="text-sm font-medium">
          {label}
        </p>
      </div>

      <p className="mt-5 truncate text-2xl font-bold text-white">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {helper}
      </p>
    </article>
  )
}

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900">
      <header className="border-b border-slate-800 px-6 py-5">
        <h2 className="font-semibold text-white">
          {title}
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          {description}
        </p>
      </header>

      <div className="p-6">
        {children}
      </div>
    </section>
  )
}

function InformationRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-slate-800/70 py-4 last:border-b-0">
      <div className="flex items-center gap-3 text-slate-500">
        {icon}

        <span className="text-sm">
          {label}
        </span>
      </div>

      <span className="max-w-[55%] text-right text-sm font-semibold text-slate-200">
        {value}
      </span>
    </div>
  )
}

function TimelineItem({
  title,
  description,
  date,
}: {
  title: string
  description: string
  date: string
}) {
  return (
    <article className="relative">
      <div className="absolute -left-7 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-slate-900 bg-emerald-400" />

      <p className="text-sm font-semibold text-white">
        {title}
      </p>

      <p className="mt-1 text-sm text-slate-400">
        {description}
      </p>

      <p className="mt-1 text-xs text-slate-600">
        {date}
      </p>
    </article>
  )
}

function EmptyState({
  message,
}: {
  message: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  )
}