export type IndustrialLabelField =
  | 'P'
  | 'Q'
  | 'K'
  | 'V'
  | '2K'
  | '3S'
  | '4S'
  | 'S'
  | 'UNKNOWN'

export type IndustrialLabelToken = {
  rawCode: string
  field: IndustrialLabelField
  value: string
}

const KNOWN_PREFIXES = [
  '3S',
  '4S',
  '2K',
  'P',
  'Q',
  'K',
  'V',
  'S',
] as const

export function cleanBarcodeValue(value: string) {
  return value
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
    .trim()
    .replace(/^\*|\*$/g, '')
    .replace(/^\][A-Z][0-9]/i, '')
    .toUpperCase()
}

export function splitBarcodePayload(value: string) {
  return value
    .split('|')
    .map(cleanBarcodeValue)
    .filter(Boolean)
}

export function parsePositiveQuantity(value: string) {
  const normalized = cleanBarcodeValue(value)
    .replace(/^Q/, '')
    .trim()
    .replace(/:/g, '.')
    .replace(/,/g, '')

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null
  }

  const quantity = Number(normalized)
  return Number.isFinite(quantity) && quantity > 0
    ? Math.round(quantity * 10000) / 10000
    : null
}

export function parseIndustrialLabelToken(
  value: string,
): IndustrialLabelToken {
  const rawCode = cleanBarcodeValue(value)
  const prefix = KNOWN_PREFIXES.find((candidate) =>
    rawCode.startsWith(candidate),
  )

  if (!prefix) {
    return {
      rawCode,
      field: 'UNKNOWN',
      value: rawCode,
    }
  }

  return {
    rawCode,
    field: prefix,
    value: rawCode.slice(prefix.length).trim(),
  }
}

export function parseIndustrialLabelPayload(value: string) {
  return splitBarcodePayload(value).map(
    parseIndustrialLabelToken,
  )
}

export function inferRawPartAndQuantity(
  tokens: IndustrialLabelToken[],
) {
  const unknown = tokens.filter(
    (token) => token.field === 'UNKNOWN',
  )

  if (unknown.length !== 2) {
    return null
  }

  const quantities = unknown
    .map((token) => ({
      token,
      quantity: parsePositiveQuantity(token.value),
    }))
    .filter(
      (candidate): candidate is {
        token: IndustrialLabelToken
        quantity: number
      } => candidate.quantity !== null,
    )

  if (quantities.length === 1) {
    const quantity = quantities[0]
    const part = unknown.find(
      (token) => token !== quantity.token,
    )
    return part
      ? {
          partNumber: part.value,
          quantity: quantity.quantity,
        }
      : null
  }

  if (quantities.length === 2) {
    const ordered = [...unknown].sort(
      (left, right) =>
        left.value.length - right.value.length,
    )

    if (
      ordered[1].value.length -
        ordered[0].value.length <
      2
    ) {
      return null
    }

    const quantity = parsePositiveQuantity(
      ordered[0].value,
    )
    return quantity === null
      ? null
      : {
          partNumber: ordered[1].value,
          quantity,
        }
  }

  return null
}
