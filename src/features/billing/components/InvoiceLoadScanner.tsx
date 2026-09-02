import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  prepareZXingModule,
  readBarcodes,
} from 'zxing-wasm/reader'
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  ScanBarcode,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'

import {
  deleteInvoiceAcceptedScan,
  getInvoiceLoadScans,
  scanInvoicePackage,
  type InvoiceLoadScan,
  type InvoiceLoadScanOutcome,
} from '../../../services/invoiceLoadScanningService'

type ExpectedInvoiceLine = {
  part_number: string
  commercial_quantity: number
}

type InvoiceLoadScannerProps = {
  invoiceId: string
  invoiceNumber: string
  expectedLines: ExpectedInvoiceLine[]
  onClose: () => void
}

const SCAN_INTERVAL_MS = 240
const SUPPORTED_FORMATS = [
  'QRCode',
  'DataMatrix',
  'Code39',
  'Code128',
  'PDF417',
] as const

prepareZXingModule({
  overrides: {
    locateFile: (
      path: string,
      prefix: string,
    ) =>
      path.endsWith('.wasm')
        ? '/zxing_reader.wasm'
        : `${prefix}${path}`,
  },
})

function cleanCode(value: string) {
  return value
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
    .trim()
    .replace(/^\*|\*$/g, '')
    .toUpperCase()
}

