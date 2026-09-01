export type InvoiceImportLine = {
  lineNumber: number
  partNumber: string
  tariffCode: string
  description: string
  commercialQuantity: number
  commercialUnitCode: string
  unitPrice: number
  totalPrice: number
  tariffQuantity: number
  tariffUnitCode: string
  weight: number
  origin: string
  seller: string
  packageCount: number
}

export type InvoiceImportCheck = {
  key: 'quantity' | 'weight' | 'packages' | 'value'
  label: string
  expected: number
  actual: number
  tolerance: number
  passed: boolean
}

export type InvoiceImportData = {
  sourceFileName: string
  rawInvoiceIdentifier: string
  invoiceNumber: string
  fiscalWeek: number | null
  invoiceDate: string | null
  invoiceDateDisplay: string
  clientCode: string
  supplierCode: string
  currency: string
  invoiceTotal: number
  totalQuantity: number
  totalWeight: number
  packageCount: number
  incoterm: string
  invoiceCountry: string
  containerNumber: string
  customsEntry: string
  observations: string
  lines: InvoiceImportLine[]
  checks: InvoiceImportCheck[]
  warnings: string[]
  valid: boolean
}
