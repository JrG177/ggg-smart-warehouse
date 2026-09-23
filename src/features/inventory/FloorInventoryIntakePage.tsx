import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { CheckCircle2, ImagePlus, Minus, PackagePlus, RotateCcw, ScanBarcode, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PackageLabelScanner } from '../receiving/components/PackageLabelScanner'
import { createReception } from '../../services/receivingService'
import { createNormalReceptionPackages } from '../../services/normalReceptionPackageService'
import type { QuickReceptionPackageInput } from '../../services/quickReceivingService'
import {
  cleanBarcodeValue,
  inferRawPartAndQuantity,
  parseIndustrialLabelPayload,
  parsePositiveQuantity,
} from '../../utils/industrialLabelParser'

type IntakeLine = {
  partNumber: string
  scannedBultos: number
  bultos: number
  quantity: number
  condition: 'good' | 'damaged' | 'missing_packing'
  exceptionNotes: string
}

type EvidencePhoto = { file: File; preview: string }

const carriers = ['XPO', 'EZI', 'MTY', 'Other']

function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function localTime() {
  return new Date().toTimeString().slice(0, 5)
}

export function FloorInventoryIntakePage({ onSaved }: { onSaved?: () => void }) {
  const navigate = useNavigate()
  const [receptionType, setReceptionType] = useState<'normal' | ''>('')
  const [carrier, setCarrier] = useState('')
  const [otherCarrier, setOtherCarrier] = useState('')
  const [lines, setLines] = useState<IntakeLine[]>([])
  const [scanHistory, setScanHistory] = useState<string[]>([])
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerInput, setScannerInput] = useState('')
  const [scannerMessage, setScannerMessage] = useState('')
  const [scanTarget, setScanTarget] = useState<'P' | 'Q'>('P')
  const [pendingPartNumber, setPendingPartNumber] = useState('')
  const scannerInputRef = useRef<HTMLInputElement | null>(null)
  const externalScanRef = useRef({ value: '', time: 0 })
  const scannerIdleTimerRef = useRef<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStage, setSaveStage] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [palletPhotos, setPalletPhotos] = useState<EvidencePhoto[]>([])
  const [packingListPhotos, setPackingListPhotos] = useState<EvidencePhoto[]>([])
  const [osdPhotos, setOsdPhotos] = useState<EvidencePhoto[]>([])

  const totalBultos = useMemo(
    () => lines.reduce((total, line) => total + line.bultos, 0),
    [lines],
  )
  const totalQuantity = useMemo(
    () => lines.reduce((total, line) => total + line.quantity, 0),
    [lines],
  )

  function addScan(item: QuickReceptionPackageInput) {
    const partNumber = item.partNumber.trim().toUpperCase()
    if (!partNumber) return

    const scannedQuantity = Math.max(1, Math.floor(Number(item.quantity || 1)))
    setScanHistory((current) => [...current, `${partNumber}:${scannedQuantity}`])
    setLines((current) => {
      const existing = current.find((line) => line.partNumber === partNumber)
      if (!existing) {
        return [...current, { partNumber, scannedBultos: 1, bultos: 1, quantity: scannedQuantity, condition: 'good', exceptionNotes: '' }]
      }
      return current.map((line) => line.partNumber === partNumber
        ? { ...line, scannedBultos: line.scannedBultos + 1, bultos: line.bultos + 1, quantity: line.quantity + scannedQuantity }
        : line)
    })
  }

  function submitHardwareScan(rawValue: string) {
    if (scannerIdleTimerRef.current !== null) {
      window.clearTimeout(scannerIdleTimerRef.current)
      scannerIdleTimerRef.current = null
    }
    const cleaned = cleanBarcodeValue(rawValue)

    if (!cleaned) return

    const payloadTokens = parseIndustrialLabelPayload(rawValue)
    if (payloadTokens.length > 1) {
      const explicitPart = payloadTokens.find(
        (token) => token.field === 'P' && token.value,
      )
      const explicitQuantity = payloadTokens.find(
        (token) =>
          token.field === 'Q' &&
          parsePositiveQuantity(token.value) !== null,
      )
      const inferred = inferRawPartAndQuantity(payloadTokens)
      const partNumber =
        explicitPart?.value || inferred?.partNumber || ''
      const quantity = explicitQuantity
        ? parsePositiveQuantity(explicitQuantity.value)
        : inferred?.quantity ?? null

      if (!partNumber || quantity === null) {
        setScannerInput('')
        setScannerMessage(
          'La label fue leída, pero no se pudo distinguir Parte y Cantidad. Apunta solamente a esos dos barcodes o captúralos por separado.',
        )
        navigator.vibrate?.([180, 80, 180])
        window.setTimeout(
          () => scannerInputRef.current?.focus(),
          0,
        )
        return
      }

      addScan({
        partNumber,
        purchaseOrder: '',
        quantity,
        supplierCode: '',
        supplierPackageId: '',
        supplierPackageType: null,
        rawCodes: Object.fromEntries(
          payloadTokens.map((token, index) => [
            `${token.field}_${index + 1}`,
            token.rawCode,
          ]),
        ),
      })
      setScannerInput('')
      setScannerMessage(
        `Parte ${partNumber}, cantidad ${quantity}, agregada en una lectura.`,
      )
      setPendingPartNumber('')
      setScanTarget('P')
      navigator.vibrate?.([80, 40, 80])
      window.setTimeout(
        () => scannerInputRef.current?.focus(),
        0,
      )
      return
    }

    if (scanTarget === 'P') {
      const hasKnownNonPartPrefix =
        cleaned.startsWith('Q') ||
        cleaned.startsWith('K') ||
        cleaned.startsWith('V') ||
        cleaned.startsWith('3S') ||
        cleaned.startsWith('4S')

      if (hasKnownNonPartPrefix) {
        setScannerInput('')
        setScannerMessage(`Código ${cleaned} ignorado. Apunta al código del número de parte.`)
        navigator.vibrate?.(180)
        window.setTimeout(() => scannerInputRef.current?.focus(), 0)
        return
      }

      // Some daily supplier labels encode the part directly (2128303 or
      // 1136-2618) instead of using the AIAG P prefix.
      const partNumber = (cleaned.startsWith('P')
        ? cleaned.slice(1)
        : cleaned).trim()
      if (!partNumber) {
        setScannerMessage('La lectura no contiene un número de parte.')
        return
      }

      setPendingPartNumber(partNumber)
      setScanTarget('Q')
      setScannerInput('')
      setScannerMessage(`Parte ${partNumber} capturada. Ahora escanea Q.`)
      navigator.vibrate?.(100)
      window.setTimeout(() => scannerInputRef.current?.focus(), 0)
      return
    }

    const quantityText = (cleaned.startsWith('Q')
      ? cleaned.slice(1)
      : cleaned).trim()

    if (!/^\d+$/.test(quantityText)) {
      setScannerInput('')
      setScannerMessage(`Código ${cleaned} ignorado. Para ${pendingPartNumber} escanea la cantidad.`)
      navigator.vibrate?.(180)
      window.setTimeout(() => scannerInputRef.current?.focus(), 0)
      return
    }

    const quantity = Number(quantityText)
    if (!pendingPartNumber || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) {
      setScannerMessage('La lectura no contiene una cantidad válida.')
      return
    }

    addScan({
      partNumber: pendingPartNumber,
      purchaseOrder: '',
      quantity,
      supplierCode: '',
      supplierPackageId: '',
      supplierPackageType: null,
      rawCodes: { P: pendingPartNumber, Q: cleaned },
    })
    setScannerInput('')
    setScannerMessage(`Parte ${pendingPartNumber}, cantidad ${quantity}, agregada.`)
    setPendingPartNumber('')
    setScanTarget('P')
    navigator.vibrate?.([80, 40, 80])
    window.setTimeout(() => scannerInputRef.current?.focus(), 0)
  }

  function scheduleHardwareScan(rawValue: string) {
    if (scannerIdleTimerRef.current !== null) window.clearTimeout(scannerIdleTimerRef.current)
    if (rawValue.trim().length < 2) return

    // DataWedge profiles do not always include an Enter suffix. A short idle
    // window lets the TC57 finish typing the barcode and then processes it.
    scannerIdleTimerRef.current = window.setTimeout(() => {
      submitHardwareScan(rawValue)
    }, 450)
  }

  useEffect(() => {
    if (!carrier) return

    function flushExternalScan() {
      const value = externalScanRef.current.value
      externalScanRef.current = { value: '', time: 0 }
      if (value) submitHardwareScan(value)
    }

    function handleExternalScanner(event: KeyboardEvent) {
      const element = event.target as HTMLElement | null
      if (element === scannerInputRef.current) return

      const isEditing = element?.tagName === 'INPUT'
        || element?.tagName === 'TEXTAREA'
        || element?.tagName === 'SELECT'
      if (isEditing) return

      if (event.key === 'Enter' || event.key === 'Tab') {
        if (externalScanRef.current.value) {
          event.preventDefault()
          flushExternalScan()
        }
        return
      }

      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return
      const now = Date.now()
      const previous = externalScanRef.current
      externalScanRef.current = {
        value: now - previous.time > 700 ? event.key : previous.value + event.key,
        time: now,
      }

      if (scannerIdleTimerRef.current !== null) window.clearTimeout(scannerIdleTimerRef.current)
      scannerIdleTimerRef.current = window.setTimeout(flushExternalScan, 450)
    }

    window.addEventListener('keydown', handleExternalScanner, true)
    return () => {
      window.removeEventListener('keydown', handleExternalScanner, true)
      if (scannerIdleTimerRef.current !== null) window.clearTimeout(scannerIdleTimerRef.current)
      scannerIdleTimerRef.current = null
      externalScanRef.current = { value: '', time: 0 }
    }
  }, [carrier, pendingPartNumber, scanTarget])

  function updateLine(partNumber: string, field: 'bultos' | 'quantity', value: number) {
    setLines((current) => current.map((line) => line.partNumber === partNumber
      ? { ...line, [field]: Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)) }
      : line))
  }

  function updateCondition(partNumber: string, condition: IntakeLine['condition']) {
    setLines((current) => current.map((line) => line.partNumber === partNumber
      ? { ...line, condition, exceptionNotes: condition === 'good' ? '' : line.exceptionNotes }
      : line))
  }

  function addPhotos(files: FileList | null, setter: Dispatch<SetStateAction<EvidencePhoto[]>>) {
    if (!files) return
    const selectedFiles = Array.from(files).filter((file) => (
      !file.type ||
      file.type.startsWith('image/') ||
      /\.(?:heic|heif|jpe?g|png|webp)$/i.test(file.name)
    ))

    if (!selectedFiles.length) {
      setError('El TC57 no devolvió una imagen válida. Intenta tomar la foto nuevamente.')
      return
    }

    setError('')
    setter((current) => [
      ...current,
      ...selectedFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      })),
    ])
  }

  function removePhoto(index: number, setter: Dispatch<SetStateAction<EvidencePhoto[]>>) {
    setter((current) => {
      const target = current[index]
      if (target) URL.revokeObjectURL(target.preview)
      return current.filter((_, photoIndex) => photoIndex !== index)
    })
  }

  function undoLastScan() {
    const lastEntry = scanHistory.at(-1)
    if (!lastEntry) return
    const separator = lastEntry.lastIndexOf(':')
    const partNumber = separator >= 0 ? lastEntry.slice(0, separator) : lastEntry
    const scannedQuantity = separator >= 0 ? Number(lastEntry.slice(separator + 1)) || 1 : 1
    setScanHistory((current) => current.slice(0, -1))
    setLines((current) => current.flatMap((line) => {
      if (line.partNumber !== partNumber) return [line]
      if (line.scannedBultos <= 1) return []
      return [{
        ...line,
        scannedBultos: line.scannedBultos - 1,
        bultos: Math.max(0, line.bultos - 1),
        quantity: Math.max(0, line.quantity - scannedQuantity),
      }]
    }))
  }

  async function saveIntake() {
    setError('')
    setSuccess('')
    setSaveStage('Revisando información…')
    if (!carrier || (carrier === 'Other' && !otherCarrier.trim())) {
      setError('Selecciona el carrier antes de guardar.')
      setSaveStage('')
      return
    }
    if (lines.length === 0 || totalBultos < 1) {
      setError('Agrega por lo menos un número de parte y un bulto.')
      setSaveStage('')
      return
    }
    if (lines.some((line) => line.quantity < 1 || line.bultos < 1)) {
      setError('Cada parte debe conservar por lo menos una unidad y un bulto.')
      setSaveStage('')
      return
    }
    if (lines.some((line) => line.quantity < line.bultos)) {
      setError('La cantidad total no puede ser menor que el número de bultos.')
      setSaveStage('')
      return
    }
    if (!palletPhotos.length || !packingListPhotos.length) {
      setError('Agrega por lo menos una foto de la tarima y una del packing list.')
      setSaveStage('')
      return
    }
    const hasOsd = lines.some((line) => line.condition !== 'good')
    if (hasOsd && !osdPhotos.length) {
      setError('Agrega por lo menos una foto de evidencia para las partes enviadas a OS&D.')
      setSaveStage('')
      return
    }

    setSaving(true)
    setSaveStage(`Guardando recepción y subiendo ${palletPhotos.length + packingListPhotos.length} foto(s)…`)
    try {
      const savedReception = await createReception({
        carrier,
        otherCarrier,
        trailer: '',
        palletCount: '1',
        seal: '',
        receptionDate: localDate(),
        receptionTime: localTime(),
        pallets: [{
          damaged: hasOsd ? 'Sí' : 'No',
          notes: `Entrada directa a inventario. Lecturas P: ${scanHistory.length}. Bultos finales: ${totalBultos}.`,
          parts: lines.map((line) => ({
            partNumber: line.partNumber,
            quantity: String(line.quantity),
            boxes: '',
            packages: String(line.bultos),
            palletReference: '',
          })),
          documents: {
            packingListReference: '',
            invoice: '',
            documentationComplete: 'No',
          },
          photos: { packingList: packingListPhotos, palletLabel: [], palletPhoto: palletPhotos, bol: [], damage: osdPhotos },
          completed: true,
        }],
      })
      const packageInputs = lines.flatMap((line) => {
        const baseQuantity = Math.floor(line.quantity / line.bultos)
        const remainder = line.quantity % line.bultos
        return Array.from({ length: line.bultos }, (_, index) => ({
          palletNumber: 1,
          partNumber: line.partNumber,
          purchaseOrder: '',
          quantity: baseQuantity + (index < remainder ? 1 : 0),
          supplierCode: '',
          supplierPackageId: '',
          supplierPackageType: null,
          rawCodes: {},
          conditionStatus: line.condition,
          exceptionReason: line.condition === 'damaged' ? 'damage' as const : line.condition === 'missing_packing' ? 'missing_packing' as const : null,
          exceptionNotes: line.exceptionNotes,
        }))
      })
      await createNormalReceptionPackages(savedReception.id, packageInputs)
      const photoUploadFailed = Boolean(savedReception.photo_upload_warnings?.length)
      if (photoUploadFailed) {
        setError(`La entrada se guardó, pero alguna foto falló: ${savedReception.photo_upload_warnings.join(' | ')}`)
      } else {
        setSuccess(`Entrada y ${palletPhotos.length + packingListPhotos.length} foto(s) guardadas: ${lines.length} partes y ${totalBultos} bultos.`)
      }
      setSaveStage('')
      setLines([])
      setScanHistory([])
      palletPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview))
      packingListPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview))
      setPalletPhotos([])
      setPackingListPhotos([])
      osdPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview))
      setOsdPhotos([])
      if (!photoUploadFailed) onSaved?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar la entrada.')
      setSaveStage('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <header className="border-b border-slate-800 p-5 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-400">Inventario de piso</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Registrar descarga</h2>
        <p className="mt-2 text-sm text-slate-400">La fecha, el día y la hora se registran automáticamente. Cada código P suma un bulto.</p>
      </header>

      <div className="grid gap-3 border-b border-slate-800 p-5 sm:grid-cols-3 sm:p-6">
        <button type="button" onClick={() => navigate('/operations/receiving/quick?client=UPS')} className="min-h-24 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 text-left transition hover:bg-amber-500/20">
          <span className="block text-lg font-black text-amber-300">UPS</span>
          <span className="mt-1 block text-xs text-slate-400">Factura, labels, cajas y etiqueta de parte</span>
        </button>
        <button type="button" onClick={() => navigate('/operations/receiving/quick?client=A1')} className="min-h-24 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 text-left transition hover:bg-cyan-500/20">
          <span className="block text-lg font-black text-cyan-300">A1</span>
          <span className="mt-1 block text-xs text-slate-400">Factura, cajas, labels y tarima</span>
        </button>
        <button type="button" onClick={() => setReceptionType('normal')} className={['min-h-24 rounded-2xl border px-4 text-left transition', receptionType === 'normal' ? 'border-emerald-400 bg-emerald-500/20' : 'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'].join(' ')}>
          <span className="block text-lg font-black text-emerald-300">Recepción normal</span>
          <span className="mt-1 block text-xs text-slate-400">XPO, EZI, MTY u otro carrier</span>
        </button>
      </div>

      {receptionType === 'normal' ? <div className="space-y-5 p-5 sm:p-6">
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400">{error}</div>}
        {success && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-400"><CheckCircle2 size={18} />{success}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-300">Carrier *
            <select value={carrier} onChange={(event) => setCarrier(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white">
              <option value="">Seleccionar carrier</option>
              {carriers.map((name) => <option key={name} value={name}>{name === 'Other' ? 'Otro' : name}</option>)}
            </select>
          </label>
          {carrier === 'Other' && (
            <label className="text-sm font-semibold text-slate-300">Nombre del carrier *
              <input value={otherCarrier} onChange={(event) => setOtherCarrier(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white" />
            </label>
          )}
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Fecha automática</p>
            <p className="mt-1 font-bold text-white">{new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' }).format(new Date())}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={() => {
              scannerInputRef.current?.focus()
            }}
            disabled={!carrier}
            className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-emerald-500 px-5 text-base font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ScanBarcode size={23} /> Activar escáner TC57
          </button>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            disabled={!carrier}
            className="min-h-14 rounded-xl border border-slate-700 px-4 font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Usar cámara (respaldo)
          </button>
        </div>

        <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
            <label className="text-sm font-bold text-white">
              {scanTarget === 'P' ? 'Escanear número de parte (P)' : `Escanear cantidad (Q) para ${pendingPartNumber}`}
              <input
                ref={scannerInputRef}
                value={scannerInput}
                autoComplete="off"
                autoFocus
                inputMode="none"
                onChange={(event) => {
                  const value = event.target.value
                  setScannerInput(value)
                  scheduleHardwareScan(value)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== 'Tab') return
                  event.preventDefault()
                  submitHardwareScan(event.currentTarget.value)
                }}
                placeholder={scanTarget === 'P' ? 'Esperando código P…' : 'Esperando código Q…'}
                className="mt-2 min-h-14 w-full rounded-xl border border-emerald-400 bg-slate-950 px-4 text-lg font-bold uppercase text-white outline-none focus:ring-4 focus:ring-emerald-400/20"
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className={scannerMessage ? 'text-sm font-bold text-emerald-300' : 'text-sm text-slate-400'}>
                {scannerMessage || 'Secuencia segura: primero P y después Q.'}
              </p>
              <button type="button" onClick={() => submitHardwareScan(scannerInput)} className="min-h-11 rounded-xl bg-emerald-500 px-5 font-bold text-slate-950">
                Procesar lectura
              </button>
            </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">Lecturas</p><p className="mt-1 text-2xl font-bold text-white">{scanHistory.length}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">Bultos finales</p><p className="mt-1 text-2xl font-bold text-white">{totalBultos}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs uppercase text-slate-500">Unidades</p><p className="mt-1 text-2xl font-bold text-white">{totalQuantity}</p></div>
        </div>

        {lines.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left">
            <thead className="bg-slate-950 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Número de parte</th><th className="px-4 py-3">Escaneos</th><th className="px-4 py-3">Bultos (editable)</th><th className="px-4 py-3">Cantidad (editable)</th><th className="px-4 py-3">Condición</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {lines.map((line) => <tr key={line.partNumber}>
                <td className="px-4 py-3 font-bold text-white">{line.partNumber}</td>
                <td className="px-4 py-3 text-slate-300">{line.scannedBultos}</td>
                <td className="px-4 py-3"><input type="number" min="1" value={line.bultos} onChange={(event) => updateLine(line.partNumber, 'bultos', Number(event.target.value))} className="h-11 w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 text-white" /></td>
                <td className="px-4 py-3"><input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.partNumber, 'quantity', Number(event.target.value))} className="h-11 w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 text-white" /></td>
                <td className="px-4 py-3">
                  <select value={line.condition} onChange={(event) => updateCondition(line.partNumber, event.target.value as IntakeLine['condition'])} className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-2 text-white">
                    <option value="good">Correcto</option>
                    <option value="damaged">Dañado · OS&D</option>
                    <option value="missing_packing">Sin packing · OS&D</option>
                  </select>
                  {line.condition !== 'good' && <input value={line.exceptionNotes} onChange={(event) => setLines((current) => current.map((item) => item.partNumber === line.partNumber ? { ...item, exceptionNotes: event.target.value } : item))} placeholder="Observaciones OS&D" className="mt-2 h-10 w-full rounded-lg border border-amber-500/40 bg-slate-950 px-2 text-white" />}
                </td>
                <td className="px-4 py-3 text-right"><button type="button" title="Eliminar parte" onClick={() => setLines((current) => current.filter((item) => item.partNumber !== line.partNumber))} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/30 text-red-400"><Trash2 size={17} /></button></td>
              </tr>)}
            </tbody>
          </table>
        </div>}

        <div className="grid gap-4 md:grid-cols-2">
          {([
            ['Foto de tarima *', palletPhotos, setPalletPhotos],
            ['Packing list *', packingListPhotos, setPackingListPhotos],
            ['Evidencia OS&D (obligatoria si hay daño/falta)', osdPhotos, setOsdPhotos],
          ] as const).map(([label, photos, setter]) => (
            <section key={label} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-sm font-bold text-white">{label}</p>
              <p className="mt-1 text-xs text-slate-500">Puedes tomar o seleccionar varias fotos. Se conservarán todas.</p>
              <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300">
                <ImagePlus size={18} /> Tomar o agregar foto
                <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(event) => { addPhotos(event.target.files, setter); event.target.value = '' }} />
              </label>
              {photos.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
                {photos.map((photo, index) => <div key={`${photo.file.name}-${index}`} className="relative">
                  <img src={photo.preview} alt={label} className="h-20 w-20 rounded-lg border border-slate-700 object-cover" />
                  <button type="button" aria-label="Eliminar foto" onClick={() => removePhoto(index, setter)} className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white"><X size={14} /></button>
                </div>)}
              </div>}
              <p className="mt-3 text-xs font-semibold text-emerald-400">{photos.length} foto(s) seleccionada(s)</p>
            </section>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <button type="button" onClick={undoLastScan} disabled={!scanHistory.length} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 font-semibold text-slate-300 disabled:opacity-40"><Minus size={18} />Deshacer último</button>
            <button type="button" onClick={() => { setLines([]); setScanHistory([]); setPendingPartNumber(''); setScanTarget('P'); setScannerInput(''); setScannerMessage('') }} disabled={!lines.length && !pendingPartNumber} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 font-semibold text-slate-300 disabled:opacity-40"><RotateCcw size={18} />Limpiar</button>
          </div>
          <button type="button" onClick={() => void saveIntake()} disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 font-bold text-white disabled:cursor-wait disabled:opacity-60"><PackagePlus size={20} />{saving ? 'Guardando y subiendo fotos…' : 'Guardar en inventario'}</button>
        </div>

        <div aria-live="polite" className="space-y-2">
          {saveStage && <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-300">{saveStage}</div>}
          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400">No se guardó: {error}</div>}
          {!saving && !error && <p className="text-xs text-slate-500">Para guardar necesitas carrier, al menos una parte, una foto de tarima y una foto de packing list.</p>}
        </div>
      </div> : <div className="p-8 text-center text-sm text-slate-500">Selecciona el tipo de recepción para comenzar.</div>}

      {scannerOpen && <PackageLabelScanner continuousPartMode preferHardwareScanner={false} onClose={() => setScannerOpen(false)} onSave={addScan} />}
    </section>
  )
}
