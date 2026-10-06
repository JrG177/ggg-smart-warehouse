export const trialLines = [
  { part: '432-2923', quantity: 10 },
  { part: '4386499', quantity: 14 },
  { part: '5076928', quantity: 1 },
  { part: '492-6083', quantity: 2 },
  { part: '421-1561', quantity: 5 },
  { part: '389-0834', quantity: 4 },
]
export type TrialState = { counts: Record<string, number>; pending: string; complete: boolean }
export const emptyTrial = (): TrialState => ({ counts: {}, pending: '', complete: false })
export function scanTrial(state: TrialState, value: string): { state: TrialState; message: string } {
  if (state.complete) throw new Error('La factura de prueba ya está completa. Reinicia para repetir.')
  const raw = value.trim().toUpperCase().replace(/^\][A-Z][0-9]/, '').replace(/\s/g, '')
  const combined = raw.match(/^P([A-Z0-9-]+?)[|;,]*Q([0-9]+)[|;,]*$/)
  const partOnly = raw.match(/^P([A-Z0-9-]+)[|;,]*$/)
  const quantityOnly = raw.match(/^Q([0-9]+)[|;,]*$/)
  let part = combined?.[1] || partOnly?.[1] || ''
  let quantity = combined ? Number(combined[2]) : null
  if (quantityOnly || (state.pending && /^\d+$/.test(raw))) {
    if (!state.pending) throw new Error('Primero escanea la parte. Esta cantidad no se agregó.')
    part = state.pending
    quantity = Number(quantityOnly?.[1] || raw)
  } else if (!part && trialLines.some(line => line.part === raw)) part = raw
  const line = trialLines.find(item => item.part === part)
  if (!line) throw new Error('Parte fuera de esta factura de prueba. No se agregó material.')
  if (quantity === null) return { state: { ...state, pending: part }, message: `Parte ${part} encontrada. Escanea su cantidad.` }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('La cantidad debe ser un entero mayor que cero.')
  const current = state.counts[part] || 0
  if (current + quantity > line.quantity) throw new Error(`Excede la factura: ${part} tiene ${line.quantity - current} piezas pendientes. No se agregó esta lectura.`)
  return { state: { ...state, pending: '', counts: { ...state.counts, [part]: current + quantity } }, message: `✓ ${part}: ${quantity} piezas agregadas. Listo para la siguiente label.` }
}
export function finishTrial(state: TrialState): TrialState {
  if (state.pending || trialLines.some(line => (state.counts[line.part] || 0) !== line.quantity)) throw new Error('Todavía hay partes o cantidades pendientes.')
  return { ...state, complete: true }
}
