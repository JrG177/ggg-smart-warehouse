import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Part = { id: string; part_number: string; quantity: number }
type Row = { number: string; expected: number; scanned: number; verified?: boolean }
export function ShipmentInvoiceDetail({ invoiceId, invoiceNumber, parts, onClose }: { invoiceId: string; invoiceNumber: string; parts: Part[]; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    const previouslyFocused = document.activeElement as HTMLElement | null
    element.showModal()
    return () => { element.close(); previouslyFocused?.focus() }
  }, [])
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const importedResponse = await supabase.from('invoice_imports').select('invoice_id').eq('invoice_id', invoiceId).maybeSingle()
        if (importedResponse.error) throw importedResponse.error
        const isImport = !!importedResponse.data
        let result: Row[]
        if (isImport) {
          const [lines, scans] = await Promise.all([
            supabase.from('invoice_import_lines').select('part_number,commercial_quantity').eq('invoice_id', invoiceId),
            supabase.from('invoice_load_scans').select('part_number,quantity').eq('invoice_id', invoiceId).eq('result', 'accepted'),
          ])
          if (lines.error) throw lines.error
          if (scans.error) throw scans.error
          const normalize = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
          const grouped = new Map<string, Row>()
          for (const line of lines.data || []) {
            const key = normalize(line.part_number || '')
            const row = grouped.get(key) || { number: line.part_number || 'Sin número de parte', expected: 0, scanned: 0 }
            row.expected += Number(line.commercial_quantity || 0); grouped.set(key, row)
          }
          for (const scan of scans.data || []) {
            const key = normalize(scan.part_number || '')
            const row = grouped.get(key) || { number: scan.part_number || 'Sin número de parte', expected: 0, scanned: 0 }
            row.scanned += Number(scan.quantity || 0); grouped.set(key, row)
          }
          result = [...grouped.values()]
        } else {
          const checks = await supabase.from('invoice_part_checks').select('pallet_part_id,reviewed').eq('invoice_id', invoiceId)
          if (checks.error) throw checks.error
          const reviewed = new Set((checks.data || []).filter(check => check.reviewed).map(check => check.pallet_part_id))
          result = [...new Map(parts.map(part => [part.id, part])).values()].map(part => ({ number: part.part_number, expected: Number(part.quantity || 0), scanned: 0, verified: reviewed.has(part.id) }))
        }
        if (active) { setRows(result); setImported(isImport) }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : (err as { message?: string }).message || 'No se pudo cargar el contenido.') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [invoiceId, parts])
  const quantity = (value: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 4 }).format(value)
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose() }} aria-labelledby="shipment-detail-title" className="m-auto w-[calc(100%_-_24px)] max-w-4xl max-h-[90dvh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 text-white backdrop:bg-black/60">
    <header className="mb-4 flex items-start justify-between gap-3"><div><h2 id="shipment-detail-title" className="break-all text-xl font-bold">{invoiceNumber}</h2><p className="text-sm text-slate-400">Contenido y estado de verificación</p></div><button autoFocus type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2">Cerrar</button></header>
    {loading ? <p role="status">Cargando contenido…</p> : error ? <p role="alert" className="text-red-400">{error}</p> : !rows.length ? <p>No se encontró contenido asociado a esta factura.</p> : <>
      {!imported && <p className="mb-3 text-sm text-slate-400">Las facturas de recepción registran revisión de partes. No tienen un conteo de unidades escaneadas.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-700"><tr><th className="p-3">Número de parte</th><th className="p-3">Cantidad</th>{imported && <><th className="p-3">Escaneadas</th><th className="p-3">Pendientes</th></>}<th className="p-3">Estatus</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.number}-${index}`} className="border-b border-slate-800"><td className="p-3 font-semibold">{row.number}</td><td className="p-3">{quantity(row.expected)}</td>{imported && <><td className="p-3">{quantity(row.scanned)}</td><td className="p-3">{quantity(Math.max(0, row.expected - row.scanned))}</td></>}<td className="p-3">{imported ? Math.abs(row.expected - row.scanned) < .0001 ? 'Completa' : row.scanned > row.expected ? 'Exceso' : row.scanned > 0 ? 'Parcial' : 'Sin escaneo' : row.verified ? 'Revisada' : 'Pendiente de revisión'}</td></tr>)}</tbody></table></div>
    </>}
  </dialog>
}
