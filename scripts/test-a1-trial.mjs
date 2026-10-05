import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../src/features/a1/a1TrialStore.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const { emptyA1Data, applyA1Action, normalizeTracking } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
let data = emptyA1Data()
let counter = 0
function act(action) { const result = applyA1Action(data, action, `id${++counter}`, '2026-10-02T14:00:00.000Z'); data = result.data; return result }
function rejects(action, pattern) { const before = JSON.stringify(data); assert.throws(() => act(action), pattern); assert.equal(JSON.stringify(data), before) }
act({ type: 'receive', tracking: '1z TEST 000000000135', date: '2026-10-02' })
assert.equal(data.boxes[0].tracking, '1ZTEST000000000135')
rejects({ type: 'receive', tracking: '1ZTEST000000000135', date: '2026-10-03' }, /ya recibido/)
rejects({ type: 'receive', tracking: 'OTHERTRACKING1', date: '2026-02-30' }, /fecha/)
const boxId = data.boxes[0].id
act({ type: 'edit', id: boxId, changes: { ...data.boxes[0], number: 'A1-000135' } })
assert.equal(data.boxes[0].number, '135')
act({ type: 'receive', tracking: '1ZTEST000000000136', date: '2026-10-02' })
rejects({ type: 'edit', id: data.boxes[1].id, changes: { ...data.boxes[1], number: '000135' } }, /otra caja/)
rejects({ type: 'edit', id: boxId, changes: { ...data.boxes[0], osd: 'Daño', note: '' } }, /observación/)
act({ type: 'createInvoice', number: 'INV-41496', loadedIn: '58' })
const invoiceId = data.invoices[0].id
rejects({ type: 'createInvoice', number: '41496', loadedIn: '58' }, /ya existe/)
rejects({ type: 'createInvoice', number: '41497', loadedIn: ' ' }, /unidad/)
rejects({ type: 'depart', invoiceId }, /al menos/)
act({ type: 'assign', invoiceId, code: '000135' })
rejects({ type: 'assign', invoiceId, code: '1ZTEST000000000135' }, /no se duplicó/)
act({ type: 'createInvoice', number: '41497', loadedIn: 'TRAILER 72' })
const secondId = data.invoices[1].id
rejects({ type: 'assign', invoiceId: secondId, code: '135' }, /asignada/)
act({ type: 'remove', invoiceId, boxId })
act({ type: 'assign', invoiceId: secondId, code: '1ZTEST000000000135' })
act({ type: 'depart', invoiceId: secondId })
rejects({ type: 'remove', invoiceId: secondId, boxId }, /ya salió/)
rejects({ type: 'assign', invoiceId, code: '135' }, /salida/)
rejects({ type: 'edit', id: boxId, changes: { ...data.boxes[0], number: '136' } }, /ya salió/)
assert.equal(data.boxes.length, 2)
assert.equal(data.invoices[1].boxIds[0], boxId)
assert.ok(data.events.length > 0)
console.log('A1: recepción, normalización, duplicados, stickers, OS&D, asignación y salida verificadas.')

assert.equal(normalizeTracking('420788401Z7370030368008473'), '1Z7370030368008473')
assert.equal(normalizeTracking('1Z3527040392456826420788400000'), '1Z3527040392456826')
assert.equal(normalizeTracking(']C01Z3527040392456826|42078840'), '1Z3527040392456826')
assert.equal(normalizeTracking('1Z3527040392456826|1Z3527040392456826'), '1Z3527040392456826')
assert.throws(() => normalizeTracking('1Z3527040392456826|1Z7370030368008473'), /varias cajas/)
assert.throws(() => normalizeTracking('1Z35270403'), /incompleto/)
data = emptyA1Data()
act({ type: 'receive', tracking: '420788401Z7370030368008473', date: '2026-10-03' })
assert.equal(data.boxes[0].tracking, '1Z7370030368008473')
assert.equal(data.boxes[0].originalTracking, '420788401Z7370030368008473')
rejects({ type: 'receive', tracking: '1Z7370030368008473', date: '2026-10-03' }, /ya recibido/)
data.boxes[0].tracking = '420788401Z7370030368008473'
act({ type: 'createInvoice', number: 'UPS-TEST', loadedIn: '58' })
act({ type: 'assign', invoiceId: data.invoices[0].id, code: '1Z7370030368008473' })
act({ type: 'cleanTrackings' })
assert.equal(data.boxes[0].tracking, '1Z7370030368008473')
assert.equal(data.invoices[0].boxIds[0], data.boxes[0].id)
data.boxes.push({ ...data.boxes[0], id: 'duplicate' })
rejects({ type: 'cleanTrackings' }, /dos registros/)
console.log('UPS: ejemplos reales, concatenación, lecturas ambiguas, duplicados y corrección de datos antiguos verificados.')

// Paired reception must save tracking and sticker together, or save neither.
const pairedBase = emptyA1Data()
const paired = applyA1Action(pairedBase, { type: 'receive', tracking: '4207884000001Z9293810306974936', date: '2026-10-05', number: 'A1-000135' }, 'paired-1', '2026-10-05T16:00:00Z').data
assert.equal(paired.boxes[0].tracking, '1Z9293810306974936')
assert.equal(paired.boxes[0].number, '135')
const pairedBefore = JSON.stringify(paired)
assert.throws(() => applyA1Action(paired, { type: 'receive', tracking: '1ZE6E2730392498822', date: '2026-10-05', number: '000135' }, 'paired-2', 'now'), /otra caja/)
assert.equal(JSON.stringify(paired), pairedBefore)
assert.throws(() => applyA1Action(pairedBase, { type: 'receive', tracking: '1ZE6E2730392498822', date: '2026-10-05', number: 'BAD-STICKER' }, 'paired-3', 'now'))
assert.equal(pairedBase.boxes.length, 0)
console.log('Recepción continua: guardado conjunto, sticker inválido y duplicado sin registros parciales verificados.')
