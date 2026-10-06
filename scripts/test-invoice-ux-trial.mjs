import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../src/features/trials/invoiceTrial.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { emptyTrial, scanTrial, finishTrial, trialLines } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
let state = emptyTrial()
assert.throws(() => scanTrial(state, 'Q10'), /Primero/)
assert.throws(() => scanTrial(state, 'P999-9999Q2'), /fuera/)
state = scanTrial(state, 'P432-2923').state
assert.equal(state.pending, '432-2923')
const before = JSON.stringify(state)
assert.throws(() => scanTrial(state, 'Q11'), /Excede/)
assert.equal(JSON.stringify(state), before)
assert.throws(() => scanTrial(state, 'Q0'), /entero/)
state = scanTrial(state, 'Q10').state
assert.equal(state.counts['432-2923'], 10)
assert.equal(state.pending, '')
assert.throws(() => scanTrial(state, 'P432-2923|Q10'), /Excede/)
assert.throws(() => finishTrial(state), /pendientes/)
for (const line of trialLines.slice(1)) state = scanTrial(state, `P${line.part}|Q${line.quantity}`).state
state = finishTrial(state)
assert.equal(state.complete, true)
assert.throws(() => scanTrial(state, 'P389-0834Q4'), /completa/)
console.log('Factura demo: P y Q separados/juntos, cantidades, rechazos, pendientes y cierre verificados.')
