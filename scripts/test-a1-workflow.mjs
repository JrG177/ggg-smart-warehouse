import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../src/features/a1/a1TrialStore.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const { emptyA1Data, applyA1Action, a1WorkStatus, a1Matches, a1Departed } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
let data = emptyA1Data(), sequence = 0
function act(action) { data = applyA1Action(data, action, `box-${++sequence}`, '2026-10-07T15:00:00Z').data }
function rejects(action, pattern) { const before = JSON.stringify(data); assert.throws(() => act(action), pattern); assert.equal(JSON.stringify(data), before) }
act({ type: 'receive', tracking: '1ZE6E2730392498822', date: '2026-10-07' })
act({ type: 'receive', tracking: '123456789012', date: '2026-10-07' }) // FedEx tracking entered alone.
act({ type: 'receive', tracking: '987654321', date: '2026-10-07' }) // XPO PRO entered alone.
const [normal, nom, osnd] = data.boxes.map(box => box.id)
rejects({ type: 'finishReceiving', ids: [normal, nom, osnd] }, /Clasifica/)
rejects({ type: 'exitBoxes', ids: [normal], date: '2026-10-07' }, /clasificación/)
act({ type: 'classify', id: normal, classification: 'normal', note: '' })
act({ type: 'classify', id: nom, classification: 'nom', note: '' })
rejects({ type: 'classify', id: osnd, classification: 'osnd', note: '' }, /observación/)
act({ type: 'classify', id: osnd, classification: 'osnd', note: 'Caja dañada, pendiente autorización externa' })
act({ type: 'finishReceiving', ids: [normal, nom, osnd] })
assert.equal(a1WorkStatus(data, data.boxes[0]), 'Falta de factura')
assert.equal(a1WorkStatus(data, data.boxes[1]), 'Falta de factura')
assert.equal(a1WorkStatus(data, data.boxes[2]), 'OSND · Retenida')
rejects({ type: 'classify', id: osnd, classification: 'normal', note: '' }, /autorización externa/)
rejects({ type: 'edit', id: osnd, changes: { ...data.boxes[2], osd: '' } }, /autorización externa/)
rejects({ type: 'edit', id: osnd, changes: { ...data.boxes[2], externalRelease: { reference: 'inventada', at: 'now' } } }, /no puede autorizar/)
rejects({ type: 'exitBoxes', ids: [normal, osnd], date: '2026-10-07' }, /OSND/)
assert.equal(a1Departed(data, data.boxes[0]), null) // Batch rejection saves no partial departure.
rejects({ type: 'exitBoxes', ids: [normal, normal], date: '2026-10-07' }, /duplicados/)
rejects({ type: 'exitBoxes', ids: [normal], date: '2026-10-06' }, /anterior/)
assert.ok(a1Matches(data.boxes[0], '8822'))
assert.ok(a1Matches(data.boxes[0], '1Z E6E2730392498822'))
assert.ok(!a1Matches(data.boxes[0], '1ZE6'))
act({ type: 'createInvoice', number: 'A1-TEST', loadedIn: '58' })
const invoiceId = data.invoices[0].id
rejects({ type: 'assign', invoiceId, code: data.boxes[2].tracking }, /OSND/)
act({ type: 'assign', invoiceId, code: data.boxes[0].tracking })
act({ type: 'assign', invoiceId, code: data.boxes[1].tracking })
rejects({ type: 'depart', invoiceId }, /Escanea todas/)
act({ type: 'exitBoxes', ids: [normal], date: '2026-10-07' })
assert.equal(data.invoices[0].departedAt, null) // Invoice remains open until all boxes exit.
act({ type: 'exitBoxes', ids: [nom], date: '2026-10-07' })
assert.ok(data.invoices[0].departedAt)
rejects({ type: 'exitBoxes', ids: [normal], date: '2026-10-07' }, /ya salió/)
assert.equal(data.boxes[0].receivedDate, '2026-10-07')
assert.equal(data.boxes.length, 3)
assert.ok(data.events.some(event => event.message.includes('Salida registrada')))
console.log('A1: clasificación obligatoria, Normal/NOM a Falta de factura, OSND retenida, salida por escaneo, fechas, duplicados y trazabilidad verificadas.')
