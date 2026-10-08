import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { a1Departed, a1Held, a1Matches, a1WorkStatus, normalizeTracking } from './a1TrialStore'
import type { A1Action, A1Box, A1Data } from './a1TrialStore'

export async function exportA1Reception(data: A1Data, date: string) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF()
  const boxes = data.boxes.filter(box => box.receivedDate === date)
  let y = 35
  const header = () => {
    pdf.setFontSize(16); pdf.text('GGG - Recepcion A1', 14, 16)
    pdf.setFontSize(10); pdf.text(`Fecha: ${date} | Cajas: ${boxes.length}`, 14, 24)
  }
  header()
  for (const box of boxes) {
    const lines = pdf.splitTextToSize(`${box.tracking} | Caja ${box.number || 'sin sticker'}\n${box.classification?.toUpperCase() || 'SIN CLASIFICAR'} | ${a1WorkStatus(data, box)}${box.note ? `\nNota: ${box.note}` : ''}${a1Departed(data, box) ? `\nSalida: ${box.departedDate || a1Departed(data, box)}` : ''}`, 180) as string[]
    // Wrap every line and paginate even unusually long observations.
    for (const line of lines) {
      if (y > 277) { pdf.addPage(); header(); y = 35 }
      pdf.text(line, 14, y); y += 5
    }
    y += 5
  }
  if (!boxes.length) pdf.text('Sin recepciones para esta fecha.', 14, y)
  pdf.save(`A1-recepcion-${date}.pdf`)
}

type Props = { data: A1Data; commit: (action: A1Action) => Promise<A1Data | null>; date: string }
function ClassificationRow({ box, commit }: { box: A1Box; commit: Props['commit'] }) {
  const [note, setNote] = useState(box.note)
  return <div className="a1-classification-row">
    <strong className="a1-code">{box.tracking}</strong>
    <small>{box.number ? `Caja ${box.number} · ` : ''}{box.classification?.toUpperCase() || 'Sin clasificar'}</small>
    <input aria-label={`Observación de ${box.tracking}`} placeholder="Observación (obligatoria para OSND)" value={note} onChange={event => setNote(event.target.value)} />
    <div className="a1-flow-actions">{(['normal', 'nom', 'osnd'] as const).map(classification => <button type="button" key={classification} disabled={a1Held(box) && classification !== 'osnd'} aria-pressed={box.classification === classification} onClick={() => commit({ type: 'classify', id: box.id, classification, note })}>{classification.toUpperCase()}{box.classification === classification ? ' ✓' : ''}</button>)}</div>
  </div>
}
export function A1Classification({ data, date, commit }: Props) {
  const pending = data.boxes.filter(box => box.receivedDate === date && !box.receptionClosedAt && !a1Departed(data, box))
  return <details className="a1-panel" open={pending.length > 0}>
    <summary>Finalizar recepción · {pending.length} caja(s) pendientes</summary>
    <p className="a1-help">Clasifica cada caja. Normal y NOM pasan a Falta de factura; OSND queda retenida.</p>
    {pending.map(box => <ClassificationRow key={box.id} box={box} commit={commit} />)}
    <button type="button" className="a1-primary" disabled={!pending.length || pending.some(box => !box.classification)} onClick={() => commit({ type: 'finishReceiving', ids: pending.map(box => box.id) })}>Finalizar recepción</button>
  </details>
}
export function A1Exit({ data, commit, date }: Props) {
  const [exitDate, setExitDate] = useState(date)
  const [scan, setScan] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [manual, setManual] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  function add(event: FormEvent) {
    event.preventDefault()
    try {
      const code = normalizeTracking(scan)
      const matches = data.boxes.filter(box => box.tracking === code)
      if (matches.length !== 1) throw new Error('Tracking no encontrado o ambiguo. Revisa el inventario.')
      const box = matches[0]
      if (ids.includes(box.id)) throw new Error('Esta caja ya está en la lista de salida.')
      if (a1Departed(data, box)) throw new Error('Esta caja ya salió.')
      if (a1Held(box)) throw new Error('OSND retenida: no puede salir sin autorización externa.')
      if (!box.classification || !box.receptionClosedAt) throw new Error('Finaliza la recepción de esta caja antes de dar salida.')
      setIds(current => [...current, box.id]); setError('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Lectura inválida.') }
    setScan(''); input.current?.focus()
  }
  return <section className="a1-section"><h2>Salida por escaneo</h2>
    <p className="a1-help">Escanea cada tracking de las cajas que salen. La recepción original se conserva.</p>
    <label>Fecha de salida<input type="date" value={exitDate} onChange={event => setExitDate(event.target.value)} /></label>
    <form className="a1-form" onSubmit={add}><label>Escanear tracking<input ref={input} autoFocus inputMode={manual ? 'text' : 'none'} autoComplete="off" value={scan} onChange={event => setScan(event.target.value)} /></label><button disabled={!scan.trim()}>Agregar a salida</button></form>
    <button type="button" onClick={() => { setManual(value => !value); input.current?.focus() }}>{manual ? 'Usar lector' : 'Escribir manualmente'}</button>
    {error && <p role="alert" className="a1-error">{error}</p>}
    <h3>{ids.length} cajas escaneadas para salida</h3>
    {ids.map(id => <div className="a1-assigned" key={id}><span className="a1-code">{data.boxes.find(box => box.id === id)?.tracking}</span><button type="button" onClick={() => setIds(current => current.filter(item => item !== id))}>Quitar</button></div>)}
    <button type="button" className="a1-primary" disabled={!ids.length || !exitDate} onClick={async () => { if (await commit({ type: 'exitBoxes', ids, date: exitDate })) { setIds([]); setError(''); input.current?.focus() } }}>Confirmar salida de {ids.length} cajas</button>
  </section>
}
export { a1Matches }
