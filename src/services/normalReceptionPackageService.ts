import { supabase } from '../lib/supabase'
import type { QuickReceptionPackageInput } from './quickReceivingService'

export type NormalReceptionPackageInput = QuickReceptionPackageInput & {
  palletNumber: number
  conditionStatus?: 'good' | 'damaged' | 'missing_packing'
  exceptionReason?: 'damage' | 'missing_packing' | null
  exceptionNotes?: string
}

export type NormalReceptionWarehousePackage = {
  id: string
  tracking_code: string
  reception_id: string
  pallet_id: string
  part_number: string
  purchase_order: string | null
  quantity: number | null
  supplier_code: string | null
  supplier_package_id: string | null
  supplier_package_type: '3S' | '4S' | null
  raw_codes: Record<string, string>
  status: 'received' | 'assigned' | 'osd_hold' | 'shipped'
  condition_status?: 'good' | 'damaged' | 'missing_packing'
  exception_reason?: 'damage' | 'missing_packing' | null
  exception_notes?: string | null
  created_at: string
  pallet_number?: number
}

type ReceptionPalletReference = {
  id: string
  pallet_number: number
}

export async function createNormalReceptionPackages(
  receptionId: string,
  packages: NormalReceptionPackageInput[],
): Promise<NormalReceptionWarehousePackage[]> {
  if (packages.length === 0) return []

  const { data: pallets, error: palletsError } = await supabase
    .from('pallets')
    .select('id, pallet_number')
    .eq('reception_id', receptionId)
    .order('pallet_number', { ascending: true })

  if (palletsError) {
    throw new Error(`No se pudieron relacionar los paquetes con sus pallets: ${palletsError.message}`)
  }

  const palletByNumber = new Map(
    ((pallets ?? []) as ReceptionPalletReference[]).map((pallet) => [
      pallet.pallet_number,
      pallet.id,
    ]),
  )

  const rows = packages.map((item) => {
    const palletId = palletByNumber.get(item.palletNumber)

    if (!palletId) {
      throw new Error(`No se encontró el pallet ${item.palletNumber} para guardar sus códigos.`)
    }

    return {
      reception_id: receptionId,
      pallet_id: palletId,
      part_number: item.partNumber,
      purchase_order: item.purchaseOrder || null,
      quantity: item.quantity,
      supplier_code: item.supplierCode || null,
      supplier_package_id: item.supplierPackageId || null,
      supplier_package_type: item.supplierPackageType,
      raw_codes: item.rawCodes,
      status: item.conditionStatus && item.conditionStatus !== 'good' ? 'osd_hold' : 'received',
      condition_status: item.conditionStatus || 'good',
      exception_reason: item.exceptionReason || null,
      exception_notes: item.exceptionNotes?.trim() || null,
    }
  })

  const { data, error } = await supabase
    .from('warehouse_packages')
    .insert(rows)
    .select('*')

  if (error) {
    throw new Error(`La recepción se guardó, pero no se pudieron generar sus QR: ${error.message}`)
  }

  const saved = (data ?? []) as NormalReceptionWarehousePackage[]
  const osdRows = saved
    .filter((item) => item.condition_status && item.condition_status !== 'good')
    .map((item) => ({
      warehouse_package_id: item.id,
      reception_id: receptionId,
      reason: item.exception_reason || 'damage',
      notes: item.exception_notes,
    }))

  if (osdRows.length) {
    const { error: osdError } = await supabase.from('inventory_osd_cases').insert(osdRows)
    if (osdError) throw new Error(`Los paquetes se guardaron, pero OS&D falló: ${osdError.message}`)
  }

  return saved
}

export async function listNormalReceptionPackages(
  receptionId: string,
): Promise<NormalReceptionWarehousePackage[]> {
  const { data, error } = await supabase
    .from('warehouse_packages')
    .select('*, pallets!warehouse_packages_pallet_id_fkey(pallet_number)')
    .eq('reception_id', receptionId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`No se pudieron cargar los QR de la recepción: ${error.message}`)
  }

  return (data ?? []).map((item) => {
    const pallet = Array.isArray(item.pallets)
      ? item.pallets[0]
      : item.pallets

    return {
      ...item,
      pallet_number: pallet?.pallet_number,
    } as NormalReceptionWarehousePackage
  })
}
