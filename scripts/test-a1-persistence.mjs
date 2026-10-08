import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const uri = value => `data:text/javascript;base64,${Buffer.from(value).toString('base64')}`
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const storeUri = uri(compile('../src/features/a1/a1TrialStore.ts'))
const mockUri = uri(`export const state={revision:0,data:{version:1,boxes:[],invoices:[],events:[]}};
export const supabase={from(){return {select(){return this},eq(){return this},async single(){const data=structuredClone(state);await Promise.resolve();return {data}}}},async rpc(name,args){if(name!=='save_a1_workspace')throw Error('Wrong RPC');if(state.revision!==args.p_revision)return {error:{message:'Otro equipo actualizó A1'}};state.revision++;state.data=structuredClone(args.p_data);return {data:structuredClone(state)}}};`)
const service = compile('../src/features/a1/a1Persistence.ts').replace("'../../lib/supabase'", JSON.stringify(mockUri)).replace("'./a1TrialStore'", JSON.stringify(storeUri)).replace('import.meta.env.VITE_A1_SHARED', "'true'")
const { persistA1Action, readSharedA1 } = await import(uri(service))
const { state } = await import(mockUri)
const results = await Promise.allSettled([
  persistA1Action({type:'receive',tracking:'123456789012',date:'2026-10-07'}),
  persistA1Action({type:'receive',tracking:'987654321',date:'2026-10-07'}),
])
assert.equal(results.filter(result=>result.status==='fulfilled').length,1)
assert.equal(results.filter(result=>result.status==='rejected').length,1)
assert.equal(state.data.boxes.length,1)
assert.equal(state.revision,1)
const missing = state.data.boxes[0].tracking==='123456789012' ? '987654321' : '123456789012'
await persistA1Action({type:'receive',tracking:missing,date:'2026-10-07'})
assert.equal((await readSharedA1()).boxes.length,2)
assert.equal(state.revision,2)
console.log('A1 compartido: conflicto entre equipos sin sobrescritura y reintento conservando ambos registros verificados con servidor simulado.')
