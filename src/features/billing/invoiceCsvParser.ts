import type {
  InvoiceImportCheck,
  InvoiceImportData,
  InvoiceImportLine,
} from '../../types/invoiceImport'

const MAX_CSV_SIZE = 5 * 1024 * 1024

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function parseCsvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }

      continue
    }

    if (character === ',' && !quoted) {
      row.push(field.trim())
      field = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1
      }

      row.push(field.trim())
      field = ''

      if (row.some((value) => value !== '')) {
        rows.push(row)
      }

      row = []
      continue
    }

    field += character
  }

  if (quoted) {
    throw new Error(
      'El CSV contiene comillas sin cerrar. Vuelve a exportarlo desde Excel.',
    )
  }

  row.push(field.trim())

  if (row.some((value) => value !== '')) {
    rows.push(row)
  }

  return rows
}

function getHeaderIndexes(headers: string[], name: string) {
  const target = normalizeHeader(name)

  return headers.reduce<number[]>((indexes, header, index) => {
    if (normalizeHeader(header) === target) {
      indexes.push(index)
    }

    return indexes
  }, [])
}

function requireHeader(headers: string[], name: string) {
  const index = getHeaderIndexes(headers, name)[0]

  if (index === undefined) {
    throw new Error(`Falta la columna obligatoria “${name}”.`)
  }

  return index
}

function getValue(row: string[], index: number | undefined) {
  if (index === undefined) {
    return ''
  }

  return row[index]?.trim() || ''
}

function parseNumber(value: string, label: string, line?: number) {
  const normalized = value
    .replace(/[$\s]/g, '')
    .replace(/,/g, '')

  if (!normalized) {
    return 0
  }

  const parsed = Number(normalized)

  if (!Number.isFinite(parsed)) {
    const suffix = line ? ` en la partida ${line}` : ''
    throw new Error(`${label}${suffix} no contiene un número válido.`)
  }

  return parsed
}

