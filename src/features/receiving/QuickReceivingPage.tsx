import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import {
  ArrowLeft,
  Barcode,
  Boxes,
  Camera,
  Check,
  FileImage,
  FileText,
  ImageUp,
  LoaderCircle,
  Package,
  Printer,
  RotateCcw,
  ScanBarcode,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import {
  createQuickReception,
  type QuickPhotoType,
  type QuickReceptionClient,
  type QuickReceptionPackageInput,
  type QuickReceptionProgress,
  type WarehousePackage,
} from '../../services/quickReceivingService'
import { PackageLabelScanner } from './components/PackageLabelScanner'
import './warehouseQrPrint.css'

type PhotoRequirement = {
  type: QuickPhotoType
  label: string
  Icon: typeof FileText
}

type PhotoPreviewProps = {
  file: File
  disabled: boolean
  onRemove: () => void
}

type CapturedPackage = QuickReceptionPackageInput & {
  localId: string
}

type WarehouseQrLabelProps = {
  item: WarehousePackage
}

const requirements: Record<
  QuickReceptionClient,
  PhotoRequirement[]
> = {
  UPS: [
    { type: 'invoice', label: 'Factura', Icon: FileText },
    { type: 'labels', label: 'Labels', Icon: Tag },
    { type: 'boxes', label: 'Cajas', Icon: Boxes },
    {
      type: 'part_number_label',
      label: 'Etiqueta Número de Parte',
      Icon: Tag,
    },
  ],
  A1: [
    { type: 'invoice', label: 'Factura', Icon: FileText },
    { type: 'boxes', label: 'Cajas', Icon: Boxes },
    { type: 'labels', label: 'Labels', Icon: Tag },
    { type: 'pallet', label: 'Tarima', Icon: Package },
  ],
}

const MAX_FILE_SIZE = 15 * 1024 * 1024

function WarehouseQrLabel({ item }: WarehouseQrLabelProps) {
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    let active = true

    void QRCode.toDataURL(`GGGPKG:${item.tracking_code}`, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    }).then((url) => {
      if (active) setQrUrl(url)
    })

    return () => {
      active = false
    }
  }, [item.tracking_code])

  return (
    <article className="warehouse-qr-label break-inside-avoid rounded-xl border-2 border-slate-900 bg-white p-3 text-slate-950">
      <div className="flex items-start gap-3">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center bg-white">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt={`QR ${item.tracking_code}`}
              className="h-32 w-32"
            />
          ) : (
            <LoaderCircle className="animate-spin text-slate-500" size={24} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider">GGG · Paquete</p>
          <p className="mt-1 font-mono text-lg font-black">{item.tracking_code}</p>
          <dl className="mt-2 space-y-1 text-xs">
            <div><dt className="inline font-bold">Parte: </dt><dd className="inline">{item.part_number}</dd></div>
            {item.quantity !== null && (
              <div><dt className="inline font-bold">Cantidad: </dt><dd className="inline">{item.quantity}</dd></div>
            )}
            {item.purchase_order && (
              <div><dt className="inline font-bold">PO: </dt><dd className="inline">{item.purchase_order}</dd></div>
            )}
            {item.supplier_package_id && (
              <div><dt className="inline font-bold">Paquete proveedor: </dt><dd className="inline">{item.supplier_package_type || ''}{item.supplier_package_id}</dd></div>
            )}
          </dl>
        </div>
      </div>
    </article>
  )
}

function getProgressLabel(
  progress: QuickReceptionProgress | null,
  totalPhotoCount: number,
) {
  if (!progress) {
    return `Guardando ${totalPhotoCount} fotografías…`
  }

  if (progress.phase === 'optimizing') {
    return `Optimizando ${progress.completed} de ${progress.total}…`
  }

  if (progress.phase === 'uploading') {
    return `Subiendo ${progress.completed} de ${progress.total}…`
  }

  return 'Finalizando recepción…'
}

function getProgressPercent(progress: QuickReceptionProgress | null) {
  if (!progress || progress.total === 0) return 0

  const totalSteps = progress.total * 2 + 1
  const completedSteps =
    progress.phase === 'optimizing'
      ? progress.completed
      : progress.phase === 'uploading'
        ? progress.total + progress.completed
        : totalSteps

  return Math.min(
    100,
    Math.round((completedSteps / totalSteps) * 100),
  )
}

