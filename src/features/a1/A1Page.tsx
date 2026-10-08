import { A1_SHARED, persistA1Action, readSharedA1 } from './a1Persistence'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { A1_STORAGE_KEY, boxInvoice, emptyA1Data, readA1Data, normalizeTracking } from './a1TrialStore'
import type { A1Action, A1Box, A1Data } from './a1TrialStore'
import { A1Classification, A1Exit, exportA1Reception, a1Matches } from './A1Workflow'
import { a1Departed, a1WorkStatus } from './a1TrialStore'
import './a1.css'

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo guardar el cambio.'
}
function loadInitial(): { data: A1Data; error: string } {
  try { return { data: A1_SHARED ? emptyA1Data() : readA1Data(), error: '' } }
  catch (error) { return { data: emptyA1Data(), error: messageOf(error) } }
}
function exportJson(data: A1Data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `A1-prueba-${today()}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function A1Page() {
  const [initial] = useState(loadInitial)
  const [data, setData] = useState(initial.data)
  const [error, setError] = useState(initial.error)
  const [busy, setBusy] = useState(false)
  const [sharedReady, setSharedReady] = useState(!A1_SHARED)
  const busyRef = useRef(false)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'receiving' | 'inventory' | 'invoices' | 'exit'>('receiving')
  const [date, setDate] = useState(today)
  const [tracking, setTracking] = useState('')
  const [receivingMode, setReceivingMode] = useState<'paired' | 'tracking'>('tracking')
  const [pendingTracking, setPendingTracking] = useState('')
  const pendingRawTracking = useRef('')
  const [manualEntry, setManualEntry] = useState(false)
  const [sessionCount, setSessionCount] = useState(0)
  const [lastReceivedId, setLastReceivedId] = useState('')
  const [search, setSearch] = useState('')
  const [inventoryDate, setInventoryDate] = useState('')
  const [historyDate, setHistoryDate] = useState('')
  const [reportError, setReportError] = useState('')
  const [filter, setFilter] = useState('inWarehouse')
  const [editing, setEditing] = useState<A1Box | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [unit, setUnit] = useState('58')
  const [otherUnit, setOtherUnit] = useState('')
  const [activeInvoiceId, setActiveInvoiceId] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [scanCode, setScanCode] = useState('')
  const [review, setReview] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const trackingInput = useRef<HTMLInputElement>(null)
  const invoiceInput = useRef<HTMLInputElement>(null)
  const stickerInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (A1_SHARED || event.key !== A1_STORAGE_KEY) return
      try { setData(readA1Data()); setReview(false) }
      catch (err) { setError(messageOf(err)) }
    }
    window.addEventListener('storage', listener)
    return () => window.removeEventListener('storage', listener)
  }, [])

  useEffect(() => {
    if (!A1_SHARED) return
    let active = true
    async function reload() {
      try { const shared = await readSharedA1(); if (active) { setData(shared); setSharedReady(true) } }
      catch (err) { if (active) setError(messageOf(err)) }
    }
    void reload()
    const timer = window.setInterval(() => { if (!busyRef.current) void reload() }, 10000)
    window.addEventListener('focus', reload)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', reload) }
  }, [])

  async function commit(action: A1Action) {
    if (busyRef.current) return null
    busyRef.current = true; setBusy(true)
    try {
      const result = await persistA1Action(action)
      setData(result.data)
      setNotice(result.message)
      setError('')
      return result.data
    } catch (err) {
      setNotice('')
      setError(messageOf(err))
      if (A1_SHARED) { try { setData(await readSharedA1()) } catch { /* Original error remains visible. */ } }
      return null
    } finally { busyRef.current = false; setBusy(false) }
  }
  useEffect(() => { if (sharedReady) trackingInput.current?.focus() }, [sharedReady])
  function focusReceiving() {
    requestAnimationFrame(() => trackingInput.current?.focus())
  }
  function resetReceiving() {
    setPendingTracking(''); pendingRawTracking.current = ''; setTracking('');
    setError(''); setNotice(''); focusReceiving()
  }
  async function receive(event: FormEvent) {
    event.preventDefault()
    if (!tracking.trim()) return
    if (busyRef.current) return
    if (receivingMode === 'paired' && !pendingTracking) {
      busyRef.current = true; setBusy(true)
      try {
        const canonical = normalizeTracking(tracking)
        // Check current storage before asking for a sticker; no box is saved yet.
        if ((A1_SHARED ? await readSharedA1() : readA1Data()).boxes.some(box => normalizeTracking(box.tracking) === canonical)) {
          throw new Error(`Tracking ${canonical} ya recibido. No se duplicó; continúa con otra caja.`)
        }
        pendingRawTracking.current = tracking
        setPendingTracking(canonical); setError(''); setNotice('Tracking leído. Escanea el sticker de esta caja.')
      } catch (err) { setError(messageOf(err)); setNotice('') }
      finally { busyRef.current = false; setBusy(false) }
      setTracking(''); focusReceiving(); return
    }
    const result = await commit({ type: 'receive', tracking: pendingTracking ? pendingRawTracking.current : tracking, date, number: pendingTracking ? tracking : undefined })
    setTracking('')
    if (result) {
      setLastReceivedId(result.boxes.at(-1)!.id)
      setSessionCount(count => count + 1)
      setPendingTracking(''); pendingRawTracking.current = ''
      setNotice('✓ Caja guardada. Escanea el tracking de la siguiente caja.')
    }
    focusReceiving()
  }
  async function createInvoice(event: FormEvent) {
    event.preventDefault()
    const result = await commit({ type: 'createInvoice', number: invoiceNumber, loadedIn: unit === 'OTHER' ? otherUnit : '58' })
    if (result) {
      setActiveInvoiceId(result.invoices.at(-1)!.id)
      setInvoiceNumber(''); setOtherUnit(''); setUnit('58'); setScanOpen(true); setReview(false)
    }
  }
  async function assign(event: FormEvent) {
    event.preventDefault()
    await commit({ type: 'assign', invoiceId: activeInvoiceId, code: scanCode })
    setScanCode('')
    setReview(false)
    invoiceInput.current?.focus()
  }
  async function choosePhoto(file?: File) {
    if (!file || !editing) return
    if (!file.type.startsWith('image/') || file.size > 750_000) {
      setError('Selecciona una foto menor de 750 KB para esta prueba local.'); return
    }
    const reader = new FileReader()
    const id = editing.id
    reader.onload = () => setEditing(current => current?.id === id ? { ...current, photo: String(reader.result) } : current)
    reader.onerror = () => setError('No se pudo leer la foto.')
    reader.readAsDataURL(file)
  }
  function boxCard(box: A1Box) {
    const invoice = boxInvoice(data, box.id)
    return <article className="a1-box" key={box.id}>
      <div className="a1-box-body">
        <strong>{box.number ? `Caja ${box.number}` : 'Sin sticker'}</strong>
        <div className="a1-code">{box.tracking}</div>
        <small>Entrada: {box.receivedDate}{a1Departed(data, box) && ` · Salida: ${box.departedDate || a1Departed(data, box)?.slice(0, 10)}`}</small>
        <div className="a1-status">{a1WorkStatus(data, box)}{invoice && ` · ${invoice.number}`}</div>
        {box.note && <p>{box.note}</p>}
        {box.photo && <a href={box.photo} target="_blank" rel="noreferrer"><img className="a1-photo" src={box.photo} alt={`Evidencia de caja ${box.number || box.tracking}`} /></a>}
      </div>
      <div className="a1-box-actions">
        <button type="button" className={box.noms ? 'a1-mark-active' : ''} onClick={() => setEditing({ ...box, noms: !box.noms })} disabled={!!a1Departed(data, box)} aria-label={`Editar NOMS de caja ${box.number || box.tracking}`}>NOM{box.noms ? ' ✓' : ''}</button>
        <button type="button" className={box.osd ? 'a1-mark-danger' : ''} onClick={() => setEditing({ ...box, osd: box.osd || 'Daño' })} disabled={!!a1Departed(data, box)}>OSND{box.osd && ` · ${box.osd}`}</button>
        <button type="button" onClick={() => setEditing({ ...box })} disabled={!!a1Departed(data, box)}>{box.number ? 'Editar' : 'Asignar sticker'}</button>
      </div>
    </article>
  }
  const dayBoxes = data.boxes.filter(box => box.receivedDate === date).toReversed()
  const shownBoxes = data.boxes.filter(box => {
    const matches = a1Matches(box, search) && (!inventoryDate || box.receivedDate === inventoryDate)
    return matches && (filter === 'all' || (filter === 'inWarehouse' && !a1Departed(data, box)) || (filter === 'noms' && box.noms) || (filter === 'osd' && !!box.osd) || (filter === 'departed' && !!a1Departed(data, box)) || (filter === 'missingInvoice' && a1WorkStatus(data, box) === 'Falta de factura'))
  }).toReversed()
  const activeInvoice = data.invoices.find(invoice => invoice.id === activeInvoiceId)

  return <div className="a1-page">
    <header className="a1-heading"><div><h1>Espacio A1</h1><p>Recepciones, inventario y facturas por caja.</p></div><button type="button" onClick={() => exportJson(data)}>Exportar prueba</button></header>
    <aside className="a1-trial">{A1_SHARED ? <><strong>A1 COMPARTIDO</strong> · {sharedReady ? 'Datos guardados en Supabase. Se actualiza cada 10 segundos.' : 'Conectando con Supabase…'}</> : <><strong>PRUEBA LOCAL</strong> · Datos en este navegador. No se comparten entre equipos. Exporta antes de borrar datos del navegador.</>}</aside>
    <fieldset disabled={busy || !sharedReady} className="a1-workspace border-0 p-0 m-0"><legend className="sr-only">Operación A1</legend>
    {busy && <p role="status">Guardando…</p>}
    <nav className="a1-tabs" aria-label="Secciones A1">
      {(['receiving', 'inventory', 'invoices', 'exit'] as const).map((key, index) => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); setReview(false); setError(''); setNotice('') }}>{['Recepción', 'Inventario', 'Facturas', 'Salida'][index]}</button>)}
    </nav>
    {error && <div className="a1-error" role="alert">{error}</div>}
    {notice && <div className="a1-success" role="status">{notice}</div>}

    {tab === 'receiving' && <section className="a1-section">
      <h2>Recepción continua</h2>
      <div className="a1-session" role="status"><strong>{sessionCount} cajas recibidas en esta sesión</strong><span>{pendingTracking ? 'Paso 2 · Sticker' : 'Paso 1 · Tracking'}</span></div>
      <form onSubmit={receive} className="a1-form">
        <label>Fecha de recepción<input type="date" required value={date} disabled={!!pendingTracking} onChange={event => setDate(event.target.value)} /></label>
        <label>Modo<select value={receivingMode} disabled={!!pendingTracking} onChange={event => { setReceivingMode(event.target.value as 'paired' | 'tracking'); resetReceiving() }}><option value="paired">Tracking + sticker</option><option value="tracking">Solo trackings</option></select></label>
        {pendingTracking && <div className="a1-pending">Tracking de esta caja<div className="a1-code">{pendingTracking}</div><small>Aún no guardado. Lee su sticker para completar.</small></div>}
        <label>{pendingTracking ? 'Escanear sticker' : 'Escanear tracking'}<input ref={trackingInput} autoFocus inputMode={manualEntry ? 'text' : 'none'} value={tracking} onChange={event => setTracking(event.target.value)} placeholder={pendingTracking ? '000135 o A1-000135' : 'Listo para la siguiente caja'} autoComplete="off" autoCapitalize="characters" /></label>
        <button className="a1-primary" disabled={!tracking.trim() || !date}>{pendingTracking ? 'Guardar caja y continuar' : receivingMode === 'paired' ? 'Continuar al sticker' : 'Agregar tracking'}</button>
        <div className="a1-flow-actions"><button type="button" onClick={() => { setManualEntry(value => !value); focusReceiving() }}>{manualEntry ? 'Usar lector' : 'Escribir manualmente'}</button>{pendingTracking && <button type="button" onClick={resetReceiving}>Cancelar esta caja</button>}</div>
      </form>
      <p className="a1-help">Con Enter al final de cada lectura, el TC avanza y guarda sin tocar botones. Solo trackings guarda en una lectura; tracking + sticker guarda al leer el sticker. Un error no agrega cajas.</p>
      {lastReceivedId && data.boxes.find(box => box.id === lastReceivedId) && <div className="a1-last"><strong>Última caja guardada</strong>{boxCard(data.boxes.find(box => box.id === lastReceivedId)!)}<button type="button" onClick={() => setEditing({ ...data.boxes.find(box => box.id === lastReceivedId)! })}>Marcar incidencia / editar</button></div>}
      <A1Classification data={data} date={date} commit={commit} />
      <h3>{dayBoxes.length} caja(s) · {date}</h3>
      {!dayBoxes.length && <p>Aún no hay trackings para esta fecha.</p>}
      <details><summary>Ver cajas del día ({dayBoxes.length})</summary>{dayBoxes.map(boxCard)}</details>
    </section>}

    {tab === 'inventory' && <section className="a1-section">
      <h2>Inventario A1</h2>
      {!A1_SHARED && <button type="button" onClick={() => commit({ type: 'cleanTrackings' })}>Corregir trackings guardados</button>}
      <p className="a1-help">Separa los trackings UPS de los códigos adicionales. Conserva cajas y facturas; si hay duplicados, avisa antes de cambiar datos.</p>
      <label>Buscar<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tracking completo, últimos 4 dígitos o sticker" /></label>
      <label>Fecha de recepción<input type="date" value={inventoryDate} onChange={event => setInventoryDate(event.target.value)} /></label>
      <button type="button" onClick={() => { setInventoryDate(''); setSearch(''); setFilter('inWarehouse') }}>Limpiar filtros</button>
      <label>Fecha del reporte PDF<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button type="button" disabled={!date} onClick={() => { setReportError(''); void exportA1Reception(data, date).catch(err => setReportError(messageOf(err))) }}>Descargar PDF de recepción</button>
      {reportError && <p role="alert" className="a1-error">{reportError}</p>}
      <label>Mostrar<select value={filter} onChange={event => setFilter(event.target.value)}><option value="inWarehouse">En bodega (incluye asignadas)</option><option value="all">Todas</option><option value="missingInvoice">Falta de factura</option><option value="noms">NOM</option><option value="osd">OSND</option><option value="departed">Salieron</option></select></label>
      <h3>{shownBoxes.length} caja(s)</h3>
      {!shownBoxes.length && <p>No hay cajas con estos filtros.</p>}
      {shownBoxes.map(boxCard)}
    </section>}

    {tab === 'invoices' && <section className="a1-section">
      <h2>Facturas A1</h2>
      <p className="a1-help">Control de cajas y salidas. No verifica partes ni cantidades del contenido.</p>
      <details className="a1-panel" open={!activeInvoice}><summary>Nueva factura</summary>
        <form className="a1-form" onSubmit={createInvoice}>
          <label>Número de factura<div className="a1-prefix"><span>INV-</span><input required value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} placeholder="41496" /></div></label>
          <label>Cargada en<select value={unit} onChange={event => setUnit(event.target.value)}><option value="58">58</option><option value="OTHER">OTHER</option></select></label>
          {unit === 'OTHER' && <label>Escribir unidad<input required value={otherUnit} onChange={event => setOtherUnit(event.target.value)} placeholder="Nombre o número de unidad" /></label>}
          <button className="a1-primary">Crear factura</button>
        </form>
      </details>
      <label>Abrir factura<select value={activeInvoiceId} onChange={event => { setActiveInvoiceId(event.target.value); setScanOpen(false); setReview(false); setScanCode('') }}><option value="">Seleccionar factura</option>{data.invoices.toReversed().map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.departedAt ? 'Salió' : 'Abierta'} · {invoice.boxIds.length} caja(s)</option>)}</select></label>
      {activeInvoice && <div className="a1-panel">
        <h3>{activeInvoice.number}</h3><p>Cargada en: <strong>{activeInvoice.loadedIn}</strong></p>
        <p>{activeInvoice.boxIds.length} caja(s) {activeInvoice.departedAt ? 'salieron' : 'asignadas'}</p>
        {activeInvoice.departedAt ? <div className="a1-success">Salida confirmada: {new Date(activeInvoice.departedAt).toLocaleString()} · Historial conservado.</div> : <>
          <button type="button" className="a1-primary" onClick={() => { setScanOpen(true); setReview(false); requestAnimationFrame(() => invoiceInput.current?.focus()) }}>Agregar Trackings</button>
          {scanOpen && <form onSubmit={assign} className="a1-form"><label>Escanear tracking o sticker<input ref={invoiceInput} autoFocus value={scanCode} onChange={event => setScanCode(event.target.value)} placeholder="Tracking o 000135" autoComplete="off" /></label><button disabled={!scanCode.trim()}>Agregar caja</button></form>}
        </>}
        {activeInvoice.boxIds.map(id => {
          const box = data.boxes.find(item => item.id === id)
          return box && <div className="a1-assigned" key={id}><div><strong>Caja {box.number || 'sin sticker'}</strong><div className="a1-code">{box.tracking}</div>{box.noms && <small>NOMS · </small>}{box.osd && <small>OS&amp;D: {box.osd}</small>}</div>{!activeInvoice.departedAt && <button type="button" onClick={() => { commit({ type: 'remove', invoiceId: activeInvoice.id, boxId: id }); setReview(false) }}>Quitar</button>}</div>
        })}
        {!activeInvoice.departedAt && <>
          <button type="button" disabled={!activeInvoice.boxIds.length} onClick={() => { setReview(true); setScanOpen(false) }}>Revisar salida</button>
          {review && <div className="a1-review"><h3>Confirmar salida</h3><p>{activeInvoice.number} · {activeInvoice.loadedIn} · {activeInvoice.boxIds.length} caja(s).</p><p>La salida requiere escanear cada caja en la sección Salida.</p><button type="button" className="a1-primary" onClick={async () => { if (await commit({ type: 'depart', invoiceId: activeInvoice.id })) setReview(false) }}>Confirmar salida</button><button type="button" onClick={() => setReview(false)}>Seguir revisando</button></div>}
        </>}
      </div>}
    </section>}

    {tab === 'exit' && <A1Exit data={data} date={date} commit={commit} />}
    <label>Filtrar historial por fecha<input type="date" value={historyDate} onChange={event => setHistoryDate(event.target.value)} /></label>
    <details open={showHistory} onToggle={event => setShowHistory(event.currentTarget.open)} className="a1-panel"><summary>Historial de la prueba ({data.events.length})</summary>{data.events.filter(event => !historyDate || new Date(event.at).toLocaleDateString('sv-SE') === historyDate).toReversed().map((event, index) => <p className="a1-help" key={`${event.at}-${index}`}>{new Date(event.at).toLocaleString()} · {event.message}</p>)}</details>

    {editing && <div className="a1-overlay"><section className="a1-dialog" role="dialog" aria-modal="true" aria-labelledby="a1-edit-title"><h2 id="a1-edit-title">Identificar / editar caja</h2><p className="a1-code">{editing.tracking}</p>
      {error && <div role="alert" className="a1-error">{error}</div>}
      <form className="a1-form" onSubmit={async event => { event.preventDefault(); const { id, tracking: unusedTracking, ...changes } = editing; void unusedTracking; if (await commit({ type: 'edit', id, changes })) setEditing(null) }}>
        <label>Número del sticker<input ref={stickerInput} autoFocus value={editing.number} onChange={event => setEditing({ ...editing, number: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); stickerInput.current?.blur() } }} placeholder="000135 o A1-000135" autoComplete="off" /></label>
        <label>Fecha de recepción<input type="date" required value={editing.receivedDate} onChange={event => setEditing({ ...editing, receivedDate: event.target.value })} /></label>
        <label className="a1-check"><input type="checkbox" checked={editing.noms} onChange={event => setEditing({ ...editing, noms: event.target.checked })} />NOM</label>
        <label>OSND<select value={editing.osd} onChange={event => setEditing({ ...editing, osd: event.target.value as A1Box['osd'] })}><option value="">Sin marca OSND</option><option>Retenido</option><option>Sobrante</option><option>Faltante</option><option>Daño</option></select></label>
        <label>Observaciones<textarea value={editing.note} required={!!editing.osd} onChange={event => setEditing({ ...editing, note: event.target.value })} /></label>
        <label>Foto opcional (máximo 750 KB)<input type="file" accept="image/*" onChange={event => void choosePhoto(event.target.files?.[0])} /></label>
        {editing.photo && <><img className="a1-photo" src={editing.photo} alt="Evidencia" /><button type="button" onClick={() => setEditing({ ...editing, photo: '' })}>Quitar foto</button></>}
        <div className="a1-dialog-buttons"><button type="button" onClick={() => { setEditing(null); setError('') }}>Cancelar</button><button className="a1-primary">Guardar caja</button></div>
      </form>
    </section></div>}
    </fieldset>
  </div>
}
