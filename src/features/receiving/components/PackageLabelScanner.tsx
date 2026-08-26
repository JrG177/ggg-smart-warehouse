import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser'
import {
  Barcode,
  Check,
  LoaderCircle,
  ScanBarcode,
  X,
} from 'lucide-react'
import type { QuickReceptionPackageInput } from '../../../services/quickReceivingService'

type PackageLabelScannerProps = {
  onClose: () => void
  onSave: (item: QuickReceptionPackageInput) => void
}

type ScanField = 'P' | 'K' | 'Q' | 'V' | '3S' | '4S'

type PackageDraft = {
  partNumber: string
  purchaseOrder: string
  quantity: string
  supplierCode: string
  supplierPackageId: string
  supplierPackageType: '3S' | '4S' | ''
  rawCodes: Record<string, string>
}

const EMPTY_DRAFT: PackageDraft = {
  partNumber: '',
  purchaseOrder: '',
  quantity: '',
  supplierCode: '',
  supplierPackageId: '',
  supplierPackageType: '',
  rawCodes: {},
}

const fieldLabels: Record<ScanField, string> = {
  P: 'número de parte',
  K: 'orden de compra',
  Q: 'cantidad',
  V: 'código de proveedor',
  '3S': 'ID de paquete',
  '4S': 'ID maestro',
}

