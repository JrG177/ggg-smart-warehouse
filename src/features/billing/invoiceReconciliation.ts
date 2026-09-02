export type InvoiceQuantityLine = {
  part_number: string
  commercial_quantity: number
}

export type ReceivedQuantityLine = {
  part_number: string
  quantity: number
}

export type ReconciliationStatus =
  | 'matched'
  | 'missing'
  | 'extra'
  | 'not_in_invoice'

export type ReconciliationRow = {
  key: string
  partNumber: string
  invoiceQuantity: number
  receivedQuantity: number
  difference: number
  status: ReconciliationStatus
}

export type InvoiceReconciliation = {
  rows: ReconciliationRow[]
  matchedCount: number
  differenceCount: number
  missingCount: number
  extraCount: number
  notInInvoiceCount: number
  hasDifferences: boolean
}

const QUANTITY_PRECISION = 4
const QUANTITY_TOLERANCE = 0.0001

export function normalizePartNumber(
  value: string,
) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function roundQuantity(
  value: number,
) {
  const multiplier =
    10 ** QUANTITY_PRECISION

  return Math.round(
    Number(value || 0) * multiplier,
  ) / multiplier
}

function addQuantity(
  quantities: Map<string, number>,
  key: string,
  quantity: number,
) {
  quantities.set(
    key,
    roundQuantity(
      (quantities.get(key) || 0) +
        Number(quantity || 0),
    ),
  )
}

function getStatus(
  invoiceQuantity: number,
  receivedQuantity: number,
): ReconciliationStatus {
  if (
    invoiceQuantity === 0 &&
    receivedQuantity > 0
  ) {
    return 'not_in_invoice'
  }

  const difference =
    roundQuantity(
      receivedQuantity - invoiceQuantity,
    )

  if (
    Math.abs(difference) <=
    QUANTITY_TOLERANCE
  ) {
    return 'matched'
  }

  return difference < 0
    ? 'missing'
    : 'extra'
}

export function buildInvoiceReconciliation(
  invoiceLines: InvoiceQuantityLine[],
  receivedLines: ReceivedQuantityLine[],
): InvoiceReconciliation {
  const invoiceQuantities =
    new Map<string, number>()

  const receivedQuantities =
    new Map<string, number>()

  const displayPartNumbers =
    new Map<string, string>()

  invoiceLines.forEach((line) => {
    const key = normalizePartNumber(
      line.part_number,
    )

    if (!key) {
      return
    }

    displayPartNumbers.set(
      key,
      displayPartNumbers.get(key) ||
        line.part_number.trim().toUpperCase(),
    )

    addQuantity(
      invoiceQuantities,
      key,
      line.commercial_quantity,
    )
  })

  receivedLines.forEach((line) => {
    const key = normalizePartNumber(
      line.part_number,
    )

    if (!key) {
      return
    }

    displayPartNumbers.set(
      key,
      displayPartNumbers.get(key) ||
        line.part_number.trim().toUpperCase(),
    )

    addQuantity(
      receivedQuantities,
      key,
      line.quantity,
    )
  })

  const keys = Array.from(
    new Set([
      ...invoiceQuantities.keys(),
      ...receivedQuantities.keys(),
    ]),
  )

  const statusPriority:
    Record<ReconciliationStatus, number> = {
      missing: 0,
      not_in_invoice: 1,
      extra: 2,
      matched: 3,
    }

  const rows = keys
    .map((key): ReconciliationRow => {
      const invoiceQuantity =
        roundQuantity(
          invoiceQuantities.get(key) || 0,
        )

      const receivedQuantity =
        roundQuantity(
          receivedQuantities.get(key) || 0,
        )

      return {
        key,
        partNumber:
          displayPartNumbers.get(key) || key,
        invoiceQuantity,
        receivedQuantity,
        difference: roundQuantity(
          receivedQuantity - invoiceQuantity,
        ),
        status: getStatus(
          invoiceQuantity,
          receivedQuantity,
        ),
      }
    })
    .sort(
      (first, second) =>
        statusPriority[first.status] -
          statusPriority[second.status] ||
        first.partNumber.localeCompare(
          second.partNumber,
          undefined,
          { numeric: true },
        ),
    )

  const matchedCount = rows.filter(
    (row) => row.status === 'matched',
  ).length

  const missingCount = rows.filter(
    (row) => row.status === 'missing',
  ).length

  const extraCount = rows.filter(
    (row) => row.status === 'extra',
  ).length

  const notInInvoiceCount = rows.filter(
    (row) =>
      row.status === 'not_in_invoice',
  ).length

  const differenceCount =
    rows.length - matchedCount

  return {
    rows,
    matchedCount,
    differenceCount,
    missingCount,
    extraCount,
    notInInvoiceCount,
    hasDifferences: differenceCount > 0,
  }
}
