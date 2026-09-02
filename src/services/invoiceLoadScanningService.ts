import { supabase } from '../lib/supabase'

export type InvoiceLoadScanResultCode =
  | 'accepted'
  | 'not_in_invoice'
  | 'duplicate'
  | 'quantity_exceeded'
  | 'not_found'
  | 'ambiguous'
  | 'assigned_elsewhere'
  | 'unavailable'

export type InvoiceLoadScan = {
  id: string
  invoice_id: string
  warehouse_package_id: string | null
  raw_code: string
  part_number: string | null
  quantity: number
  result: InvoiceLoadScanResultCode
  message: string
  created_at: string
}

export type InvoiceLoadScanOutcome = {
  scan: InvoiceLoadScan
  expectedQuantity: number
  scannedQuantity: number
  remainingQuantity: number
  trackingCode: string | null
}

type WarehousePackageRecord = {
  id: string
  tracking_code: string
  part_number: string
  quantity: number | null
  supplier_package_id: string | null
  supplier_package_type: string | null
  status: string
}

type InvoiceLineRecord = {
  part_number: string
  commercial_quantity: number
}

function cleanScanCode(value: string) {
  return value
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
    .trim()
    .replace(/^\*|\*$/g, '')
    .toUpperCase()
}

function normalizePartNumber(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function roundQuantity(value: number) {
  return Math.round(Number(value || 0) * 10000) / 10000
}

async function findWarehousePackage(rawCode: string) {
  const cleaned = cleanScanCode(rawCode)

  const { data: trackingMatches, error: trackingError } =
    await supabase
      .from('warehouse_packages')
      .select(`
        id,
        tracking_code,
        part_number,
        quantity,
        supplier_package_id,
        supplier_package_type,
        status
      `)
      .eq('tracking_code', cleaned)
      .limit(2)

  if (trackingError) {
    throw new Error(trackingError.message)
  }

  if ((trackingMatches || []).length === 1) {
    return {
      cleaned,
      packageRecord:
        trackingMatches?.[0] as WarehousePackageRecord,
      ambiguous: false,
    }
  }

  const supplierType =
    cleaned.startsWith('3S')
      ? '3S'
      : cleaned.startsWith('4S')
        ? '4S'
        : null

  const supplierId = supplierType
    ? cleaned.slice(2)
    : cleaned

  if (!supplierId) {
    return {
      cleaned,
      packageRecord: null,
      ambiguous: false,
    }
  }

  let supplierQuery = supabase
    .from('warehouse_packages')
    .select(`
      id,
      tracking_code,
      part_number,
      quantity,
      supplier_package_id,
      supplier_package_type,
      status
    `)
    .eq('supplier_package_id', supplierId)
    .limit(2)

  if (supplierType) {
    supplierQuery = supplierQuery.eq(
      'supplier_package_type',
      supplierType,
    )
  }

  const { data: supplierMatches, error: supplierError } =
    await supplierQuery

  if (supplierError) {
    throw new Error(supplierError.message)
  }

  const matches =
    (supplierMatches || []) as WarehousePackageRecord[]

  return {
    cleaned,
    packageRecord:
      matches.length === 1
        ? matches[0]
        : null,
    ambiguous: matches.length > 1,
  }
}

async function insertScan(input: {
  invoiceId: string
  packageRecord: WarehousePackageRecord | null
  rawCode: string
  partNumber: string | null
  quantity: number
  result: InvoiceLoadScanResultCode
  message: string
}) {
  const { data, error } = await supabase
    .from('invoice_load_scans')
    .insert({
      invoice_id: input.invoiceId,
      warehouse_package_id:
        input.packageRecord?.id || null,
      raw_code: input.rawCode,
      part_number: input.partNumber,
      quantity: input.quantity,
      result: input.result,
      message: input.message,
    })
    .select(`
      id,
      invoice_id,
      warehouse_package_id,
      raw_code,
      part_number,
      quantity,
      result,
      message,
      created_at
    `)
    .single()

  if (error || !data) {
    throw new Error(
      error?.message ||
        'No se pudo guardar el escaneo.',
    )
  }

  return data as InvoiceLoadScan
}

async function getExpectedAndScannedQuantity(
  invoiceId: string,
  partNumber: string,
) {
  const normalizedPart =
    normalizePartNumber(partNumber)

  const [linesResponse, scansResponse] =
    await Promise.all([
      supabase
        .from('invoice_import_lines')
        .select('part_number, commercial_quantity')
        .eq('invoice_id', invoiceId),
      supabase
        .from('invoice_load_scans')
        .select('part_number, quantity')
        .eq('invoice_id', invoiceId)
        .eq('result', 'accepted'),
    ])

  if (linesResponse.error) {
    throw new Error(linesResponse.error.message)
  }

  if (scansResponse.error) {
    throw new Error(scansResponse.error.message)
  }

  const expectedQuantity = roundQuantity(
    ((linesResponse.data || []) as InvoiceLineRecord[])
      .filter(
        (line) =>
          normalizePartNumber(line.part_number) ===
          normalizedPart,
      )
      .reduce(
        (total, line) =>
          total +
          Number(line.commercial_quantity || 0),
        0,
      ),
  )

  const scannedQuantity = roundQuantity(
    (scansResponse.data || [])
      .filter(
        (scan) =>
          normalizePartNumber(
            String(scan.part_number || ''),
          ) === normalizedPart,
      )
      .reduce(
        (total, scan) =>
          total + Number(scan.quantity || 0),
        0,
      ),
  )

  return {
    expectedQuantity,
    scannedQuantity,
  }
}

export async function scanInvoicePackage(
  invoiceId: string,
  rawCode: string,
): Promise<InvoiceLoadScanOutcome> {
  const cleanedInput = cleanScanCode(rawCode)

  if (!cleanedInput) {
    throw new Error('El escaneo está vacío.')
  }

  if (cleanedInput.startsWith('P') && cleanedInput.length > 1) {
    const partNumber = cleanedInput.slice(1).trim()
    const { expectedQuantity, scannedQuantity } =
      await getExpectedAndScannedQuantity(invoiceId, partNumber)

    if (expectedQuantity <= 0) {
      const message = `NO SE VA: la parte ${partNumber} no aparece en la factura.`
      const scan = await insertScan({
        invoiceId,
        packageRecord: null,
        rawCode: cleanedInput,
        partNumber,
        quantity: 0,
        result: 'not_in_invoice',
        message,
      })

      return {
        scan,
        expectedQuantity: 0,
        scannedQuantity,
        remainingQuantity: 0,
        trackingCode: null,
      }
    }

    if (scannedQuantity + 1 > expectedQuantity + 0.0001) {
      const message = `CANTIDAD COMPLETA: ya se registraron ${expectedQuantity} de ${partNumber}.`
      const scan = await insertScan({
        invoiceId,
        packageRecord: null,
        rawCode: cleanedInput,
        partNumber,
        quantity: 0,
        result: 'quantity_exceeded',
        message,
      })

      return {
        scan,
        expectedQuantity,
        scannedQuantity,
        remainingQuantity: 0,
        trackingCode: null,
      }
    }

    const nextScannedQuantity = roundQuantity(scannedQuantity + 1)
    const remainingQuantity = roundQuantity(expectedQuantity - nextScannedQuantity)
    const message = remainingQuantity <= 0
      ? `SE VA: ${partNumber} quedó completo.`
      : `SE VA: ${partNumber} agregado. Faltan ${remainingQuantity}.`
    const scan = await insertScan({
      invoiceId,
      packageRecord: null,
      rawCode: cleanedInput,
      partNumber,
      quantity: 1,
      result: 'accepted',
      message,
    })

    return {
      scan,
      expectedQuantity,
      scannedQuantity: nextScannedQuantity,
      remainingQuantity,
      trackingCode: null,
    }
  }

  const {
    cleaned,
    packageRecord,
    ambiguous,
  } = await findWarehousePackage(rawCode)

  if (!cleaned) {
    throw new Error('El escaneo está vacío.')
  }

  if (ambiguous) {
    const message =
      'Este 3S/4S aparece en más de un paquete. Escanea el QR único de GGG.'

    const scan = await insertScan({
      invoiceId,
      packageRecord: null,
      rawCode: cleaned,
      partNumber: null,
      quantity: 0,
      result: 'ambiguous',
      message,
    })

    return {
      scan,
      expectedQuantity: 0,
      scannedQuantity: 0,
      remainingQuantity: 0,
      trackingCode: null,
    }
  }

  if (!packageRecord) {
    const message =
      'Código no encontrado. Escanea el QR de GGG o el 3S/4S del paquete.'

    const scan = await insertScan({
      invoiceId,
      packageRecord: null,
      rawCode: cleaned,
      partNumber: null,
      quantity: 0,
      result: 'not_found',
      message,
    })

    return {
      scan,
      expectedQuantity: 0,
      scannedQuantity: 0,
      remainingQuantity: 0,
      trackingCode: null,
    }
  }

  const quantity = Number(
    packageRecord.quantity || 1,
  )

  const {
    expectedQuantity,
    scannedQuantity,
  } = await getExpectedAndScannedQuantity(
    invoiceId,
    packageRecord.part_number,
  )

  const baseInput = {
    invoiceId,
    packageRecord,
    rawCode: cleaned,
    partNumber: packageRecord.part_number,
    quantity,
  }

  if (packageRecord.status === 'shipped') {
    const message =
      'NO SE VA: este paquete ya aparece como enviado.'

    const scan = await insertScan({
      ...baseInput,
      result: 'unavailable',
      message,
    })

    return {
      scan,
      expectedQuantity,
      scannedQuantity,
      remainingQuantity: roundQuantity(
        expectedQuantity - scannedQuantity,
      ),
      trackingCode: packageRecord.tracking_code,
    }
  }

  const { data: duplicateScan, error: duplicateError } =
    await supabase
      .from('invoice_load_scans')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('warehouse_package_id', packageRecord.id)
      .eq('result', 'accepted')
      .limit(1)
      .maybeSingle()

  if (duplicateError) {
    throw new Error(duplicateError.message)
  }

  if (duplicateScan) {
    const message =
      'DUPLICADO: este paquete ya fue aceptado en esta factura.'

    const scan = await insertScan({
      ...baseInput,
      result: 'duplicate',
      message,
    })

    return {
      scan,
      expectedQuantity,
      scannedQuantity,
      remainingQuantity: roundQuantity(
        expectedQuantity - scannedQuantity,
      ),
      trackingCode: packageRecord.tracking_code,
    }
  }

  const { data: otherInvoiceScan, error: otherInvoiceError } =
    await supabase
      .from('invoice_load_scans')
      .select('id')
      .eq('warehouse_package_id', packageRecord.id)
      .eq('result', 'accepted')
      .neq('invoice_id', invoiceId)
      .limit(1)
      .maybeSingle()

  if (otherInvoiceError) {
    throw new Error(otherInvoiceError.message)
  }

  if (otherInvoiceScan) {
    const message =
      'NO SE VA: este paquete ya está asignado a otra factura.'

    const scan = await insertScan({
      ...baseInput,
      result: 'assigned_elsewhere',
      message,
    })

    return {
      scan,
      expectedQuantity,
      scannedQuantity,
      remainingQuantity: roundQuantity(
        expectedQuantity - scannedQuantity,
      ),
      trackingCode: packageRecord.tracking_code,
    }
  }

  if (expectedQuantity <= 0) {
    const message =
      `NO SE VA: la parte ${packageRecord.part_number} no aparece en la factura.`

    const scan = await insertScan({
      ...baseInput,
      result: 'not_in_invoice',
      message,
    })

    return {
      scan,
      expectedQuantity,
      scannedQuantity,
      remainingQuantity: 0,
      trackingCode: packageRecord.tracking_code,
    }
  }

  if (
    scannedQuantity + quantity >
    expectedQuantity + 0.0001
  ) {
    const message =
      `NO SE VA: excede la cantidad de ${expectedQuantity} solicitada para ${packageRecord.part_number}.`

    const scan = await insertScan({
      ...baseInput,
      result: 'quantity_exceeded',
      message,
    })

    return {
      scan,
      expectedQuantity,
      scannedQuantity,
      remainingQuantity: roundQuantity(
        expectedQuantity - scannedQuantity,
      ),
      trackingCode: packageRecord.tracking_code,
    }
  }

  const nextScannedQuantity =
    roundQuantity(scannedQuantity + quantity)

  const remainingQuantity =
    roundQuantity(
      expectedQuantity - nextScannedQuantity,
    )

  const message = remainingQuantity <= 0
    ? `SE VA: ${packageRecord.part_number} quedó completo.`
    : `SE VA: faltan ${remainingQuantity} de ${packageRecord.part_number}.`

  let scan: InvoiceLoadScan

  try {
    scan = await insertScan({
      ...baseInput,
      result: 'accepted',
      message,
    })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('duplicate')
    ) {
      scan = await insertScan({
        ...baseInput,
        result: 'duplicate',
        message:
          'DUPLICADO: este paquete ya fue aceptado en esta factura.',
      })
    } else {
      throw error
    }
  }

  return {
    scan,
    expectedQuantity,
    scannedQuantity:
      scan.result === 'accepted'
        ? nextScannedQuantity
        : scannedQuantity,
    remainingQuantity:
      scan.result === 'accepted'
        ? remainingQuantity
        : roundQuantity(
            expectedQuantity - scannedQuantity,
          ),
    trackingCode: packageRecord.tracking_code,
  }
}

export async function getInvoiceLoadScans(
  invoiceId: string,
) {
  const { data, error } = await supabase
    .from('invoice_load_scans')
    .select(`
      id,
      invoice_id,
      warehouse_package_id,
      raw_code,
      part_number,
      quantity,
      result,
      message,
      created_at
    `)
    .eq('invoice_id', invoiceId)
    .order('created_at', {
      ascending: false,
    })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as InvoiceLoadScan[]
}

export async function deleteInvoiceAcceptedScan(
  scanId: string,
) {
  const { error } = await supabase
    .from('invoice_load_scans')
    .delete()
    .eq('id', scanId)
    .eq('result', 'accepted')

  if (error) {
    throw new Error(error.message)
  }
}