function normalizePartNumber(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function formatQuantity(value: number) {
  return Number(value).toLocaleString(
    'es-MX',
    { maximumFractionDigits: 4 },
  )
}

function resultTone(
  result: InvoiceLoadScan['result'],
) {
  if (result === 'accepted') {
    return {
      title: 'SE VA',
      className:
        'border-emerald-400 bg-emerald-500 text-white',
      icon: CheckCircle2,
    }
  }

  if (
    result === 'duplicate' ||
    result === 'quantity_exceeded'
  ) {
    return {
      title:
        result === 'duplicate'
          ? 'DUPLICADO'
          : 'CANTIDAD COMPLETA',
      className:
        'border-amber-400 bg-amber-500 text-slate-950',
      icon: AlertTriangle,
    }
  }

  return {
    title: 'NO SE VA',
    className:
      'border-red-400 bg-red-600 text-white',
    icon: XCircle,
  }
}

function notifyResult(result: InvoiceLoadScan['result']) {
  if (result === 'accepted') {
    navigator.vibrate?.(120)
    return
  }

  if (
    result === 'duplicate' ||
    result === 'quantity_exceeded'
  ) {
    navigator.vibrate?.([180, 100, 180])
    return
  }

  navigator.vibrate?.([300, 120, 300])
}

export function InvoiceLoadScanner({
  invoiceId,
  invoiceNumber,
  expectedLines,
  onClose,
}: InvoiceLoadScannerProps) {
  const videoRef =
    useRef<HTMLVideoElement | null>(null)
  const canvasRef =
    useRef<HTMLCanvasElement | null>(null)
  const streamRef =
    useRef<MediaStream | null>(null)
  const busyRef = useRef(false)
  const candidateRef = useRef({
    value: '',
    matches: 0,
    time: 0,
  })
  const lastProcessedRef = useRef({
    value: '',
    time: 0,
  })
  const externalScanRef = useRef({
    value: '',
    time: 0,
  })

  const [scans, setScans] =
    useState<InvoiceLoadScan[]>([])
  const [latestOutcome, setLatestOutcome] =
    useState<InvoiceLoadScanOutcome | null>(null)
  const [loading, setLoading] =
    useState(true)
  const [processing, setProcessing] =
    useState(false)
  const [deletingScanId, setDeletingScanId] =
    useState<string | null>(null)
  const [cameraStatus, setCameraStatus] =
    useState<'starting' | 'ready' | 'error'>(
      'starting',
    )
  const [error, setError] = useState('')
  const [manualCode, setManualCode] =
    useState('')

  const loadScans = useCallback(async () => {
    const rows = await getInvoiceLoadScans(
      invoiceId,
    )
    setScans(rows)
  }, [invoiceId])

  useEffect(() => {
    void loadScans()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No se pudieron cargar los escaneos.',
        )
      })
      .finally(() => setLoading(false))
  }, [loadScans])

  const processCode = useCallback(
    async (rawCode: string) => {
      const cleaned = cleanCode(rawCode)

      if (!cleaned || busyRef.current) {
        return
      }

      const now = Date.now()

      if (
        cleaned === lastProcessedRef.current.value &&
        now - lastProcessedRef.current.time < 2200
      ) {
        return
      }

      busyRef.current = true
      lastProcessedRef.current = {
        value: cleaned,
        time: now,
      }
      setProcessing(true)
      setError('')

      try {
        const outcome =
          await scanInvoicePackage(
            invoiceId,
            cleaned,
          )

        setLatestOutcome(outcome)
        notifyResult(outcome.scan.result)
        await loadScans()
      } catch (scanError) {
        setError(
          scanError instanceof Error
            ? scanError.message
            : 'No se pudo procesar el paquete.',
        )
      } finally {
        setProcessing(false)
        busyRef.current = false
      }
    },
    [invoiceId, loadScans],
  )

  useEffect(() => {
    let cancelled = false
    let decoding = false
    let timer = 0

    async function scanFrame() {
      if (
        cancelled ||
        decoding ||
        busyRef.current
      ) {
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current

      if (
        !video ||
        !canvas ||
        video.readyState <
          HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return
      }

      const width = video.videoWidth
      const height = video.videoHeight

      if (!width || !height) {
        return
      }

      const cropX = Math.round(width * 0.06)
      const cropY = Math.round(height * 0.18)
      const cropWidth = Math.round(width * 0.88)
      const cropHeight = Math.round(height * 0.64)

      canvas.width = cropWidth
      canvas.height = cropHeight

      const context = canvas.getContext(
        '2d',
        { willReadFrequently: true },
      )

      if (!context) {
        return
      }

      context.drawImage(
        video,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
      )

      decoding = true

      try {
        const results = await readBarcodes(
          context.getImageData(
            0,
            0,
            cropWidth,
            cropHeight,
          ),
          {
            formats: [...SUPPORTED_FORMATS],
            tryHarder: true,
            tryRotate: true,
            tryInvert: true,
            tryDownscale: true,
            maxNumberOfSymbols: 4,
          },
        )

        const value = cleanCode(
          results[0]?.text || '',
        )

        if (value && !cancelled) {
          const candidate = candidateRef.current
          const candidateNow = Date.now()
          const matches =
            candidate.value === value &&
            candidateNow - candidate.time < 1800
              ? candidate.matches + 1
              : 1

          candidateRef.current = {
            value,
            matches,
            time: candidateNow,
          }

          if (matches >= 2) {
            candidateRef.current = {
              value: '',
              matches: 0,
              time: 0,
            }
            await processCode(value)
          }
        }
      } catch {
        // Los frames sin lectura son normales mientras se apunta la cámara.
      } finally {
        decoding = false
      }
    }

    void navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then(async (stream) => {
        if (cancelled) {
          stream
            .getTracks()
            .forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        const video = videoRef.current

        if (!video) {
          return
        }

        video.srcObject = stream
        await video.play()

        const track = stream.getVideoTracks()[0]

        try {
          await track.applyConstraints({
            advanced: [
              {
                focusMode: 'continuous',
              } as MediaTrackConstraintSet,
            ],
          })
        } catch {
          // No todos los celulares exponen el enfoque continuo.
        }

        setCameraStatus('ready')
        timer = window.setInterval(
          () => void scanFrame(),
          SCAN_INTERVAL_MS,
        )
      })
      .catch((cameraError) => {
        if (cancelled) {
          return
        }

        setCameraStatus('error')
        setError(
          cameraError instanceof Error &&
            cameraError.name === 'NotAllowedError'
            ? 'Permite el acceso a la cámara. También puedes escribir el código manualmente.'
            : 'No se pudo abrir la cámara. Usa la captura manual para esta prueba.',
        )
      })

    return () => {
      cancelled = true
      window.clearInterval(timer)
      streamRef.current
        ?.getTracks()
        .forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [processCode])

  useEffect(() => {
    function handleExternalScanner(
      event: KeyboardEvent,
    ) {
      const element =
        event.target as HTMLElement | null
      const isEditing =
        element?.tagName === 'INPUT' ||
        element?.tagName === 'TEXTAREA' ||
        element?.tagName === 'SELECT'

      if (isEditing) {
        return
      }

      if (
        event.key === 'Enter' ||
        event.key === 'Tab'
      ) {
        const value =
          externalScanRef.current.value
        externalScanRef.current = {
          value: '',
          time: 0,
        }

        if (value) {
          event.preventDefault()
          void processCode(value)
        }

        return
      }

      if (
        event.key.length !== 1 ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) {
        return
      }

      const now = Date.now()

      externalScanRef.current = {
        value:
          now - externalScanRef.current.time > 120
            ? event.key
            : externalScanRef.current.value + event.key,
        time: now,
      }
    }

    window.addEventListener(
      'keydown',
      handleExternalScanner,
    )

    return () =>
      window.removeEventListener(
        'keydown',
        handleExternalScanner,
      )
  }, [processCode])

  const progressRows = useMemo(() => {
    const expected =
      new Map<string, {
        partNumber: string
        quantity: number
      }>()

    expectedLines.forEach((line) => {
      const key = normalizePartNumber(
        line.part_number,
      )

      if (!key) {
        return
      }

      const current = expected.get(key)

      expected.set(key, {
        partNumber:
          current?.partNumber ||
          line.part_number.trim().toUpperCase(),
        quantity:
          (current?.quantity || 0) +
          Number(line.commercial_quantity || 0),
      })
    })

    const accepted = scans.filter(
      (scan) => scan.result === 'accepted',
    )

    return Array.from(expected.entries())
      .map(([key, item]) => {
        const scanned = accepted
          .filter(
            (scan) =>
              normalizePartNumber(
                scan.part_number || '',
              ) === key,
          )
          .reduce(
            (total, scan) =>
              total + Number(scan.quantity || 0),
            0,
          )

        return {
          key,
          partNumber: item.partNumber,
          expected: item.quantity,
          scanned,
          remaining: Math.max(
            0,
            item.quantity - scanned,
          ),
        }
      })
      .sort(
        (first, second) =>
          second.remaining - first.remaining ||
          first.partNumber.localeCompare(
            second.partNumber,
            undefined,
            { numeric: true },
          ),
      )
  }, [expectedLines, scans])

  const acceptedScans = scans.filter(
    (scan) => scan.result === 'accepted',
  )
  const rejectedScans = scans.filter(
    (scan) => scan.result !== 'accepted',
  )
  const completedParts = progressRows.filter(
    (row) => row.remaining <= 0,
  ).length
  const invoiceComplete =
    progressRows.length > 0 &&
    completedParts === progressRows.length

  async function removeAcceptedScan(
    scan: InvoiceLoadScan,
  ) {
    try {
      setDeletingScanId(scan.id)
      setError('')
      await deleteInvoiceAcceptedScan(scan.id)
      setLatestOutcome(null)
      await loadScans()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'No se pudo deshacer el escaneo.',
      )
    } finally {
      setDeletingScanId(null)
    }
  }

  const latestTone = latestOutcome
    ? resultTone(latestOutcome.scan.result)
    : null
  const LatestIcon = latestTone?.icon

  return (
    <div
      className="fixed inset-0 z-[180] overflow-y-auto bg-slate-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Agregar números de parte ${invoiceNumber}`}
    >
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-400">
              Agregar números de parte
            </p>
            <h2 className="text-xl font-bold">
              {invoiceNumber}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700"
            aria-label="Cerrar verificación"
          >
            <X size={22} />
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 p-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="relative aspect-[4/3] bg-black sm:aspect-video">
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              <canvas
                ref={canvasRef}
                className="hidden"
                aria-hidden="true"
              />
              <div className="pointer-events-none absolute inset-x-[7%] top-1/2 h-[64%] -translate-y-1/2 rounded-2xl border-4 border-emerald-400 shadow-[0_0_0_999px_rgba(2,6,23,0.48)]" />

              {cameraStatus === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80">
                  <LoaderCircle
                    className="mr-2 animate-spin"
                    size={24}
                  />
                  Abriendo cámara…
                </div>
              )}

              {processing && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 text-lg font-bold">
                  <LoaderCircle
                    className="mr-2 animate-spin"
                    size={26}
                  />
                  Verificando paquete…
                </div>
              )}
            </div>

            <div className="space-y-3 p-4">
              <p className="flex items-start gap-2 text-sm text-slate-300">
                <ScanBarcode
                  className="mt-0.5 shrink-0 text-emerald-400"
                  size={19}
                />
                Escanea el código P del número de parte. También puedes usar el QR de GGG o el código único 3S/4S cuando estén disponibles.
              </p>

              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void processCode(manualCode)
                  setManualCode('')
                }}
              >
                <input
                  value={manualCode}
                  onChange={(event) =>
                    setManualCode(event.target.value)
                  }
                  placeholder="Prueba manual: P580-0731"
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={
                    processing ||
                    !manualCode.trim()
                  }
                  className="rounded-xl bg-emerald-500 px-4 font-bold text-slate-950 disabled:opacity-40"
                >
                  Probar
                </button>
              </form>

              {error && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}
            </div>
          </div>

          {latestOutcome && latestTone && LatestIcon && (
            <div
              className={[
                'rounded-2xl border-4 p-6 text-center shadow-2xl',
                latestTone.className,
              ].join(' ')}
            >
              <LatestIcon
                className="mx-auto"
                size={54}
              />
              <p className="mt-2 text-3xl font-black">
                {latestTone.title}
              </p>
              <p className="mt-2 text-lg font-bold">
                {latestOutcome.scan.message}
              </p>

              {latestOutcome.scan.part_number && (
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-xl bg-black/15 p-2">
                    <p className="opacity-75">Factura</p>
                    <p className="text-lg font-black">
                      {formatQuantity(
                        latestOutcome.expectedQuantity,
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl bg-black/15 p-2">
                    <p className="opacity-75">Escaneado</p>
                    <p className="text-lg font-black">
                      {formatQuantity(
                        latestOutcome.scannedQuantity,
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl bg-black/15 p-2">
                    <p className="opacity-75">Pendiente</p>
                    <p className="text-lg font-black">
                      {formatQuantity(
                        latestOutcome.remainingQuantity,
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div
            className={[
              'rounded-2xl border p-4',
              invoiceComplete
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-slate-800 bg-slate-900',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">
                  Progreso de factura
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {completedParts}/{progressRows.length} partes completas
                </p>
              </div>

              {invoiceComplete && (
                <CheckCircle2
                  className="text-emerald-400"
                  size={38}
                />
              )}
            </div>

            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${progressRows.length
                    ? (completedParts / progressRows.length) * 100
                    : 0}%`,
                }}
              />
            </div>

            <p className="mt-3 text-sm text-slate-400">
              {acceptedScans.length} paquetes aceptados · {rejectedScans.length} alertas
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-4 py-3">
              <h3 className="font-bold">
                Pendientes por número de parte
              </h3>
            </div>

            <div className="max-h-80 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <LoaderCircle
                    className="mr-2 animate-spin"
                    size={20}
                  />
                  Cargando…
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Parte</th>
                      <th className="px-3 py-3 text-right">Factura</th>
                      <th className="px-3 py-3 text-right">Escaneado</th>
                      <th className="px-3 py-3 text-right">Falta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {progressRows.map((row) => (
                      <tr
                        key={row.key}
                        className={
                          row.remaining <= 0
                            ? 'bg-emerald-500/5'
                            : ''
                        }
                      >
                        <td className="px-3 py-3 font-semibold">
                          {row.partNumber}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatQuantity(row.expected)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatQuantity(row.scanned)}
                        </td>
                        <td
                          className={[
                            'px-3 py-3 text-right font-bold',
                            row.remaining <= 0
                              ? 'text-emerald-400'
                              : 'text-amber-400',
                          ].join(' ')}
                        >
                          {formatQuantity(row.remaining)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-4 py-3">
              <h3 className="font-bold">
                Escaneos aceptados
              </h3>
            </div>

            <div className="max-h-72 divide-y divide-slate-800 overflow-auto">
              {acceptedScans.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Todavía no hay paquetes aceptados.
                </p>
              ) : (
                acceptedScans.map((scan) => (
                  <div
                    key={scan.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-emerald-400">
                        {scan.part_number}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {scan.raw_code} · Cantidad {formatQuantity(scan.quantity)}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={deletingScanId === scan.id}
                      onClick={() =>
                        void removeAcceptedScan(scan)
                      }
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/30 text-red-400 disabled:opacity-40"
                      aria-label={`Deshacer ${scan.raw_code}`}
                      title="Deshacer escaneo"
                    >
                      {deletingScanId === scan.id
                        ? <LoaderCircle className="animate-spin" size={16} />
                        : <Trash2 size={16} />}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
