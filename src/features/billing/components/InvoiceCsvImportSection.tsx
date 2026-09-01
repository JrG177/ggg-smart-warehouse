import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Trash2,
  Upload,
} from 'lucide-react'

import type { InvoiceImportData } from '../../../types/invoiceImport'
import { parseInvoiceCsvFile } from '../invoiceCsvParser'

type InvoiceCsvImportSectionProps = {
  data: InvoiceImportData | null
  sourceFile: File | null
  evidenceFiles: File[]
  onImported: (data: InvoiceImportData, file: File) => void
  onClear: () => void
  onEvidenceFilesChange: (files: File[]) => void
  onError: (message: string) => void
}

const MAX_EVIDENCE_FILE_SIZE = 15 * 1024 * 1024

function formatNumber(value: number, maximumFractionDigits = 3) {
  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits,
  }).format(value)
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `$${value.toFixed(2)}`
  }
}

export function InvoiceCsvImportSection({
  data,
  sourceFile,
  evidenceFiles,
  onImported,
  onClear,
  onEvidenceFilesChange,
  onError,
}: InvoiceCsvImportSectionProps) {
  const [parsing, setParsing] = useState(false)

  const readCsv = async (file: File) => {
    try {
      setParsing(true)
      onError('')
      const parsed = await parseInvoiceCsvFile(file)
      onImported(parsed, file)
    } catch (parseError) {
      onClear()
      onError(
        parseError instanceof Error
          ? parseError.message
          : 'No se pudo leer el archivo CSV.',
      )
    } finally {
      setParsing(false)
    }
  }

  const addEvidenceFiles = (files: File[]) => {
    const oversized = files.find(
      (file) => file.size > MAX_EVIDENCE_FILE_SIZE,
    )

    if (oversized) {
      onError(`${oversized.name} supera el límite de 15 MB.`)
      return
    }

    const existing = new Set(
      evidenceFiles.map((file) => `${file.name}-${file.size}-${file.lastModified}`),
    )
    const uniqueFiles = files.filter(
      (file) => !existing.has(`${file.name}-${file.size}-${file.lastModified}`),
    )

    onEvidenceFilesChange([...evidenceFiles, ...uniqueFiles])
  }

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
      <div>
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={20} className="text-emerald-400" />
          <h3 className="font-bold">Importar datos desde Excel</h3>
        </div>

        <p className="mt-2 text-sm text-slate-400">
          En Excel usa “Guardar como” y selecciona CSV UTF-8. El sistema validará
          cantidades, peso, bultos y valor antes de permitir guardar.
        </p>
      </div>

      {!data || !sourceFile ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-emerald-500/40 bg-slate-950 px-5 py-8 text-center hover:border-emerald-400">
          <Upload size={24} className="text-emerald-400" />

          <div>
            <p className="font-bold">
              {parsing ? 'Leyendo factura...' : 'Seleccionar factura CSV'}
            </p>
            <p className="mt-1 text-xs text-slate-500">Formato permitido: .csv · Máximo 5 MB</p>
          </div>

          <input
            type="file"
            accept=".csv,text/csv"
            disabled={parsing}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]

              if (file) {
                void readCsv(file)
              }

              event.target.value = ''
            }}
          />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-slate-950 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 size={18} />
                <p className="font-bold">Archivo leído correctamente</p>
              </div>
              <p className="mt-1 truncate text-sm text-slate-400">{sourceFile.name}</p>
            </div>

            <button
              type="button"
              onClick={onClear}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-400"
            >
              <Trash2 size={16} />
              Quitar CSV
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Summary label="Factura" value={data.invoiceNumber} />
            <Summary label="Partidas" value={String(data.lines.length)} />
            <Summary label="Unidades" value={formatNumber(data.totalQuantity)} />
            <Summary label="Bultos" value={formatNumber(data.packageCount)} />
            <Summary
              label="Valor"
              value={formatCurrency(data.invoiceTotal, data.currency)}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.checks.map((check) => (
              <div
                key={check.key}
                className={[
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold',
                  check.passed
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-red-500/30 bg-red-500/10 text-red-400',
                ].join(' ')}
              >
                {check.passed ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {check.label}: {check.passed ? 'Correcto' : 'No coincide'}
              </div>
            ))}
          </div>

          {data.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
              {data.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          <div className="max-h-80 overflow-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-700 bg-slate-900 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-3">Línea</th>
                  <th className="px-3 py-3">Número de parte</th>
                  <th className="px-3 py-3">Descripción</th>
                  <th className="px-3 py-3 text-right">Cantidad</th>
                  <th className="px-3 py-3 text-right">Peso</th>
                  <th className="px-3 py-3 text-right">Precio unitario</th>
                  <th className="px-3 py-3 text-right">Total</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800 bg-slate-950">
                {data.lines.map((line) => (
                  <tr key={`${line.lineNumber}-${line.partNumber}`}>
                    <td className="px-3 py-3 text-slate-500">{line.lineNumber}</td>
                    <td className="px-3 py-3 font-semibold">{line.partNumber}</td>
                    <td className="max-w-sm px-3 py-3 text-slate-300">
                      {line.description || '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatNumber(line.commercialQuantity)}
                    </td>
                    <td className="px-3 py-3 text-right">{formatNumber(line.weight)}</td>
                    <td className="px-3 py-3 text-right">
                      {formatCurrency(line.unitPrice, data.currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatCurrency(line.totalPrice, data.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-300">
          Documento original Word o PDF (opcional)
        </p>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950 p-4 text-sm text-slate-300 hover:border-emerald-500">
          <FileText size={18} />
          Adjuntar documento original

          <input
            type="file"
            accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files || [])

              if (files.length > 0) {
                addEvidenceFiles(files)
              }

              event.target.value = ''
            }}
          />
        </label>

        {evidenceFiles.length > 0 && (
          <div className="mt-3 space-y-2">
            {evidenceFiles.map((file, index) => (
              <div
                key={`${file.name}-${file.lastModified}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <p className="min-w-0 truncate text-sm">{file.name}</p>
                <button
                  type="button"
                  onClick={() =>
                    onEvidenceFilesChange(
                      evidenceFiles.filter((_, fileIndex) => fileIndex !== index),
                    )
                  }
                  className="text-red-400"
                  aria-label={`Quitar ${file.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate font-bold">{value}</p>
    </div>
  )
}
