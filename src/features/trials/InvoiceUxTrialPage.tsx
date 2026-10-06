import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { emptyTrial, finishTrial, scanTrial, trialLines } from './invoiceTrial'
import './invoiceTrial.css'

export function InvoiceUxTrialPage() {
  const [state, setState] = useState(emptyTrial)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('Escanea la parte y cantidad juntas, o P primero y Q después.')
  const [error, setError] = useState(false)
  const [manual, setManual] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const pending = trialLines.filter(line => (state.counts[line.part] || 0) < line.quantity)
  const units = trialLines.reduce((sum, line) => sum + (state.counts[line.part] || 0), 0)
  const total = trialLines.reduce((sum, line) => sum + line.quantity, 0)
  function focus() { requestAnimationFrame(() => input.current?.focus()) }
  function scan(event: FormEvent) {
    event.preventDefault()
    if (!code.trim()) return
    try { const result = scanTrial(state, code); setState(result.state); setMessage(result.message); setError(false) }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Lectura inválida.'); setError(true) }
    setCode(''); focus()
  }
  return <main className="invoice-trial">
    <h1>Factura · Prueba de flujo</h1>
    <aside>DEMOSTRACIÓN LOCAL · Estos escaneos no consultan ni modifican Supabase. Se borran al recargar esta página. Los otros módulos siguen usando su conexión habitual.</aside>
    <section className="it-summary"><strong>INV-DEMO-OPT-001</strong><span>{units}/{total} piezas · {trialLines.length - pending.length}/{trialLines.length} partes completas</span><progress value={units} max={total} aria-label="Piezas verificadas" /></section>
    <section className="it-scan">
      <h2>{state.complete ? 'Factura de prueba completa' : state.pending ? `Lee la cantidad de ${state.pending}` : 'Listo para la siguiente label'}</h2>
      {!state.complete && <form onSubmit={scan}>
        <label htmlFor="trial-scan">{state.pending ? 'Cantidad (Q)' : 'Parte (P) o parte + cantidad'}</label>
        <input id="trial-scan" ref={input} autoFocus inputMode={manual ? 'text' : 'none'} autoComplete="off" value={code} onChange={event => setCode(event.target.value)} placeholder={state.pending ? 'Q10' : 'P432-2923|Q10'} />
        <button className="it-primary" disabled={!code.trim()}>Procesar lectura</button>
      </form>}
      <div className={error ? 'it-feedback it-error' : 'it-feedback'} role={error ? 'alert' : 'status'}>{message}</div>
      {!state.complete && <div className="it-actions"><button onClick={() => { setManual(value => !value); focus() }}>{manual ? 'Usar lector' : 'Escribir manualmente'}</button>{state.pending && <button onClick={() => { setState({ ...state, pending: '' }); setMessage('Lectura pendiente cancelada. Escanea otra parte.'); setError(false); focus() }}>Cancelar parte pendiente</button>}</div>}
    </section>
    <section><h2>Pendientes ({pending.length})</h2>{pending.length === 0 ? <p>Todo verificado. Ya puedes completar la prueba.</p> : pending.map(line => <article className="it-line" key={line.part}><strong>{line.part}</strong><span>Factura {line.quantity} · Leído {state.counts[line.part] || 0}</span><b>Faltan {line.quantity - (state.counts[line.part] || 0)}</b></article>)}</section>
    <details><summary>Ver partes completas</summary>{trialLines.filter(line => !pending.includes(line)).map(line => <article className="it-line" key={line.part}><strong>{line.part}</strong><span>✓ {line.quantity} piezas verificadas</span></article>)}</details>
    <section><button className="it-primary" disabled={!!pending.length || !!state.pending || state.complete} onClick={() => { setState(finishTrial(state)); setMessage('✓ Factura de demostración completada. No se registró ninguna salida real.'); setError(false) }}>Completar factura de prueba</button>{pending.length > 0 && <p>Para completar faltan {total - units} piezas de {pending.length} partes.</p>}</section>
    <details><summary>Guía para probar</summary><p>Lee P y Q con Enter al final. Puedes leer cada código por separado; la parte queda pendiente hasta recibir su cantidad. Esta demostración acepta P/Q y partes exactas de la lista; no sustituye al lector universal de producción.</p>{trialLines.map(line => <p key={line.part}><code>P{line.part}|Q{line.quantity}</code></p>)}<p>Prueba incorrecta: P999-9999|Q2. Exceso: vuelve a leer una parte que ya completaste.</p></details>
    <button onClick={() => { setState(emptyTrial()); setCode(''); setMessage('Prueba reiniciada. Escanea la primera label.'); setError(false); focus() }}>Reiniciar demostración</button>
  </main>
}