function cleanRawCode(value: string) {
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

function parseLabelCode(rawValue: string) {
  const rawCode = cleanRawCode(rawValue)
  const field = (
    rawCode.startsWith('3S')
      ? '3S'
      : rawCode.startsWith('4S')
        ? '4S'
        : rawCode.slice(0, 1)
  ) as ScanField

  if (!['P', 'K', 'Q', 'V', '3S', '4S'].includes(field)) {
    throw new Error(
      `Código no reconocido: ${rawCode || 'lectura vacía'}. Apunta a P, K, Q, V, 3S o 4S.`,
    )
  }

  const value = rawCode.slice(field.length).trim()

  if (!value) {
    throw new Error(`El código ${field} no contiene información.`)
  }

  if (field === 'Q' && !/^\d+$/.test(value)) {
    throw new Error(`La cantidad escaneada no es válida: ${value}.`)
  }

  return { field, rawCode, value }
}

function applyScan(
  draft: PackageDraft,
  field: ScanField,
  rawCode: string,
  value: string,
) {
  const next: PackageDraft = {
    ...draft,
    rawCodes: {
      ...draft.rawCodes,
      [field]: rawCode,
    },
  }

  if (field === 'P') next.partNumber = value
  if (field === 'K') next.purchaseOrder = value
  if (field === 'Q') next.quantity = value
  if (field === 'V') next.supplierCode = value

  if (field === '3S' || field === '4S') {
    next.supplierPackageId = value
    next.supplierPackageType = field
    delete next.rawCodes[field === '3S' ? '4S' : '3S']
  }

  return next
}

export function PackageLabelScanner({
  onClose,
  onSave,
}: PackageLabelScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const draftRef = useRef<PackageDraft>(EMPTY_DRAFT)
  const lastScanRef = useRef({ value: '', time: 0 })
  const [draft, setDraft] = useState<PackageDraft>(EMPTY_DRAFT)
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'ready' | 'error'>('starting')
  const [message, setMessage] = useState('Apunta a cualquiera de los códigos de la label.')
  const [messageType, setMessageType] = useState<'neutral' | 'success' | 'error'>('neutral')

  const updateDraft = useCallback((next: PackageDraft) => {
    draftRef.current = next
    setDraft(next)
  }, [])

  const handleRawScan = useCallback((rawValue: string) => {
    const cleaned = cleanRawCode(rawValue)
    const now = Date.now()

    if (
      cleaned === lastScanRef.current.value &&
      now - lastScanRef.current.time < 1500
    ) {
      return
    }

    lastScanRef.current = { value: cleaned, time: now }

    try {
      const { field, rawCode, value } = parseLabelCode(rawValue)
      const currentRaw = draftRef.current.rawCodes[field]

      if (currentRaw && currentRaw !== rawCode) {
        setMessage(
          `Ya existe otro ${fieldLabels[field]} en este paquete. Guarda este paquete antes de escanear otra label.`,
        )
        setMessageType('error')
        return
      }

      updateDraft(applyScan(draftRef.current, field, rawCode, value))
      setMessage(`${fieldLabels[field]} capturado: ${value}`)
      setMessageType('success')
      navigator.vibrate?.(120)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo reconocer el código.',
      )
      setMessageType('error')
    }
  }, [updateDraft])

  useEffect(() => {
    let cancelled = false
    const reader = new BrowserMultiFormatReader()
    reader.possibleFormats = [
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_128,
      BarcodeFormat.PDF_417,
    ]

    void reader
      .decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        videoRef.current || undefined,
        (result) => {
          if (result && !cancelled) {
            handleRawScan(result.getText())
          }
        },
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop()
          return
        }

        controlsRef.current = controls
        setCameraStatus('ready')
      })
      .catch((error) => {
        if (cancelled) return

        setCameraStatus('error')
        setMessage(
          error instanceof Error && error.name === 'NotAllowedError'
            ? 'Permite el acceso a la cámara en Chrome para escanear.'
            : 'No se pudo abrir la cámara. Puedes capturar los datos manualmente.',
        )
        setMessageType('error')
      })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [handleRawScan])

  function setField<Key extends keyof PackageDraft>(
    key: Key,
    value: PackageDraft[Key],
  ) {
    updateDraft({ ...draftRef.current, [key]: value })
  }

  function savePackage() {
    const partNumber = draft.partNumber.trim().toUpperCase()

    if (!partNumber) {
      setMessage('Captura por lo menos el número de parte P.')
      setMessageType('error')
      return
    }

    const parsedQuantity = draft.quantity.trim()
      ? Number(draft.quantity)
      : null

    if (
      parsedQuantity !== null &&
      (!Number.isInteger(parsedQuantity) || parsedQuantity < 1)
    ) {
      setMessage('La cantidad debe ser un número entero mayor a cero.')
      setMessageType('error')
      return
    }

    onSave({
      partNumber,
      purchaseOrder: draft.purchaseOrder.trim().toUpperCase(),
      quantity: parsedQuantity,
      supplierCode: draft.supplierCode.trim().toUpperCase(),
      supplierPackageId: draft.supplierPackageId.trim().toUpperCase(),
      supplierPackageType: draft.supplierPackageType || null,
      rawCodes: draft.rawCodes,
    })

    onClose()
  }

  const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white outline-none transition focus:border-emerald-500'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/95 p-3 sm:p-6">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Nuevo paquete
            </p>
            <h2 className="text-lg font-bold text-white">Escanear label</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 text-slate-300"
            aria-label="Cerrar escáner"
          >
            <X size={21} />
          </button>
        </header>

        <div className="p-4">
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-[4/3] w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-x-[8%] top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(2,6,23,0.48)]" />
            {cameraStatus === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-slate-300">
                <LoaderCircle className="mr-2 animate-spin" size={22} />
                Abriendo cámara…
              </div>
            )}
          </div>

          <div className={[
            'mt-3 rounded-xl border px-3 py-2.5 text-sm font-semibold',
            messageType === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : messageType === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : 'border-slate-700 bg-slate-950 text-slate-400',
          ].join(' ')}>
            {message}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-300">
              Número de parte (P) <span className="text-red-400">*</span>
              <input
                value={draft.partNumber}
                onChange={(event) => setField('partNumber', event.target.value)}
                placeholder="617-1983"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-semibold text-slate-300">
              Orden de compra (K)
              <input
                value={draft.purchaseOrder}
                onChange={(event) => setField('purchaseOrder', event.target.value)}
                placeholder="5500126043"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-semibold text-slate-300">
              Cantidad (Q)
              <input
                value={draft.quantity}
                onChange={(event) => setField('quantity', event.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="1"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-semibold text-slate-300">
              Código de proveedor (V)
              <input
                value={draft.supplierCode}
                onChange={(event) => setField('supplierCode', event.target.value)}
                placeholder="P0703R1"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-semibold text-slate-300">
              Tipo de paquete
              <select
                value={draft.supplierPackageType}
                onChange={(event) => setField(
                  'supplierPackageType',
                  event.target.value as PackageDraft['supplierPackageType'],
                )}
                className={inputClass}
              >
                <option value="">Sin identificar</option>
                <option value="3S">3S · Paquete individual</option>
                <option value="4S">4S · Paquete maestro</option>
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-300">
              ID del paquete (3S/4S)
              <input
                value={draft.supplierPackageId}
                onChange={(event) => setField('supplierPackageId', event.target.value)}
                placeholder="514117174151"
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 rounded-xl border border-slate-700 px-4 font-semibold text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={savePackage}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 font-bold text-slate-950"
            >
              {draft.partNumber ? <Check size={20} /> : <ScanBarcode size={20} />}
              Agregar paquete
            </button>
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
            <Barcode className="mt-0.5 shrink-0" size={16} />
            Escanea los códigos de una sola label. Puedes capturarlos en cualquier orden y corregir los campos manualmente.
          </p>
        </div>
      </div>
    </div>
  )
}