function PhotoPreview({ file, disabled, onRemove }: PhotoPreviewProps) {
  const [previewUrl] = useState(() => URL.createObjectURL(file))

  useEffect(
    () => () => URL.revokeObjectURL(previewUrl),
    [previewUrl],
  )

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
      <img
        src={previewUrl}
        alt={file.name}
        className="aspect-square w-full object-cover"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/90 text-white shadow-lg transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Eliminar ${file.name}`}
        title="Eliminar foto"
      >
        <X size={17} />
      </button>
      <p className="truncate px-2 py-2 text-xs text-slate-400">
        {file.name}
      </p>
    </div>
  )
}

export function QuickReceivingPage() {
  const navigate = useNavigate()
  const [client, setClient] =
    useState<QuickReceptionClient>('A1')
  const [photos, setPhotos] = useState<
    Partial<Record<QuickPhotoType, File[]>>
  >({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] =
    useState<QuickReceptionProgress | null>(null)
  const [error, setError] = useState('')
  const [successReference, setSuccessReference] = useState('')
  const [observations, setObservations] = useState('')
  const [packages, setPackages] = useState<CapturedPackage[]>([])
  const [savedPackages, setSavedPackages] = useState<WarehousePackage[]>([])
  const [scannerOpen, setScannerOpen] = useState(false)

  const clientRequirements = requirements[client]

  const completedCount = useMemo(
    () =>
      clientRequirements.filter(
        (requirement) => (photos[requirement.type]?.length ?? 0) > 0,
      ).length,
    [clientRequirements, photos],
  )

  const totalPhotoCount = useMemo(
    () =>
      clientRequirements.reduce(
        (total, requirement) =>
          total + (photos[requirement.type]?.length ?? 0),
        0,
      ),
    [clientRequirements, photos],
  )

  const isComplete =
    completedCount === clientRequirements.length
  const progressPercent = getProgressPercent(progress)

  function changeClient(nextClient: QuickReceptionClient) {
    const allowed = new Set(
      requirements[nextClient].map((requirement) => requirement.type),
    )

    setClient(nextClient)
    setPhotos((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([type]) =>
          allowed.has(type as QuickPhotoType),
        ),
      ),
    )
    setError('')
    setSuccessReference('')
    setObservations('')
    setPackages([])
    setSavedPackages([])
    setScannerOpen(false)
  }

  function selectPhotos(type: QuickPhotoType, selected?: FileList | null) {
    const files = Array.from(selected ?? [])
    if (files.length === 0) return

    if (files.some((file) => !file.type.startsWith('image/'))) {
      setError('Selecciona únicamente imágenes válidas.')
      return
    }

    if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      setError('Cada fotografía debe pesar menos de 15 MB.')
      return
    }

    setError('')
    setPhotos((current) => ({
      ...current,
      [type]: [...(current[type] ?? []), ...files],
    }))
  }

  function removePhoto(type: QuickPhotoType, index: number) {
    setPhotos((current) => {
      const nextFiles = (current[type] ?? []).filter(
        (_, fileIndex) => fileIndex !== index,
      )

      if (nextFiles.length === 0) {
        const next = { ...current }
        delete next[type]
        return next
      }

      return {
        ...current,
        [type]: nextFiles,
      }
    })
  }

  function resetForm() {
    setPhotos({})
    setObservations('')
    setPackages([])
    setSavedPackages([])
    setScannerOpen(false)
    setError('')
    setSuccessReference('')
  }

  function addPackage(item: QuickReceptionPackageInput) {
    const duplicate = packages.some((current) => {
      if (
        item.supplierPackageId &&
        current.supplierPackageId
      ) {
        return (
          current.supplierPackageId === item.supplierPackageId &&
          current.supplierPackageType === item.supplierPackageType
        )
      }

      return (
        current.partNumber === item.partNumber &&
        current.purchaseOrder === item.purchaseOrder &&
        current.quantity === item.quantity
      )
    })

    if (duplicate) {
      setError('Ese paquete ya fue agregado a esta recepción.')
      return
    }

    setError('')
    setPackages((current) => [
      ...current,
      {
        ...item,
        localId: crypto.randomUUID(),
      },
    ])
  }

  function removePackage(localId: string) {
    setPackages((current) =>
      current.filter((item) => item.localId !== localId),
    )
  }

  async function completeReception() {
    if (!isComplete || submitting) return

    setSubmitting(true)
    setError('')
    setProgress({
      phase: 'optimizing',
      completed: 0,
      total: totalPhotoCount,
    })

    try {
      const result = await createQuickReception(
        client,
        clientRequirements.flatMap((requirement) =>
          (photos[requirement.type] ?? []).map((file) => ({
            type: requirement.type,
            file,
          })),
        ),
        client === 'UPS' ? observations : undefined,
        (nextProgress) => setProgress(nextProgress),
        packages.map((item) => ({
          partNumber: item.partNumber,
          purchaseOrder: item.purchaseOrder,
          quantity: item.quantity,
          supplierCode: item.supplierCode,
          supplierPackageId: item.supplierPackageId,
          supplierPackageType: item.supplierPackageType,
          rawCodes: item.rawCodes,
        })),
      )

      setSavedPackages(result.packages)
      setSuccessReference(result.reference_number)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'No se pudo guardar la recepción rápida.',
      )
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  if (successReference) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center">
        <section className="w-full rounded-3xl border border-emerald-500/30 bg-slate-900 p-6 text-center shadow-xl sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-slate-950">
            <Check size={34} />
          </div>

          <h1 className="mt-5 text-2xl font-bold text-white">
            Recepción completada
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Las {totalPhotoCount} fotografías de {client} se guardaron correctamente.
            {savedPackages.length > 0 && (
              <> También se registraron {savedPackages.length} {savedPackages.length === 1 ? 'paquete' : 'paquetes'}.</>
            )}
          </p>

          <p className="mt-5 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-lg font-semibold text-emerald-400">
            {successReference}
          </p>

          <div className={[
            'mt-6 grid gap-3',
            savedPackages.length > 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
          ].join(' ')}>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              <RotateCcw size={19} />
              Nueva recepción rápida
            </button>

            <button
              type="button"
              onClick={() => navigate('/operations/receiving/quick/history')}
              className="min-h-12 rounded-xl border border-slate-700 px-5 font-semibold text-slate-300 transition hover:bg-slate-800"
            >
              Ver historial rápido
            </button>

            {savedPackages.length > 0 && (
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 px-5 font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                <Printer size={19} />
                Imprimir QR
              </button>
            )}
          </div>

          {savedPackages.length > 0 && (
            <div className="mt-8 border-t border-slate-800 pt-6 text-left">
              <div className="mb-4 flex items-center gap-2 text-slate-300">
                <Barcode size={20} className="text-emerald-400" />
                <h2 className="font-bold">Etiquetas internas de GGG</h2>
              </div>
              <div className="warehouse-qr-print grid gap-3 sm:grid-cols-2">
                {savedPackages.map((item) => (
                  <WarehouseQrLabel key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl pb-28 sm:pb-8">
      {scannerOpen && (
        <PackageLabelScanner
          onClose={() => setScannerOpen(false)}
          onSave={addPackage}
        />
      )}

      <header className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/operations/receiving')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:bg-slate-800"
          aria-label="Volver a recepciones"
        >
          <ArrowLeft size={22} />
        </button>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Aduana Project 2.0
          </p>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            Recepción rápida
          </h1>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="border-b border-slate-800 p-4 sm:p-5">
          <label className="block text-sm font-semibold text-slate-300" htmlFor="quick-client">
            Cliente
          </label>
          <select
            id="quick-client"
            value={client}
            disabled={submitting}
            onChange={(event) =>
              changeClient(event.target.value as QuickReceptionClient)
            }
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-base font-semibold outline-none transition focus:border-emerald-500"
          >
            <option value="A1">A1</option>
            <option value="UPS">UPS</option>
          </select>
        </div>

        <div className="border-b border-slate-800 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ScanBarcode size={20} className="text-emerald-400" />
                <h2 className="font-semibold text-white">Paquetes rastreables</h2>
                <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-300">
                  Piloto
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Escanea los códigos P, K, Q, V y 3S/4S de cada label. Por ahora es opcional.
              </p>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={() => setScannerOpen(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              <ScanBarcode size={20} />
              Nuevo paquete
            </button>
          </div>

          {packages.length > 0 && (
            <div className="mt-4 space-y-2">
              {packages.map((item, index) => (
                <article
                  key={item.localId}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 p-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 font-bold text-emerald-400">
                    {index + 1}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-mono font-bold text-white">
                      {item.partNumber}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {item.quantity !== null ? `Cantidad ${item.quantity}` : 'Cantidad pendiente'}
                      {item.purchaseOrder ? ` · PO ${item.purchaseOrder}` : ''}
                      {item.supplierPackageId
                        ? ` · ${item.supplierPackageType || ''}${item.supplierPackageId}`
                        : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => removePackage(item.localId)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                    aria-label={`Eliminar paquete ${item.partNumber}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-semibold text-white">Fotos obligatorias</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Agrega una o más fotos claras de cada elemento.
            </p>
          </div>

          <div className="text-right">
            <span className="rounded-full bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-300">
              {completedCount} de {clientRequirements.length}
            </span>
            <p className="mt-2 text-xs text-slate-500">
              {totalPhotoCount} {totalPhotoCount === 1 ? 'foto' : 'fotos'}
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-800">
          {clientRequirements.map(({ type, label, Icon }) => {
            const files = photos[type] ?? []
            const hasPhotos = files.length > 0

            return (
              <article key={type} className="p-4 sm:px-5">
                <div className="grid grid-cols-[auto_1fr] items-center gap-3 sm:grid-cols-[auto_1fr_auto]">
                  <div className={[
                    'flex h-11 w-11 items-center justify-center rounded-xl',
                    hasPhotos
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-slate-800 text-slate-400',
                  ].join(' ')}>
                    {hasPhotos ? <Check size={22} /> : <Icon size={22} />}
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-semibold text-white">
                      {label} <span className="text-red-400">*</span>
                    </h3>
                    <p className={[
                      'text-xs',
                      hasPhotos ? 'text-emerald-400' : 'text-slate-500',
                    ].join(' ')}>
                      {hasPhotos
                        ? `${files.length} ${files.length === 1 ? 'foto agregada' : 'fotos agregadas'}`
                        : 'Agrega por lo menos una foto'}
                    </p>
                  </div>

                  <div className="col-span-2 grid grid-cols-[1fr_auto] gap-2 sm:col-span-1 sm:flex">
                    <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                      <Camera size={19} />
                      Tomar otra foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={submitting}
                        onChange={(event) => {
                          selectPhotos(type, event.target.files)
                          event.target.value = ''
                        }}
                        className="sr-only"
                      />
                    </label>

                    <label
                      className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-slate-700 text-slate-300 transition hover:bg-slate-800"
                      title="Seleccionar varias desde el dispositivo"
                      aria-label={`Subir fotos de ${label}`}
                    >
                      {hasPhotos ? <FileImage size={20} /> : <ImageUp size={20} />}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={submitting}
                        onChange={(event) => {
                          selectPhotos(type, event.target.files)
                          event.target.value = ''
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                {hasPhotos && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {files.map((file, index) => (
                      <PhotoPreview
                        key={`${file.name}-${file.lastModified}-${index}`}
                        file={file}
                        disabled={submitting}
                        onRemove={() => removePhoto(type, index)}
                      />
                    ))}
                  </div>
                )}
              </article>
            )
          })}
        </div>

        {client === 'UPS' && (
          <div className="border-t border-slate-800 p-4 sm:p-5">
            <label
              htmlFor="quick-observations"
              className="block text-sm font-semibold text-slate-300"
            >
              Observaciones
            </label>
            <textarea
              id="quick-observations"
              value={observations}
              disabled={submitting}
              maxLength={1000}
              rows={4}
              onChange={(event) => setObservations(event.target.value)}
              placeholder="Escribe aquí cualquier observación de la recepción…"
              className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-1 text-right text-xs text-slate-500">
              {observations.length}/1000
            </p>
          </div>
        )}
      </section>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-slate-900/95 p-4 backdrop-blur lg:static lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0">
        {submitting && (
          <div className="mx-auto mb-3 max-w-3xl">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-semibold text-slate-300">
              <span>
                {getProgressLabel(progress, totalPhotoCount)}
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={!isComplete || submitting}
          onClick={() => void completeReception()}
          className="mx-auto flex min-h-14 w-full max-w-3xl items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          {submitting ? (
            <>
              <LoaderCircle size={21} className="animate-spin" />
              {getProgressLabel(progress, totalPhotoCount)}
            </>
          ) : (
            <>
              <Check size={21} />
              Completar recepción ({totalPhotoCount})
            </>
          )}
        </button>
      </div>
    </div>
  )
}