export interface A1Box {
  id: string
  tracking: string
  originalTracking?: string
  number: string
  receivedDate: string
  location: string
  noms: boolean
  osd: '' | 'Sobrante' | 'Faltante' | 'Daño' | 'Retenido'
  note: string
  photo: string
  classification?: 'normal' | 'nom' | 'osnd'
  receptionClosedAt?: string
  departedAt?: string
  departedDate?: string
  // Informational evidence entered externally; operators cannot authorize release.
  externalRelease?: { reference: string; at: string }
}
export interface A1Invoice {
  id: string
  number: string
  loadedIn: string
  boxIds: string[]
  createdAt: string
  departedAt: string | null
}
export interface A1Event { at: string; message: string }
export interface A1Data {
  version: 1
  boxes: A1Box[]
  invoices: A1Invoice[]
  events: A1Event[]
}
export type A1Action =
  | { type: 'classify'; id: string; classification: 'normal' | 'nom' | 'osnd'; note: string }
  | { type: 'finishReceiving'; ids: string[] }
  | { type: 'exitBoxes'; ids: string[]; date: string }
  | { type: 'cleanTrackings' }
  | { type: 'receive'; tracking: string; date: string; number?: string }
  | { type: 'edit'; id: string; changes: Omit<A1Box, 'id' | 'tracking'> }
  | { type: 'createInvoice'; number: string; loadedIn: string }
  | { type: 'assign'; invoiceId: string; code: string }
  | { type: 'remove'; invoiceId: string; boxId: string }
  | { type: 'depart'; invoiceId: string }

export const A1_STORAGE_KEY = 'ggg-a1-local-trial-v1'
export function emptyA1Data(): A1Data {
  return { version: 1, boxes: [], invoices: [], events: [] }
}
export function normalizeTracking(value: string) {
  const raw = value.trim().replace(/\s/g, '').toUpperCase()
  // UPS labels can deliver routing data followed by or preceding a 1Z tracking.
  // Extract only a complete tracking, never the ZIP/routing or reference codes.
  const ups = [...new Set(raw.match(/1Z[A-Z0-9]{16}/g) || [])]
  if (ups.length > 1) throw new Error('La lectura contiene trackings de varias cajas. Escanea una sola caja.')
  if (ups.length === 1) return ups[0]
  if (raw.includes('1Z')) throw new Error('Tracking UPS incompleto. Vuelve a leer el código grande debajo de TRACKING #.')
  const code = raw.replace(/^\][A-Z][0-9]/, '')
  if (!/^[A-Z0-9-]{6,80}$/.test(code)) {
    throw new Error('Tracking inválido. Lee solo el código de tracking de la caja.')
  }
  return code
}
function storedTracking(box: A1Box) {
  try { return normalizeTracking(box.tracking) }
  catch { return box.tracking }
}
export function normalizeBoxNumber(value: string) {
  const code = value.trim().toUpperCase().replace(/^A1[- ]?/, '')
  if (!/^\d{1,12}$/.test(code) || /^0+$/.test(code)) {
    throw new Error('El sticker debe contener un número positivo, por ejemplo 000135 o A1-000135.')
  }
  return code.replace(/^0+/, '')
}
export function boxInvoice(data: A1Data, boxId: string) {
  return data.invoices.find(invoice => invoice.boxIds.includes(boxId))
}
export function readA1Data(): A1Data {
  const raw = localStorage.getItem(A1_STORAGE_KEY)
  if (!raw) return emptyA1Data()
  const data = JSON.parse(raw) as A1Data
  if (data.version !== 1 || !Array.isArray(data.boxes) || !Array.isArray(data.invoices) || !Array.isArray(data.events)) {
    throw new Error('No se pudieron leer los datos A1 de prueba. No se sobrescribieron.')
  }
  return data
}