function round(value: number, precision = 4) {
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function parseDate(value: string) {
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)

  if (!match) {
    return null
  }

  const [, day, month, year] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function parseInvoiceIdentifier(value: string) {
  const normalized = value.trim().toUpperCase()
  const match = normalized.match(/^(\d{1,2})\s+((?:IN|EX|OUT)\s*.+)$/)

  if (!match) {
    return {
      invoiceNumber: normalized,
      fiscalWeek: null,
    }
  }

  return {
    invoiceNumber: match[2].replace(/\s+/g, ' ').trim(),
    fiscalWeek: Number(match[1]),
  }
}

function extractObservationValue(observations: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = observations.match(
    new RegExp(`${escapedLabel}\\s*:\\s*([^:]+?)(?=\\s+[A-ZÁÉÍÓÚÑ ]+\\s*:|$)`, 'i'),
  )

  return match?.[1]?.trim() || ''
}

function makeCheck(
  key: InvoiceImportCheck['key'],
  label: string,
  expected: number,
  actual: number,
  tolerance: number,
): InvoiceImportCheck {
  return {
    key,
    label,
    expected: round(expected),
    actual: round(actual),
    tolerance,
    passed: Math.abs(expected - actual) <= tolerance,
  }
}

export function parseInvoiceCsvText(
  text: string,
  sourceFileName = 'factura.csv',
): InvoiceImportData {
  const rows = parseCsvRows(text)

  if (rows.length < 2) {
    throw new Error('El CSV no contiene partidas para importar.')
  }

  const headers = rows[0]
  const dataRows = rows.slice(1)
  const partIndex = requireHeader(headers, 'NUM. PARTE')
  const descriptionIndex = requireHeader(headers, 'DESC. PEDIMENTO')
  const quantityIndex = requireHeader(headers, 'CANTIDAD UMC')
  const totalPriceIndex = requireHeader(headers, 'PRECIO TOTAL')
  const tariffCodeIndex = getHeaderIndexes(headers, 'FRACCION')[0]
  const commercialUnitIndex = getHeaderIndexes(headers, 'UMC')[0]
  const tariffQuantityIndex = getHeaderIndexes(headers, 'CANTIDAD UMT')[0]
  const tariffUnitIndex = getHeaderIndexes(headers, 'UMT')[0]
  const originIndex = getHeaderIndexes(headers, 'ORIGEN')[0]
  const sellerIndex = getHeaderIndexes(headers, 'VENDEDOR')[0]
  const weightIndexes = getHeaderIndexes(headers, 'PESO')
  const packageIndexes = getHeaderIndexes(headers, 'BULTOS')
  const invoiceIndex = getHeaderIndexes(headers, 'FACTURA')[0]
  const dateIndex = getHeaderIndexes(headers, 'FECHA')[0]
  const invoiceTotalIndex = getHeaderIndexes(headers, 'VALOR FACTURA')[0]
  const currencyIndex = getHeaderIndexes(headers, 'MONEDA FACTURA')[0]
  const observationsIndex = getHeaderIndexes(headers, 'OBSERVACIONES')[0]
  const clientIndex = getHeaderIndexes(headers, 'CLIENTE')[0]
  const supplierIndex = getHeaderIndexes(headers, 'PROVEEDOR')[0]
  const incotermIndex = getHeaderIndexes(headers, 'INCORTEM')[0]
  const countryIndex = getHeaderIndexes(headers, 'PAIS FACTURA')[0]

  const metadataRow =
    dataRows.find((row) => getValue(row, invoiceIndex) !== '') || dataRows[0]

  const rawInvoiceIdentifier = getValue(metadataRow, invoiceIndex)

  if (!rawInvoiceIdentifier) {
    throw new Error('No se encontró el número de factura.')
  }

  const { invoiceNumber, fiscalWeek } =
    parseInvoiceIdentifier(rawInvoiceIdentifier)

  const lineWeightIndex = weightIndexes[1] ?? tariffQuantityIndex
  const linePackageIndex = packageIndexes[1]

  const lines: InvoiceImportLine[] = []

  for (const row of dataRows) {
    const partNumber = getValue(row, partIndex).toUpperCase()

    if (!partNumber) {
      continue
    }

    const lineNumber = lines.length + 1
    const commercialQuantity = parseNumber(
      getValue(row, quantityIndex),
      'La cantidad',
      lineNumber,
    )
    const totalPrice = parseNumber(
      getValue(row, totalPriceIndex),
      'El precio total',
      lineNumber,
    )

    if (commercialQuantity <= 0) {
      throw new Error(`La partida ${lineNumber} debe tener una cantidad mayor que cero.`)
    }

    lines.push({
      lineNumber,
      partNumber,
      tariffCode: getValue(row, tariffCodeIndex),
      description: getValue(row, descriptionIndex),
      commercialQuantity,
      commercialUnitCode: getValue(row, commercialUnitIndex),
      unitPrice: round(totalPrice / commercialQuantity),
      totalPrice,
      tariffQuantity: parseNumber(
        getValue(row, tariffQuantityIndex),
        'La cantidad UMT',
        lineNumber,
      ),
      tariffUnitCode: getValue(row, tariffUnitIndex),
      weight: parseNumber(
        getValue(row, lineWeightIndex),
        'El peso',
        lineNumber,
      ),
      origin: getValue(row, originIndex),
      seller: getValue(row, sellerIndex),
      packageCount: parseNumber(
        getValue(row, linePackageIndex),
        'Los bultos',
        lineNumber,
      ),
    })
  }

  if (lines.length === 0) {
    throw new Error('No se encontraron números de parte en el CSV.')
  }

  const invoiceTotal = parseNumber(
    getValue(metadataRow, invoiceTotalIndex),
    'El valor de la factura',
  )
  const packageCount = parseNumber(
    getValue(metadataRow, packageIndexes[0]),
    'El total de bultos',
  )
  const totalWeight = parseNumber(
    getValue(metadataRow, weightIndexes[0]),
    'El peso total',
  )
  const totalQuantity = lines.reduce(
    (total, line) => total + line.commercialQuantity,
    0,
  )
  const calculatedValue = lines.reduce(
    (total, line) => total + line.totalPrice,
    0,
  )
  const calculatedWeight = lines.reduce(
    (total, line) => total + line.weight,
    0,
  )
  const calculatedPackages = lines.reduce(
    (total, line) => total + line.packageCount,
    0,
  )
  const checks = [
    makeCheck('quantity', 'Unidades', totalQuantity, totalQuantity, 0),
    makeCheck('weight', 'Peso', totalWeight, calculatedWeight, 0.001),
    makeCheck('packages', 'Bultos', packageCount, calculatedPackages, 0),
    makeCheck('value', 'Valor', invoiceTotal, calculatedValue, 0.005),
  ]
  const warnings: string[] = []
  const partCounts = new Map<string, number>()

  for (const line of lines) {
    partCounts.set(line.partNumber, (partCounts.get(line.partNumber) || 0) + 1)
  }

  const duplicatedParts = [...partCounts]
    .filter(([, count]) => count > 1)
    .map(([partNumber]) => partNumber)

  if (duplicatedParts.length > 0) {
    warnings.push(
      `Números de parte repetidos: ${duplicatedParts.join(', ')}. Se conservarán como partidas separadas.`,
    )
  }

  if (fiscalWeek === null) {
    warnings.push(
      'La semana fiscal no estaba separada en el identificador de factura.',
    )
  }

  const observations = getValue(metadataRow, observationsIndex)

  return {
    sourceFileName,
    rawInvoiceIdentifier,
    invoiceNumber,
    fiscalWeek,
    invoiceDate: parseDate(getValue(metadataRow, dateIndex)),
    invoiceDateDisplay: getValue(metadataRow, dateIndex),
    clientCode: getValue(metadataRow, clientIndex),
    supplierCode: getValue(metadataRow, supplierIndex),
    currency: getValue(metadataRow, currencyIndex) || 'USD',
    invoiceTotal,
    totalQuantity: round(totalQuantity),
    totalWeight,
    packageCount,
    incoterm: getValue(metadataRow, incotermIndex),
    invoiceCountry: getValue(metadataRow, countryIndex),
    containerNumber: extractObservationValue(observations, 'DATOS DEL VEHICULO'),
    customsEntry: extractObservationValue(observations, 'PEDIMENTO'),
    observations,
    lines,
    checks,
    warnings,
    valid: checks.every((check) => check.passed),
  }
}

export async function parseInvoiceCsvFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Selecciona un archivo CSV exportado desde Excel.')
  }

  if (file.size > MAX_CSV_SIZE) {
    throw new Error('El archivo CSV no puede superar 5 MB.')
  }

  return parseInvoiceCsvText(await file.text(), file.name)
}
