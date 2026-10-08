import { supabase } from '../../lib/supabase'
import { applyA1Action, saveA1Action } from './a1TrialStore'
import type { A1Action, A1Data } from './a1TrialStore'

export const A1_SHARED = import.meta.env.VITE_A1_SHARED === 'true'
type Snapshot = { revision: number; data: A1Data }
let newest: Snapshot | null = null
async function readSnapshot(): Promise<Snapshot> {
  const response = await supabase.from('a1_workspace').select('revision,data').eq('id', 'a1').single()
  if (response.error) throw new Error(`No se pudo abrir A1 compartido: ${response.error.message}. Comprueba la migración SQL.`)
  const snapshot = response.data as Snapshot
  if (!newest || snapshot.revision >= newest.revision) newest = snapshot
  return newest
}
export async function readSharedA1() { return (await readSnapshot()).data }
export async function persistA1Action(action: A1Action) {
  if (!A1_SHARED) return saveA1Action(action)
  const snapshot = await readSnapshot()
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `a1-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-')}`
  const result = applyA1Action(snapshot.data, action, id, new Date().toISOString())
  const response = await supabase.rpc('save_a1_workspace', { p_revision: snapshot.revision, p_data: result.data })
  if (response.error) throw new Error(response.error.message)
  const saved = response.data as Snapshot
  if (!newest || saved.revision >= newest.revision) newest = saved
  return { data: newest.data, message: result.message }
}