export function a1Held(box: A1Box) {
  return !!(box.osd || box.classification === 'osnd') && !box.externalRelease
}
export function a1Departed(data: A1Data, box: A1Box) {
  return box.departedAt || boxInvoice(data, box.id)?.departedAt || null
}
export function a1WorkStatus(data: A1Data, box: A1Box) {
  if (a1Departed(data, box)) return 'Salió'
  if (a1Held(box)) return 'OSND · Retenida'
  if (!box.classification || !box.receptionClosedAt) return 'Pendiente de clasificación / cierre'
  return boxInvoice(data, box.id) ? 'Asignada a factura' : 'Falta de factura'
}
export function a1Matches(box: A1Box, query: string) {
  const key = query.replace(/\s/g, '').toUpperCase()
  if (!key) return true
  if (/^\d{4}$/.test(key)) return box.tracking.endsWith(key) || box.number === key
  return box.tracking === key || box.number === key || `A1-${box.number}` === key
}
function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Selecciona una fecha válida.')
}
// Pure transitions: all validation happens before the browser save.
export function applyA1Action(data: A1Data, action: A1Action, id: string, at: string): { data: A1Data; message: string } {
  const next = structuredClone(data)
  let message = ''
  if (action.type === 'classify') {
    const box = next.boxes.find(item => item.id === action.id)
    if (!box) throw new Error('Caja no encontrada.')
    if (a1Departed(next, box)) throw new Error('Esta caja ya salió.')
    if (a1Held(box) && action.classification !== 'osnd') throw new Error('OSND retenida: se requiere autorización externa. El operador no puede liberarla.')
    if (action.classification === 'osnd' && !action.note.trim()) throw new Error('Agrega una observación para OSND.')
    box.classification = action.classification
    box.noms = action.classification === 'nom'
    if (action.classification === 'osnd') box.osd ||= 'Retenido'
    box.note = action.note.trim()
    message = `Tracking ${box.tracking}: ${action.classification.toUpperCase()} clasificado.`
  } else if (action.type === 'finishReceiving') {
    if (!action.ids.length || new Set(action.ids).size !== action.ids.length) throw new Error('Selecciona cajas sin duplicados.')
    const boxes = action.ids.map(id => next.boxes.find(box => box.id === id))
    if (boxes.some(box => !box || !box.classification)) throw new Error('Clasifica cada caja antes de finalizar la recepción.')
    if (boxes.some(box => box && a1Departed(next, box))) throw new Error('Una caja ya salió.')
    boxes.forEach(box => { box!.receptionClosedAt ||= at })
    message = `Recepción finalizada: ${boxes.length} cajas clasificadas. Normal y NOM pasan a Falta de factura; OSND queda retenida.`
  } else if (action.type === 'exitBoxes') {
    validDate(action.date)
    if (!action.ids.length || new Set(action.ids).size !== action.ids.length) throw new Error('Escanea cajas sin duplicados antes de confirmar la salida.')
    const boxes = action.ids.map(id => next.boxes.find(box => box.id === id))
    if (boxes.some(box => !box)) throw new Error('Caja no encontrada.')
    for (const box of boxes) {
      if (a1Departed(next, box!)) throw new Error(`Tracking ${box!.tracking}: ya salió.`)
      if (a1Held(box!)) throw new Error(`Tracking ${box!.tracking}: OSND retenida. No puede salir.`)
      if (!box!.classification || !box!.receptionClosedAt) throw new Error('Finaliza la clasificación de recepción antes de dar salida.')
      if (action.date < box!.receivedDate) throw new Error('La salida no puede ser anterior a la recepción.')
    }
    boxes.forEach(box => { box!.departedAt = at; box!.departedDate = action.date; })
    for (const invoice of next.invoices) {
      if (!invoice.departedAt && invoice.boxIds.length && invoice.boxIds.every(id => next.boxes.find(box => box.id === id)?.departedAt)) invoice.departedAt = at
    }
    message = `Salida registrada: ${boxes.length} cajas · ${action.date}. Recepciones e historial conservados.`
  } else if (action.type === 'cleanTrackings') {
    const seen = new Map<string, A1Box>()
    let count = 0
    for (const box of next.boxes) {
      const tracking = normalizeTracking(box.tracking)
      const previous = seen.get(tracking)
      if (previous) throw new Error(`El tracking ${tracking} está en dos registros (cajas ${previous.number || 'sin sticker'} y ${box.number || 'sin sticker'}). No se modificó ninguno; revisa ambos antes de corregir.`)
      seen.set(tracking, box)
      if (tracking !== box.tracking) {
        box.originalTracking ??= box.tracking
        box.tracking = tracking
        count++
      }
    }
    message = `${count} tracking(s) corregidos. Stickers, facturas e historial conservados.`
  } else if (action.type === 'receive') {
    const tracking = normalizeTracking(action.tracking)
    const date = action.date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00`).toISOString().slice(0, 10) !== date) {
      throw new Error('Selecciona una fecha de recepción válida.')
    }
    const existing = next.boxes.find(box => storedTracking(box) === tracking)
    if (existing) throw new Error(`Tracking ya recibido el ${existing.receivedDate}. Caja ${existing.number || 'sin sticker'}. No se duplicó.`)
    const number = action.number?.trim() ? normalizeBoxNumber(action.number) : ''
    if (number && next.boxes.some(box => box.number === number)) throw new Error(`El número ${number} ya pertenece a otra caja; no se puede reutilizar.`)
    next.boxes.push({ id, tracking, originalTracking: action.tracking.trim() !== tracking ? action.tracking.trim() : undefined, number, receivedDate: date, location: '', noms: false, osd: '', note: '', photo: '' })
    message = `Tracking ${tracking} guardado.`
  } else if (action.type === 'edit') {
    const box = next.boxes.find(item => item.id === action.id)
    if (!box) throw new Error('Caja no encontrada.')
    if (a1Departed(next, box)) throw new Error('Esta caja ya salió. Su registro se conserva en el historial.')
    const number = action.changes.number.trim() ? normalizeBoxNumber(action.changes.number) : ''
    if (number && next.boxes.some(item => item.id !== box.id && item.number === number)) {
      throw new Error(`El número ${number} ya pertenece a otra caja; no se puede reutilizar.`)
    }
    const date = action.changes.receivedDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00`).toISOString().slice(0, 10) !== date) throw new Error('Fecha inválida.')
    if (action.changes.osd && !action.changes.note.trim()) throw new Error('Agrega una observación para OS&D.')
    if (action.changes.externalRelease !== box.externalRelease && JSON.stringify(action.changes.externalRelease) !== JSON.stringify(box.externalRelease)) throw new Error('El operador no puede autorizar liberaciones OSND.')
    if (a1Held(box) && !action.changes.osd) throw new Error('OSND retenida: no se puede quitar la marca sin autorización externa.')
    if (action.changes.osd) box.classification = 'osnd'
    Object.assign(box, action.changes, { classification: action.changes.osd ? 'osnd' : action.changes.noms ? 'nom' : action.changes.classification ? 'normal' : undefined, number, location: action.changes.location.trim(), note: action.changes.note.trim() })
    message = `Caja ${number || box.tracking} actualizada.`
  } else if (action.type === 'createInvoice') {
    const suffix = action.number.trim().replace(/^INV[- ]*/i, '').toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(suffix)) throw new Error('Escribe un número de factura válido.')
    const number = `INV-${suffix}`
    if (next.invoices.some(invoice => invoice.number === number)) throw new Error(`La factura ${number} ya existe. Ábrela desde la lista.`)
    const loadedIn = action.loadedIn.trim()
    if (!loadedIn) throw new Error('Escribe la unidad en Cargada en.')
    next.invoices.push({ id, number, loadedIn, boxIds: [], createdAt: at, departedAt: null })
    message = `${number} creada. Agrega sus cajas.`
  } else {
    const invoice = next.invoices.find(item => item.id === action.invoiceId)
    if (!invoice) throw new Error('Factura no encontrada.')
    if (invoice.departedAt) throw new Error('Esta factura ya salió y no se puede modificar.')
    if (action.type === 'assign') {
      const raw = action.code.trim().replace(/\s/g, '').toUpperCase()
      // Prefer exact tracking; fall back to the sticker, never infer contents.
      let canonical = raw
      if (raw.includes('1Z') || raw.length >= 6) canonical = normalizeTracking(action.code)
      const matches = next.boxes.filter(item => storedTracking(item) === canonical)
      if (matches.length > 1) throw new Error('Este tracking tiene varios registros antiguos. Revisa el inventario antes de asignar la caja.')
      let box: A1Box | undefined = matches[0]
      if (!box && /^(?:A1-?)?\d{1,12}$/.test(raw)) {
        const number = normalizeBoxNumber(raw)
        box = next.boxes.find(item => item.number === number)
      }
      if (!box) throw new Error('Caja no encontrada. Registra el tracking o vincula el sticker en Recepciones/Inventario.')
      if (a1Departed(next, box)) throw new Error('Esta caja ya está salida.')
      if (a1Held(box)) throw new Error('OSND retenida: no se puede asignar a una factura.')
      if (!box.classification || !box.receptionClosedAt) throw new Error('Finaliza la recepción y clasificación antes de asignar.')
      const previous = boxInvoice(next, box.id)
      if (previous) throw new Error(previous.id === invoice.id
        ? 'Esta caja ya está en la factura; no se duplicó.'
        : `La caja está ${previous.departedAt ? 'salida' : 'asignada'} en ${previous.number}.`)
      invoice.boxIds.push(box.id)
      message = `Caja ${box.number || box.tracking} agregada a ${invoice.number}.`
    } else if (action.type === 'remove') {
      if (!invoice.boxIds.includes(action.boxId)) throw new Error('La caja ya no está asignada a esta factura.')
      invoice.boxIds = invoice.boxIds.filter(boxId => boxId !== action.boxId)
      message = `Caja retirada de ${invoice.number}; sigue en inventario.`
    } else {
      if (!invoice.boxIds.length) throw new Error('Agrega al menos una caja antes de confirmar la salida.')
      if (invoice.boxIds.some(id => !next.boxes.find(box => box.id === id)?.departedAt)) throw new Error('Escanea todas las cajas en la sección Salida antes de completar la salida de factura.')
      invoice.departedAt = at
      message = `${invoice.number}: salida de ${invoice.boxIds.length} caja(s) confirmada.`
    }
  }
  next.events.push({ at, message })
  return { data: next, message }
}

export function saveA1Action(action: A1Action) {
  const result = applyA1Action(readA1Data(), action, typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `a1-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-')}`, new Date().toISOString())
  // Do not report success if quota or browser settings reject persistence.
  localStorage.setItem(A1_STORAGE_KEY, JSON.stringify(result.data))
  return result
}
