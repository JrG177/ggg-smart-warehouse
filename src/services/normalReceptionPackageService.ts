import { supabase } from '../lib/supabase'
import type { QuickReceptionPackageInput } from './quickReceivingService'

export type NormalReceptionPackageInput = QuickReceptionPackageInput & {
  palletNumber: number
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
  status: 'received' | 'assigned' | 'shipped'
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
    }
  })

  const { data, error } = await supabase
    .from('warehouse_packages')
    .insert(rows)
    .select('*')

  if (error) {
    throw new Error(`La recepción se guardó, pero no se pudieron generar sus QR: ${error.message}`)
  }

  return (data ?? []) as NormalReceptionWarehousePackage[]
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
