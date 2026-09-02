import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FileImage,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCcw,
  ScanBarcode,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { supabase } from '../../lib/supabase'

import {
  addInvoicePhotos,
  createInvoiceWithReceptions,
  deleteInvoicePhoto,
  getAvailableInvoiceReceptions,
  getInvoicePhotos,
  updateInvoiceWithReceptions,
  type AvailableInvoiceReception,
  type InvoicePhoto,
} from '../../services/invoiceService'
import type { InvoiceImportData } from '../../types/invoiceImport'

import { EditInvoiceModal } from './components/EditInvoiceModal'
import { InvoiceCsvImportSection } from './components/InvoiceCsvImportSection'
import { InvoiceLoadScanner } from './components/InvoiceLoadScanner'
import {
  buildInvoiceReconciliation,
  type InvoiceReconciliation,
  type ReconciliationStatus,
} from './invoiceReconciliation'

type InvoicePartCheck = {
  id: string
  invoice_id: string
  pallet_part_id: string
  reviewed: boolean
}

type Part = {
  id: string
  part_number: string
  quantity: number
  packages: number | null
  invoice_part_checks: InvoicePartCheck[]
}

type Pallet = {
  id: string
  pallet_number: number
  damaged: boolean
  location_code: string | null
  pallet_parts: Part[]
}

type Reception = {
  id: string
  reception_number: string | null
  carrier: string
  other_carrier: string | null
  trailer: string
  reception_date: string
  pallets: Pallet[]
}

type InvoiceReception = {
  id: string
  reception_id: string
  reviewed: boolean
  receptions:
    | Reception
    | Reception[]
    | null
}


type OsdQueueRow = {
  id: string
  pallet_id: string
  status: 'pending' | 'completed'
  reviewed: boolean
  created_at: string
  pallets:
    | {
        id: string
        pallet_number: number
        administrative_status: string
        pallet_parts: Part[]
        receptions:
          | {
              id: string
              reception_number: string | null
              carrier: string
              other_carrier: string | null
              trailer: string
            }
          | Array<{
              id: string
              reception_number: string | null
              carrier: string
              other_carrier: string | null
              trailer: string
            }>
          | null
      }
    | Array<{
        id: string
        pallet_number: number
        administrative_status: string
        pallet_parts: Part[]
        receptions:
          | {
              id: string
              reception_number: string | null
              carrier: string
              other_carrier: string | null
              trailer: string
            }
          | Array<{
              id: string
              reception_number: string | null
              carrier: string
              other_carrier: string | null
              trailer: string
            }>
          | null
      }>
    | null
}

type InvoicePhotoRow = {
  id: string
  invoice_id: string
  photo_path: string
  sort_order: number
}

type Invoice = {
  id: string
  invoice_number: string
  carrier: string
  package_count: number
  invoice_photo_path: string | null
  status: 'open' | 'completed'
  completed_at: string | null
  created_at: string
  invoice_receptions:
    InvoiceReception[]
  invoice_imports:
    | InvoiceImportRecord
    | InvoiceImportRecord[]
    | null
  invoice_source_documents: InvoiceSourceDocumentRecord[]
}

type InvoiceImportLineRecord = {
  id: string
  line_number: number
  part_number: string
  description: string | null
  commercial_quantity: number
  weight: number
  unit_price: number
  total_price: number
}

type InvoiceImportRecord = {
  invoice_id: string
  source_file_name: string
  raw_invoice_identifier: string
  invoice_date: string | null
  fiscal_week: number | null
  currency: string
  invoice_total: number
  total_quantity: number
  total_weight: number
  package_count: number
  container_number: string | null
  customs_entry: string | null
  invoice_import_lines: InvoiceImportLineRecord[]
}

type InvoiceSourceDocumentRecord = {
  id: string
  invoice_id: string
  file_name: string
  storage_path: string
  mime_type: string
  document_type: 'csv' | 'evidence'
}

function getReception(
  item: InvoiceReception,
): Reception | null {
  if (!item.receptions) {
    return null
  }

  return Array.isArray(
    item.receptions,
  )
    ? item.receptions[0] ||
        null
    : item.receptions
}

function getInvoiceImport(invoice: Invoice) {
  if (!invoice.invoice_imports) {
    return null
  }

  return Array.isArray(invoice.invoice_imports)
    ? invoice.invoice_imports[0] || null
    : invoice.invoice_imports
}

function getCarrier(
  reception:
    Reception | null,
) {
  if (!reception) {
    return '—'
  }

  return (
    reception.other_carrier ||
    reception.carrier
  )
}

function getReceptionSummary(
  reception:
    Reception | null,
) {
  const parts =
    reception?.pallets.flatMap(
      (pallet) =>
        pallet.pallet_parts,
    ) || []

  const partNumbers =
    Array.from(
      new Set(
        parts.map(
          (part) =>
            part.part_number,
        ),
      ),
    )

  const totalQuantity =
    parts.reduce(
      (total, part) =>
        total +
        Number(
          part.quantity || 0,
        ),
      0,
    )

  const totalPackages =
    parts.reduce(
      (total, part) =>
        total +
        Number(
          part.packages || 0,
        ),
      0,
    )

  return {
    partNumbers,
    totalQuantity,
    totalPackages,
    parts,
  }
}

function updateInvoicePartReviewedState(
  invoices: Invoice[],
  invoiceId: string,
  partId: string,
  reviewed: boolean,
) {
  const updatePart = (
    part: Part,
  ): Part => {
    if (part.id !== partId) {
      return part
    }

    const existingCheck =
      part.invoice_part_checks.find(
        (check) =>
          check.invoice_id === invoiceId,
      )

    return {
      ...part,
      invoice_part_checks:
        existingCheck
          ? part.invoice_part_checks.map(
              (check) =>
                check.invoice_id === invoiceId
                  ? {
                      ...check,
                      reviewed,
                    }
                  : check,
            )
          : [
              ...part.invoice_part_checks,
              {
                id: `local-${invoiceId}-${partId}`,
                invoice_id: invoiceId,
                pallet_part_id: partId,
                reviewed,
              },
            ],
    }
  }

  const updateReception = (
    reception: Reception,
  ): Reception => ({
    ...reception,
    pallets: reception.pallets.map(
      (pallet) => ({
        ...pallet,
        pallet_parts:
          pallet.pallet_parts.map(
            updatePart,
          ),
      }),
    ),
  })

  return invoices.map(
    (invoice) => {
      if (invoice.id !== invoiceId) {
        return invoice
      }

      return {
        ...invoice,
        invoice_receptions:
          invoice.invoice_receptions.map(
            (item) => ({
              ...item,
              receptions:
                Array.isArray(
                  item.receptions,
                )
                  ? item.receptions.map(
                      updateReception,
                    )
                  : item.receptions
                    ? updateReception(
                        item.receptions,
                      )
                    : null,
            }),
          ),
      }
    },
  )
}

function getInvoiceReconciliation(
  invoice: Invoice,
): InvoiceReconciliation | null {
  const imported = getInvoiceImport(
    invoice,
  )

  if (!imported) {
    return null
  }

  const receivedParts =
    invoice.invoice_receptions.flatMap(
      (item) =>
        getReception(item)?.pallets.flatMap(
          (pallet) =>
            pallet.pallet_parts,
        ) || [],
    )

  return buildInvoiceReconciliation(
    imported.invoice_import_lines,
    receivedParts,
  )
}

type ReconciliationFilter =
  | 'all'
  | 'differences'
  | 'matched'

const reconciliationStatusLabels:
  Record<ReconciliationStatus, string> = {
    matched: 'Coincide',
    missing: 'Faltante',
    extra: 'Sobrante',
    not_in_invoice: 'No pertenece',
  }

const reconciliationStatusClasses:
  Record<ReconciliationStatus, string> = {
    matched:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    missing:
      'border-red-500/30 bg-red-500/10 text-red-400',
    extra:
      'border-amber-500/30 bg-amber-500/10 text-amber-400',
    not_in_invoice:
      'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400',
  }

function formatReconciliationQuantity(
  value: number,
) {
  return Number(value).toLocaleString(
    'es-MX',
    {
      maximumFractionDigits: 4,
    },
  )
}

function formatReconciliationDifference(
  value: number,
) {
  if (value === 0) {
    return '0'
  }

  const formatted =
    formatReconciliationQuantity(
      Math.abs(value),
    )

  return value > 0
    ? `+${formatted}`
    : `-${formatted}`
}

export function BillingPage() {
  const [invoices, setInvoices] =
    useState<Invoice[]>([])

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [searchTerm, setSearchTerm] =
    useState('')

  const [
    completionPackageCounts,
    setCompletionPackageCounts,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({})

  const [statusTab, setStatusTab] =
    useState<'open' | 'completed' | 'osd'>(
      'open',
    )

  const [
    osdRows,
    setOsdRows,
  ] =
    useState<OsdQueueRow[]>([])

  const [
    expandedReceptions,
    setExpandedReceptions,
  ] =
    useState<Record<string, boolean>>(
    {},
  )

  const [
    expandedReconciliations,
    setExpandedReconciliations,
  ] = useState<Record<string, boolean>>({})

  const [
    reconciliationFilters,
    setReconciliationFilters,
  ] = useState<
    Record<string, ReconciliationFilter>
  >({})

  const [error, setError] =
    useState('')

  const [
    savingPartChecks,
    setSavingPartChecks,
  ] = useState<Record<string, boolean>>({})

  const [
    scanningInvoice,
    setScanningInvoice,
  ] = useState<Invoice | null>(null)

  const [
    invoiceViewerOpen,
    setInvoiceViewerOpen,
  ] = useState(false)

  const [
    invoiceViewerLoading,
    setInvoiceViewerLoading,
  ] = useState(false)

  const [
    invoiceViewerTitle,
    setInvoiceViewerTitle,
  ] = useState('')

  const [
    invoiceViewerUrls,
    setInvoiceViewerUrls,
  ] = useState<string[]>([])

  const [
    invoiceViewerIndex,
    setInvoiceViewerIndex,
  ] = useState(0)

  const [
    editingInvoice,
    setEditingInvoice,
  ] = useState<Invoice | null>(null)

  const [
    editInvoiceNumber,
    setEditInvoiceNumber,
  ] = useState('')

  const [
    editCarrier,
    setEditCarrier,
  ] = useState('')

  const [
    editPackageCount,
    setEditPackageCount,
  ] = useState('')

const [
  savingInvoice,
  setSavingInvoice,
] = useState(false)

const [
  editAvailableReceptions,
  setEditAvailableReceptions,
] = useState<
  AvailableInvoiceReception[]
>([])

const [
  editSelectedReceptionIds,
  setEditSelectedReceptionIds,
] = useState<string[]>([])

const [
  editReceptionSearch,
  setEditReceptionSearch,
] = useState('')

const [
  editLoadingReceptions,
  setEditLoadingReceptions,
] = useState(false)

const [
  editInvoicePhotos,
  setEditInvoicePhotos,
] = useState<InvoicePhoto[]>([])

const [
  editNewPhotos,
  setEditNewPhotos,
] = useState<File[]>([])

const [
  editLoadingPhotos,
  setEditLoadingPhotos,
] = useState(false)

const [
  deletingPhotoId,
  setDeletingPhotoId,
] = useState<string | null>(null)

const [
  successMessage,
  setSuccessMessage,
] = useState('')

const [
  newInvoiceOpen,
  setNewInvoiceOpen,
] = useState(false)

const [
  newInvoiceMode,
  setNewInvoiceMode,
] = useState<'manual' | 'csv'>('manual')

const [
  newInvoiceImportData,
  setNewInvoiceImportData,
] = useState<InvoiceImportData | null>(null)

const [
  newInvoiceCsvFile,
  setNewInvoiceCsvFile,
] = useState<File | null>(null)

const [
  newInvoiceEvidenceFiles,
  setNewInvoiceEvidenceFiles,
] = useState<File[]>([])

const [
  newInvoiceStep,
  setNewInvoiceStep,
] = useState<1 | 2>(1)

const [
  newInvoiceCarrier,
  setNewInvoiceCarrier,
] = useState('XPO')

const [
  newInvoiceNumber,
  setNewInvoiceNumber,
] = useState('')

const [
  newInvoicePackageCount,
  setNewInvoicePackageCount,
] = useState('')

const [
  newInvoicePhotos,
  setNewInvoicePhotos,
] = useState<File[]>([])

const [
  availableReceptions,
  setAvailableReceptions,
] = useState<AvailableInvoiceReception[]>([])

const [
  selectedReceptionIds,
  setSelectedReceptionIds,
] = useState<string[]>([])

const [
  loadingAvailableReceptions,
  setLoadingAvailableReceptions,
] = useState(false)

const [
  creatingInvoice,
  setCreatingInvoice,
] = useState(false)

const [
  expandedInvoiceImports,
  setExpandedInvoiceImports,
] = useState<Record<string, boolean>>({})

const [
  openingSourceDocumentId,
  setOpeningSourceDocumentId,
] = useState<string | null>(null)

const loadInvoices =
    async (
      showRefresh = false,
    ) => {
      if (showRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')

      if (
        statusTab ===
        'osd'
      ) {
        const {
          data,
          error:
            osdError,
        } = await supabase
          .from('osd_queue')
          .select(`
            id,
            pallet_id,
            status,
            reviewed,
            created_at,
            pallets (
              id,
              pallet_number,
              administrative_status,
              pallet_parts (
                id,
                part_number,
                quantity,
                packages
              ),
              receptions (
                id,
                reception_number,
                carrier,
                other_carrier,
                trailer
              )
            )
          `)
          .eq(
            'status',
            'pending',
          )
          .order(
            'created_at',
            {
              ascending:
                true,
            },
          )

        if (osdError) {
          setError(
            osdError.message,
          )

          setOsdRows([])
        } else {
          setOsdRows(
            (
              data ||
              []
            ) as OsdQueueRow[],
          )
        }

        setLoading(false)
        setRefreshing(false)
        return
      }

      const {
        data,
        error: invoiceError,
      } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          carrier,
          package_count,
          invoice_photo_path,
          status,
          completed_at,
          created_at,
          invoice_imports (
            invoice_id,
            source_file_name,
            raw_invoice_identifier,
            invoice_date,
            fiscal_week,
            currency,
            invoice_total,
            total_quantity,
            total_weight,
            package_count,
            container_number,
            customs_entry,
            invoice_import_lines (
              id,
              line_number,
              part_number,
              description,
              commercial_quantity,
              weight,
              unit_price,
              total_price
            )
          ),
          invoice_source_documents (
            id,
            invoice_id,
            file_name,
            storage_path,
            mime_type,
            document_type
          ),
          invoice_receptions (
            id,
            reception_id,
            reviewed,
            receptions (
              id,
              reception_number,
              carrier,
              other_carrier,
              trailer,
              reception_date,
              pallets (
                id,
                pallet_number,
                damaged,
                location_code,
                pallet_parts (
                  id,
                  part_number,
                  quantity,
                  packages,
                  invoice_part_checks (
                    id,
                    invoice_id,
                    pallet_part_id,
                    reviewed
                  )
                )
              )
            )
          )
        `)
        .eq('status', statusTab)
        .order('created_at', {
          ascending: false,
        })

      if (invoiceError) {
        setError(
          invoiceError.message,
        )
        setInvoices([])
      } else {
        setInvoices(
          (data || []) as Invoice[],
        )
      }

      setLoading(false)
      setRefreshing(false)
    }

  useEffect(() => {
    void loadInvoices()
  }, [statusTab])

  const filteredEditReceptions =
  useMemo(
    () => {
      const search =
        editReceptionSearch
          .trim()
          .toLowerCase()

      if (!search) {
        return editAvailableReceptions
      }

      return editAvailableReceptions.filter(
        (
          reception,
        ) =>
          [
            reception.reception_number ||
              '',
            reception.trailer ||
              '',
            reception.carrier ||
              '',
            reception.other_carrier ||
              '',
            ...reception.part_numbers,
          ].some(
            (
              value,
            ) =>
              value
                .toLowerCase()
                .includes(
                  search,
                ),
          ),
      )
    },
    [
      editAvailableReceptions,
      editReceptionSearch,
    ],
  )

const editSelectedReceptions =
  useMemo(
    () =>
      editAvailableReceptions.filter(
        (
          reception,
        ) =>
          editSelectedReceptionIds.includes(
            reception.id,
          ),
      ),
    [
      editAvailableReceptions,
      editSelectedReceptionIds,
    ],
  )

const editInvoiceSummary =
  useMemo(
    () => {
      const totalPallets =
        editSelectedReceptions.reduce(
          (
            total,
            reception,
          ) =>
            total +
            Number(
              reception.pallet_count ||
                0,
            ),
          0,
        )

      const totalQuantity =
        editSelectedReceptions.reduce(
          (
            total,
            reception,
          ) =>
            total +
            Number(
              reception.total_quantity ||
                0,
            ),
          0,
        )

      const totalPackages =
        editSelectedReceptions.reduce(
          (
            total,
            reception,
          ) =>
            total +
            Number(
              reception.total_packages ||
                0,
            ),
          0,
        )

      const partNumbers =
        Array.from(
          new Set(
            editSelectedReceptions.flatMap(
              (
                reception,
              ) =>
                reception.part_numbers,
            ),
          ),
        )

      return {
        receptionCount:
          editSelectedReceptions.length,

        totalPallets,
        totalQuantity,
        totalPackages,

        partNumberCount:
          partNumbers.length,
      }
    },
    [
      editSelectedReceptions,
    ],
  )

  const filteredInvoices =
    useMemo(
      () => {
        const search =
          searchTerm
            .trim()
            .toLowerCase()

        if (!search) {
          return invoices
        }

        return invoices.filter(
          (invoice) => {
            const imported = getInvoiceImport(invoice)

            return [
              invoice.invoice_number,
              invoice.carrier,
              imported?.container_number || '',
              imported?.customs_entry || '',
              ...(imported?.invoice_import_lines || []).map(
                (line) => line.part_number,
              ),
              ...invoice.invoice_receptions.map(
                (item) =>
                  getReception(item)
                    ?.reception_number ||
                  '',
              ),
            ].some(
              (value) =>
                value
                  .toLowerCase()
                  .includes(search),
            )
          },
        )
      },
      [
        invoices,
        searchTerm,
      ],
    )

  const toggleReception =
    (
      id: string,
    ) => {
      setExpandedReceptions(
        (current) => ({
          ...current,
          [id]:
            !current[id],
        }),
      )
    }

    const resetNewInvoiceForm =
  () => {
    setNewInvoiceOpen(false)
    setNewInvoiceMode('manual')
    setNewInvoiceStep(1)
    setNewInvoiceCarrier('XPO')
    setNewInvoiceNumber('')
    setNewInvoicePackageCount('')
    setNewInvoicePhotos([])
    setNewInvoiceImportData(null)
    setNewInvoiceCsvFile(null)
    setNewInvoiceEvidenceFiles([])
    setAvailableReceptions([])
    setSelectedReceptionIds([])
    setLoadingAvailableReceptions(false)
    setCreatingInvoice(false)
  }

const openNewInvoice =
  (mode: 'manual' | 'csv' = 'manual') => {
    setError('')
    setSuccessMessage('')
    setNewInvoiceOpen(true)
    setNewInvoiceMode(mode)
    setNewInvoiceStep(1)
    setNewInvoiceCarrier('XPO')
    setNewInvoiceNumber('')
    setNewInvoicePackageCount('')
    setNewInvoicePhotos([])
    setNewInvoiceImportData(null)
    setNewInvoiceCsvFile(null)
    setNewInvoiceEvidenceFiles([])
    setAvailableReceptions([])
    setSelectedReceptionIds([])
  }

const closeNewInvoice =
  () => {
    if (
      creatingInvoice ||
      loadingAvailableReceptions
    ) {
      return
    }

    resetNewInvoiceForm()
  }

const handleInvoiceCsvImported =
  (data: InvoiceImportData, file: File) => {
    setNewInvoiceImportData(data)
    setNewInvoiceCsvFile(file)
    setNewInvoiceNumber(data.invoiceNumber)
    setNewInvoicePackageCount(String(data.packageCount))
    setError('')
  }

const clearInvoiceCsvImport =
  () => {
    setNewInvoiceImportData(null)
    setNewInvoiceCsvFile(null)
    setNewInvoiceNumber('')
    setNewInvoicePackageCount('')
  }

const continueToReceptionSelection =
  async () => {
    const invoiceNumber =
      newInvoiceNumber
        .trim()
        .toUpperCase()
        .replace(/^INV-/, '')

    const packageCount =
      Number(
        newInvoicePackageCount,
      )

    if (!invoiceNumber) {
      setError(
        'Captura el número de factura.',
      )
      return
    }

    if (
      !Number.isInteger(
        packageCount,
      ) ||
      packageCount < 0
    ) {
      setError(
        'Captura un número de bultos válido.',
      )
      return
    }

    if (
      newInvoiceMode === 'manual' &&
      newInvoicePhotos.length === 0
    ) {
      setError(
        'Agrega al menos una fotografía de la factura.',
      )
      return
    }

    if (
      newInvoiceMode === 'csv' &&
      (!newInvoiceImportData || !newInvoiceCsvFile)
    ) {
      setError('Selecciona y valida el archivo CSV de la factura.')
      return
    }

    if (
      newInvoiceMode === 'csv' &&
      newInvoiceImportData &&
      !newInvoiceImportData.valid
    ) {
      setError('Los totales del CSV no coinciden. Corrige el archivo antes de continuar.')
      return
    }

    if (
      newInvoiceMode === 'csv' &&
      newInvoiceImportData &&
      packageCount !== newInvoiceImportData.packageCount
    ) {
      setError('El número de bultos debe coincidir con el total leído del CSV.')
      return
    }

    try {
      setError('')
      setLoadingAvailableReceptions(
        true,
      )
      setSelectedReceptionIds([])

      const receptions =
        await getAvailableInvoiceReceptions(
          newInvoiceCarrier,
        )

      setAvailableReceptions(
        receptions,
      )

      setNewInvoiceStep(2)
    } catch (
      loadError
    ) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar las recepciones disponibles.',
      )
    } finally {
      setLoadingAvailableReceptions(
        false,
      )
    }
  }

const toggleNewInvoiceReception =
  (
    receptionId: string,
  ) => {
    setSelectedReceptionIds(
      (
        current,
      ) =>
        current.includes(
          receptionId,
        )
          ? current.filter(
              (
                id,
              ) =>
                id !==
                receptionId,
            )
          : [
              ...current,
              receptionId,
            ],
    )
  }

const createNewInvoice =
  async () => {
    if (
      selectedReceptionIds.length ===
      0
    ) {
      setError(
        'Selecciona al menos una recepción.',
      )
      return
    }

    try {
      setCreatingInvoice(true)
      setError('')
      setSuccessMessage('')

      const result =
        await createInvoiceWithReceptions(
          {
            invoiceNumber:
              newInvoiceNumber,

            carrier:
              newInvoiceCarrier,

            packageCount:
              Number(
                newInvoicePackageCount,
              ),

            receptionIds:
              selectedReceptionIds,

            photos:
              newInvoicePhotos,

            importData:
              newInvoiceMode === 'csv'
                ? newInvoiceImportData
                : null,

            sourceDocuments:
              newInvoiceMode === 'csv' && newInvoiceCsvFile
                ? [
                    newInvoiceCsvFile,
                    ...newInvoiceEvidenceFiles,
                  ]
                : [],
          },
        )

      const receptionCount =
        selectedReceptionIds.length

      resetNewInvoiceForm()

      setSuccessMessage(
        newInvoiceMode === 'csv' && newInvoiceImportData
          ? `La factura ${result.invoiceNumber} se importó con ${newInvoiceImportData.lines.length} partidas y ${receptionCount} recepción(es).`
          : `La factura ${result.invoiceNumber} se creó correctamente con ${receptionCount} recepción(es).`,
      )

      if (
        statusTab ===
        'open'
      ) {
        await loadInvoices()
      } else {
        setStatusTab(
          'open',
        )
      }
    } catch (
      createError
    ) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'No se pudo crear la factura.',
      )
    } finally {
      setCreatingInvoice(false)
    }
  }

const openEditInvoice =
  async (
    invoice: Invoice,
  ) => {
    try {
      setError('')
      setSuccessMessage('')
      setEditingInvoice(
        invoice,
      )

      setEditInvoiceNumber(
        invoice.invoice_number,
      )

      setEditCarrier(
        invoice.carrier,
      )

      setEditPackageCount(
        String(
          invoice.package_count ??
            0,
        ),
      )

      setEditReceptionSearch(
        '',
      )

      setEditNewPhotos(
        [],
      )

      setEditLoadingReceptions(
        true,
      )

      setEditLoadingPhotos(
        true,
      )

      const currentReceptionIds =
        invoice.invoice_receptions.map(
          (
            item,
          ) =>
            item.reception_id,
        )

      setEditSelectedReceptionIds(
        currentReceptionIds,
      )

      const [
        receptions,
        photos,
      ] =
        await Promise.all([
          getAvailableInvoiceReceptions(
            invoice.carrier,
            invoice.id,
          ),

          getInvoicePhotos(
            invoice.id,
          ),
        ])

      setEditAvailableReceptions(
        receptions,
      )

      setEditInvoicePhotos(
        photos,
      )
    } catch (
      openError
    ) {
      setEditingInvoice(
        null,
      )

      setError(
        openError instanceof Error
          ? openError.message
          : 'No se pudo abrir el editor de la factura.',
      )
    } finally {
      setEditLoadingReceptions(
        false,
      )

      setEditLoadingPhotos(
        false,
      )
    }
  }

const closeEditInvoice =
  () => {
    if (
      deletingPhotoId
    ) {
      return
    }

    setEditingInvoice(
      null,
    )

    setEditInvoiceNumber(
      '',
    )

    setEditCarrier(
      '',
    )

    setEditPackageCount(
      '',
    )

    setEditAvailableReceptions(
      [],
    )

    setEditSelectedReceptionIds(
      [],
    )

    setEditReceptionSearch(
      '',
    )

    setEditInvoicePhotos(
      [],
    )

    setEditNewPhotos(
      [],
    )

    setEditLoadingReceptions(
      false,
    )

    setEditLoadingPhotos(
      false,
    )

    setDeletingPhotoId(
      null,
    )
  }

const toggleEditReception =
  (
    receptionId:
      string,
  ) => {
    setEditSelectedReceptionIds(
      (
        current,
      ) =>
        current.includes(
          receptionId,
        )
          ? current.filter(
              (
                id,
              ) =>
                id !==
                receptionId,
            )
          : [
              ...current,
              receptionId,
            ],
    )
  }

const selectAllVisibleEditReceptions =
  () => {
    setEditSelectedReceptionIds(
      (
        current,
      ) =>
        Array.from(
          new Set([
            ...current,

            ...filteredEditReceptions.map(
              (
                reception,
              ) =>
                reception.id,
            ),
          ]),
        ),
    )
  }

const clearVisibleEditReceptions =
  () => {
    const visibleIds =
      new Set(
        filteredEditReceptions.map(
          (
            reception,
          ) =>
            reception.id,
        ),
      )

    setEditSelectedReceptionIds(
      (
        current,
      ) =>
        current.filter(
          (
            id,
          ) =>
            !visibleIds.has(
              id,
            ),
        ),
    )
  }

const reloadEditReceptions =
  async (
    carrier:
      string,
  ) => {
    if (
      !editingInvoice
    ) {
      return
    }

    try {
      setEditLoadingReceptions(
        true,
      )

      setError(
        '',
      )

      const receptions =
        await getAvailableInvoiceReceptions(
          carrier,
          editingInvoice.id,
        )

      setEditAvailableReceptions(
        receptions,
      )

      const validReceptionIds =
        new Set(
          receptions.map(
            (
              reception,
            ) =>
              reception.id,
          ),
        )

      setEditSelectedReceptionIds(
        (
          current,
        ) =>
          current.filter(
            (
              id,
            ) =>
              validReceptionIds.has(
                id,
              ),
          ),
      )
    } catch (
      reloadError
    ) {
      setError(
        reloadError instanceof Error
          ? reloadError.message
          : 'No se pudieron cargar las recepciones del carrier.',
      )
    } finally {
      setEditLoadingReceptions(
        false,
      )
    }
  }

const removeExistingInvoicePhoto =
  async (
    photoId:
      string,
  ) => {
    if (
      !editingInvoice
    ) {
      return
    }

    try {
      setDeletingPhotoId(
        photoId,
      )

      setError(
        '',
      )

      const remainingPhotos =
        await deleteInvoicePhoto(
          editingInvoice.id,
          photoId,
        )

      setEditInvoicePhotos(
        remainingPhotos,
      )
    } catch (
      photoError
    ) {
      setError(
        photoError instanceof Error
          ? photoError.message
          : 'No se pudo eliminar la fotografía.',
      )
    } finally {
      setDeletingPhotoId(
        null,
      )
    }
  }

const saveInvoiceChanges =
  async () => {
    if (
      !editingInvoice
    ) {
      return
    }

    const packageCount =
      Number(
        editPackageCount,
      )

    if (
      editSelectedReceptionIds.length ===
      0
    ) {
      setError(
        'La factura debe conservar al menos una recepción.',
      )

      return
    }

    if (
      editInvoicePhotos.length ===
        0 &&
      editNewPhotos.length ===
        0
    ) {
      setError(
        'La factura debe conservar al menos una fotografía.',
      )

      return
    }

    if (
      !Number.isInteger(
        packageCount,
      ) ||
      packageCount <
        0
    ) {
      setError(
        'El número de bultos debe ser un número entero válido.',
      )

      return
    }

    try {
      setSavingInvoice(
        true,
      )

      setError(
        '',
      )

      setSuccessMessage(
        '',
      )

      const result =
        await updateInvoiceWithReceptions(
          {
            invoiceId:
              editingInvoice.id,

            invoiceNumber:
              editInvoiceNumber,

            carrier:
              editCarrier,

            packageCount,

            receptionIds:
              editSelectedReceptionIds,
          },
        )

      if (
        editNewPhotos.length >
        0
      ) {
        await addInvoicePhotos(
          editingInvoice.id,
          editNewPhotos,
        )
      }

      const receptionCount =
        editSelectedReceptionIds.length

      closeEditInvoice()

      setSuccessMessage(
        `La factura ${result.invoiceNumber} se actualizó correctamente con ${receptionCount} recepción(es).`,
      )

      await loadInvoices()
    } catch (
      saveError
    ) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo actualizar la factura.',
      )
    } finally {
      setSavingInvoice(
        false,
      )
    }
  }

  const completeInvoice =
    async (
      invoice:
        Invoice,
    ) => {
      const invoiceParts =
        invoice
          .invoice_receptions
          .flatMap(
            (
              item,
            ) =>
              getReception(
                item,
              )?.pallets.flatMap(
                (
                  pallet,
                ) =>
                  pallet.pallet_parts,
              ) ||
              [],
          )

      const allReviewed =
        invoiceParts.length >
          0 &&
        invoiceParts.every(
          (
            part,
          ) =>
            part
              .invoice_part_checks
              .some(
                (
                  check,
                ) =>
                  check.invoice_id ===
                    invoice.id &&
                  check.reviewed,
              ),
        )

      const reconciliation =
        getInvoiceReconciliation(
          invoice,
        )

      const finalPackageCount =
        Number(
          completionPackageCounts[
            invoice.id
          ] ||
            '',
        )

      if (
        !allReviewed
      ) {
        setError(
          'Debes marcar todas las recepciones antes de completar la factura.',
        )
        return
      }

      if (
        !Number.isInteger(
          finalPackageCount,
        ) ||
        finalPackageCount <
          1
      ) {
        setError(
          'Captura un # de Bultos válido antes de completar la factura.',
        )
        return
      }

      if (
        reconciliation?.hasDifferences
      ) {
        const confirmed = window.confirm(
          `Esta factura tiene ${reconciliation.differenceCount} diferencia(s) entre el archivo importado y las recepciones. ¿Confirmas que ya fueron revisadas y deseas completar la factura?`,
        )

        if (!confirmed) {
          setExpandedReconciliations(
            (current) => ({
              ...current,
              [invoice.id]: true,
            }),
          )

          setReconciliationFilters(
            (current) => ({
              ...current,
              [invoice.id]: 'differences',
            }),
          )

          return
        }
      }

      try {
        setError(
          '',
        )

        const {
          error:
            completeError,
        } =
          await supabase
            .rpc(
              'complete_invoice_and_create_shipment',
              {
                p_invoice_id:
                  invoice.id,

                p_package_count:
                  finalPackageCount,
              },
            )

        if (
          completeError
        ) {
          throw new Error(
            completeError.message,
          )
        }

        setCompletionPackageCounts(
          (
            current,
          ) => {
            const next = {
              ...current,
            }

            delete next[
              invoice.id
            ]

            return next
          },
        )

        await loadInvoices()

        alert(
          'Factura completada y enviada automáticamente a Embarques.',
        )
      } catch (
        completeError
      ) {
        setError(
          completeError instanceof
            Error
            ? completeError.message
            : 'No se pudo completar la factura.',
        )
      }
    }


  const toggleInvoicePartReviewed =
    async (
      invoiceId:
        string,
      part:
        Part,
      checked:
        boolean,
    ) => {
      const savingKey =
        `${invoiceId}:${part.id}`

      if (savingPartChecks[savingKey]) {
        return
      }

      const previousReviewed =
        part.invoice_part_checks.some(
          (check) =>
            check.invoice_id === invoiceId &&
            check.reviewed,
        )

      setSavingPartChecks(
        (current) => ({
          ...current,
          [savingKey]: true,
        }),
      )

      setInvoices((current) =>
        updateInvoicePartReviewedState(
          current,
          invoiceId,
          part.id,
          checked,
        ),
      )

      try {
        setError('')

        const {
          error:
            upsertError,
        } =
          await supabase
            .from(
              'invoice_part_checks',
            )
            .upsert(
              {
                invoice_id:
                  invoiceId,

                pallet_part_id:
                  part.id,

                reviewed:
                  checked,

                updated_at:
                  new Date()
                    .toISOString(),
              },
              {
                onConflict:
                  'invoice_id,pallet_part_id',
              },
            )

        if (
          upsertError
        ) {
          throw new Error(
            upsertError.message,
          )
        }
      } catch (
        updateError
      ) {
        setInvoices((current) =>
          updateInvoicePartReviewedState(
            current,
            invoiceId,
            part.id,
            previousReviewed,
          ),
        )

        setError(
          updateError instanceof
            Error
            ? updateError.message
            : 'No se pudo actualizar el check del número de parte.',
        )
      } finally {
        setSavingPartChecks(
          (current) => {
            const next = {
              ...current,
            }

            delete next[savingKey]

            return next
          },
        )
      }
    }


  const toggleOsdReviewed =
    async (
      row:
        OsdQueueRow,
      checked:
        boolean,
    ) => {
      const {
        error:
          updateError,
      } = await supabase
        .from(
          'osd_queue',
        )
        .update({
          reviewed:
            checked,
        })
        .eq(
          'id',
          row.id,
        )

      if (updateError) {
        setError(
          updateError.message,
        )
        return
      }

      setOsdRows(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              row.id
                ? {
                    ...item,
                    reviewed:
                      checked,
                  }
                : item,
          ),
      )
    }

  const completeOsd =
    async (
      row:
        OsdQueueRow,
    ) => {
      if (!row.reviewed) {
        return
      }

      try {
        const {
          error:
            queueError,
        } = await supabase
          .from(
            'osd_queue',
          )
          .update({
            status:
              'completed',
            completed_at:
              new Date()
                .toISOString(),
            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            'id',
            row.id,
          )

        if (queueError) {
          throw new Error(
            queueError.message,
          )
        }

        const {
          error:
            palletError,
        } = await supabase
          .from(
            'pallets',
          )
          .update({
            administrative_status:
              'osd_completed',
          })
          .eq(
            'id',
            row.pallet_id,
          )

        if (palletError) {
          throw new Error(
            palletError.message,
          )
        }

        setOsdRows(
          (current) =>
            current.filter(
              (item) =>
                item.id !==
                row.id,
            ),
        )
      } catch (osdError) {
        setError(
          osdError instanceof Error
            ? osdError.message
            : 'No se pudo completar OS&D.',
        )
      }
    }

  const closeInvoiceViewer =
    () => {
      setInvoiceViewerOpen(false)
      setInvoiceViewerLoading(false)
      setInvoiceViewerTitle('')
      setInvoiceViewerUrls([])
      setInvoiceViewerIndex(0)
    }

  const openInvoicePhotos =
    async (
      invoice: Invoice,
    ) => {
      try {
        setError('')
        setInvoiceViewerOpen(true)
        setInvoiceViewerLoading(true)
        setInvoiceViewerTitle(
          invoice.invoice_number,
        )
        setInvoiceViewerUrls([])
        setInvoiceViewerIndex(0)

        const {
          data: photoRows,
          error: photosError,
        } = await supabase
          .from('invoice_photos')
          .select(`
            id,
            invoice_id,
            photo_path,
            sort_order
          `)
          .eq(
            'invoice_id',
            invoice.id,
          )
          .order(
            'sort_order',
            {
              ascending: true,
            },
          )

        if (photosError) {
          throw new Error(
            photosError.message,
          )
        }

        const savedPaths =
          (
            photoRows ||
            []
          )
            .map(
              (
                photo,
              ) =>
                (
                  photo as InvoicePhotoRow
                ).photo_path,
            )
            .filter(
              (
                path,
              ): path is string =>
                Boolean(path),
            )

        const uniquePaths =
          Array.from(
            new Set(
              savedPaths.length >
                0
                ? savedPaths
                : invoice.invoice_photo_path
                  ? [
                      invoice.invoice_photo_path,
                    ]
                  : [],
            ),
          )

        if (
          uniquePaths.length ===
          0
        ) {
          throw new Error(
            'Esta factura no tiene fotografías guardadas.',
          )
        }

        const signedResults =
          await Promise.all(
            uniquePaths.map(
              async (
                path,
              ) => {
                const {
                  data,
                  error:
                    signedUrlError,
                } =
                  await supabase.storage
                    .from(
                      'invoice-documents',
                    )
                    .createSignedUrl(
                      path,
                      60 * 10,
                    )

                if (
                  signedUrlError
                ) {
                  return null
                }

                return data.signedUrl
              },
            ),
          )

        const validUrls =
          signedResults.filter(
            (
              url,
            ): url is string =>
              Boolean(url),
          )

        if (
          validUrls.length ===
          0
        ) {
          throw new Error(
            'No se pudieron abrir las fotografías de la factura.',
          )
        }

        setInvoiceViewerUrls(
          validUrls,
        )
      } catch (
        viewerError
      ) {
        closeInvoiceViewer()

        setError(
          viewerError instanceof
            Error
            ? viewerError.message
            : 'No se pudieron cargar las fotografías de la factura.',
        )
      } finally {
        setInvoiceViewerLoading(
          false,
        )
      }
    }

  const openInvoiceSourceDocument =
    async (document: InvoiceSourceDocumentRecord) => {
      try {
        setError('')
        setOpeningSourceDocumentId(document.id)

        const { data, error: signedUrlError } = await supabase.storage
          .from('invoice-source-documents')
          .createSignedUrl(document.storage_path, 60 * 10)

        if (signedUrlError || !data?.signedUrl) {
          throw new Error(
            signedUrlError?.message || 'No se pudo abrir el documento original.',
          )
        }

        const link = window.document.createElement('a')
        link.href = data.signedUrl
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.click()
      } catch (documentError) {
        setError(
          documentError instanceof Error
            ? documentError.message
            : 'No se pudo abrir el documento original.',
        )
      } finally {
        setOpeningSourceDocumentId(null)
      }
    }

  const showPreviousInvoicePhoto =
    () => {
      setInvoiceViewerIndex(
        (
          current,
        ) =>
          current === 0
            ? invoiceViewerUrls.length -
              1
            : current - 1,
      )
    }

  const showNextInvoicePhoto =
    () => {
      setInvoiceViewerIndex(
        (
          current,
        ) =>
          current ===
          invoiceViewerUrls.length -
            1
            ? 0
            : current + 1,
      )
    }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-slate-400">
          Proceso administrativo
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Factura
        </h1>

        <p className="mt-2 text-slate-400">
          Cada factura funciona como una lista donde puedes agregar varias recepciones.
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-400">
          {error}
        </div>
      )}
            {successMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-500">
          {successMessage}
        </div>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setStatusTab('open')
              }
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                statusTab === 'open'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'border border-slate-700 text-slate-300',
              ].join(' ')}
            >
              Facturas abiertas
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusTab(
                  'completed',
                )
              }
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                statusTab === 'completed'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'border border-slate-700 text-slate-300',
              ].join(' ')}
            >
              Historial
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusTab(
                  'osd',
                )
              }
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold',
                statusTab === 'osd'
                  ? 'bg-red-500 text-white'
                  : 'border border-slate-700 text-slate-300',
              ].join(' ')}
            >
              OS&amp;D
            </button>
          </div>

<div className="flex flex-col gap-3 sm:flex-row">
  {statusTab !== 'osd' && (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        onClick={() => openNewInvoice('csv')}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950"
      >
        <FileSpreadsheet size={18} />
        Importar factura
      </button>

      <button
        type="button"
        onClick={() => openNewInvoice('manual')}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold"
      >
        <Plus size={18} />
        Captura manual
      </button>
    </div>
  )}

  <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />

              <input
                value={searchTerm}
                onChange={(event) =>
                  setSearchTerm(
                    event.target.value,
                  )
                }
                placeholder="Buscar factura o recepción..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-4 text-sm outline-none sm:w-80"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                void loadInvoices(true)
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold"
            >
              <RefreshCcw
                size={17}
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              />
              Actualizar
            </button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              Cargando...
            </div>
          ) : statusTab ===
            'osd' ? (
            <div className="space-y-3">
              {osdRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center text-slate-500">
                  No hay registros pendientes en OS&amp;D.
                </div>
              ) : (
                osdRows.map(
                  (row) => {
                    const pallet =
                      Array.isArray(
                        row.pallets,
                      )
                        ? row.pallets[0] ||
                          null
                        : row.pallets

                    const receptionData =
                      pallet?.receptions

                    const reception =
                      Array.isArray(
                        receptionData,
                      )
                        ? receptionData[0] ||
                          null
                        : receptionData

                    const parts =
                      pallet?.pallet_parts ||
                      []

                    const totalQuantity =
                      parts.reduce(
                        (
                          total,
                          part,
                        ) =>
                          total +
                          Number(
                            part.quantity ||
                              0,
                          ),
                        0,
                      )

                    const totalPackages =
                      parts.reduce(
                        (
                          total,
                          part,
                        ) =>
                          total +
                          Number(
                            part.packages ||
                              0,
                          ),
                        0,
                      )

                    return (
                      <article
                        key={row.id}
                        className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4"
                      >
                        <div className="grid gap-3 lg:grid-cols-[180px_1fr_140px_140px_auto_auto] lg:items-center">
                          <span className="font-bold text-red-400">
                            {reception?.reception_number ||
                              'Sin folio'}
                          </span>

                          <span className="text-sm text-slate-300">
                            {parts.length > 0
                              ? parts
                                  .map(
                                    (
                                      part,
                                    ) =>
                                      part.part_number,
                                  )
                                  .join(', ')
                              : 'Sin número de parte'}
                          </span>

                          <span className="text-sm text-slate-300">
                            {totalQuantity} piezas
                          </span>

                          <span className="text-sm text-slate-300">
                            {totalPackages} bultos
                          </span>

                          <input
                            type="checkbox"
                            checked={
                              row.reviewed
                            }
                            onChange={(event) =>
                              void toggleOsdReviewed(
                                row,
                                event.target.checked,
                              )
                            }
                            className="h-5 w-5 cursor-pointer accent-red-500"
                          />

                          <button
                            type="button"
                            disabled={
                              !row.reviewed
                            }
                            onClick={() =>
                              void completeOsd(
                                row,
                              )
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <CheckCircle2 size={15} />
                            Completar OS&amp;D
                          </button>
                        </div>
                      </article>
                    )
                  },
                )
              )}
            </div>
          ) : filteredInvoices.length ===
            0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center text-slate-500">
              No hay facturas en esta sección.
            </div>
          ) : (
            <div className="space-y-6">
              {filteredInvoices.map(
                (invoice) => {
                  const imported = getInvoiceImport(invoice)
                  const importedLines = [
                    ...(imported?.invoice_import_lines || []),
                  ].sort((first, second) => first.line_number - second.line_number)
                  const invoiceParts =
                    invoice
                      .invoice_receptions
                      .flatMap(
                        (
                          item,
                        ) =>
                          getReception(
                            item,
                          )?.pallets.flatMap(
                            (
                              pallet,
                            ) =>
                              pallet.pallet_parts,
                          ) ||
                          [],
                      )

                  const allReviewed =
                    invoiceParts.length >
                      0 &&
                    invoiceParts.every(
                      (
                        part,
                      ) =>
                        part
                          .invoice_part_checks
                          .some(
                            (
                              check,
                            ) =>
                              check.invoice_id ===
                                invoice.id &&
                              check.reviewed,
                          ),
                    )

                  const reconciliation =
                    getInvoiceReconciliation(
                      invoice,
                    )

                  const reconciliationFilter =
                    reconciliationFilters[
                      invoice.id
                    ] || 'all'

                  const visibleReconciliationRows =
                    reconciliation?.rows.filter(
                      (row) => {
                        if (
                          reconciliationFilter ===
                          'differences'
                        ) {
                          return row.status !== 'matched'
                        }

                        if (
                          reconciliationFilter ===
                          'matched'
                        ) {
                          return row.status === 'matched'
                        }

                        return true
                      },
                    ) || []

                  return (
                  <article
                    key={invoice.id}
                    className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"
                  >
                    <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xl font-bold">
                          {invoice.invoice_number}
                        </p>

                        <p className="mt-1 text-sm text-slate-400">
                          {invoice.carrier} · {invoice.package_count} bultos · {invoice.invoice_receptions.length} recepciones
                        </p>

                        {imported && (
                          <p className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                            <FileSpreadsheet size={14} />
                            {importedLines.length} partidas importadas · {Number(
                              imported.total_quantity,
                            ).toLocaleString('es-MX')} unidades
                          </p>
                        )}

                        {reconciliation && (
                          <p
                            className={[
                              'mt-2 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold',
                              reconciliation.hasDifferences
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                            ].join(' ')}
                          >
                            {reconciliation.hasDifferences
                              ? <AlertTriangle size={14} />
                              : <CheckCircle2 size={14} />}
                            {reconciliation.hasDifferences
                              ? `${reconciliation.differenceCount} diferencia(s) por revisar`
                              : 'Factura y recepciones coinciden'}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {imported && invoice.status === 'open' && (
                          <button
                            type="button"
                            onClick={() =>
                              setScanningInvoice(invoice)
                            }
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950"
                          >
                            <ScanBarcode size={18} />
                            Verificar carga
                          </button>
                        )}

                        {invoice.invoice_source_documents.map((document) => (
                          <button
                            key={document.id}
                            type="button"
                            disabled={openingSourceDocumentId === document.id}
                            onClick={() => void openInvoiceSourceDocument(document)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold disabled:opacity-40"
                            title={document.file_name}
                          >
                            <FileText size={17} />
                            {openingSourceDocumentId === document.id
                              ? 'Abriendo...'
                              : document.document_type === 'csv'
                                ? 'CSV original'
                                : 'Documento original'}
                          </button>
                        ))}

                        {invoice.invoice_photo_path && (
                          <button
                            type="button"
                            onClick={() =>
                              void openInvoicePhotos(
                                invoice,
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold"
                          >
                            <FileImage size={17} />
                            Ver factura
                          </button>
                        )}

                        {invoice.status ===
                          'open' && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                openEditInvoice(
                                  invoice,
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-500/10"
                            >
                              <Pencil size={17} />
                              Editar
                            </button>

                            <label className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2">
                              <span className="whitespace-nowrap text-xs font-semibold text-slate-400">
                                # de Bultos
                              </span>

                              <input
                                type="number"
                                min="1"
                                inputMode="numeric"
                                value={
                                  completionPackageCounts[
                                    invoice.id
                                  ] ||
                                  ''
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setCompletionPackageCounts(
                                    (
                                      current,
                                    ) => ({
                                      ...current,

                                      [invoice.id]:
                                        event
                                          .target
                                          .value,
                                    }),
                                  )
                                }
                                placeholder="0"
                                className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-sm outline-none"
                              />
                            </label>

                            <button
                              type="button"
                              disabled={
                                !allReviewed ||
                                !Number.isInteger(
                                  Number(
                                    completionPackageCounts[
                                      invoice.id
                                    ] ||
                                      '',
                                  ),
                                ) ||
                                Number(
                                  completionPackageCounts[
                                    invoice.id
                                  ] ||
                                    0,
                                ) <
                                  1
                              }
                              onClick={() =>
                                void completeInvoice(
                                  invoice,
                                )
                              }
                              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              Completar factura
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="divide-y divide-slate-800">
                      {reconciliation && (
                        <div className="p-4">
                          <button
                            type="button"
                            aria-expanded={Boolean(
                              expandedReconciliations[
                                invoice.id
                              ],
                            )}
                            onClick={() =>
                              setExpandedReconciliations(
                                (current) => ({
                                  ...current,
                                  [invoice.id]:
                                    !current[invoice.id],
                                }),
                              )
                            }
                            className="grid w-full grid-cols-[auto_1fr] items-center gap-3 text-left sm:grid-cols-[auto_1fr_auto]"
                          >
                            <span className="text-slate-500">
                              {expandedReconciliations[
                                invoice.id
                              ]
                                ? <ChevronDown size={18} />
                                : <ChevronRight size={18} />}
                            </span>

                            <span>
                              <span className="block font-semibold">
                                Conciliación factura vs. recepciones
                              </span>

                              <span className="mt-1 block text-sm text-slate-400">
                                {reconciliation.matchedCount} coinciden ·{' '}
                                {reconciliation.differenceCount} diferencias ·{' '}
                                {reconciliation.rows.length} números de parte
                              </span>
                            </span>

                            <span
                              className={[
                                'col-start-2 justify-self-start rounded-full border px-3 py-1 text-xs font-bold sm:col-start-auto sm:justify-self-auto',
                                reconciliation.hasDifferences
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                              ].join(' ')}
                            >
                              {reconciliation.hasDifferences
                                ? 'Revisión necesaria'
                                : 'Todo coincide'}
                            </span>
                          </button>

                          {expandedReconciliations[
                            invoice.id
                          ] && (
                            <div className="mt-4 space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <ReconciliationMetric
                                  label="Coinciden"
                                  value={reconciliation.matchedCount}
                                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                />

                                <ReconciliationMetric
                                  label="Faltantes"
                                  value={reconciliation.missingCount}
                                  className="border-red-500/30 bg-red-500/10 text-red-400"
                                />

                                <ReconciliationMetric
                                  label="Sobrantes"
                                  value={reconciliation.extraCount}
                                  className="border-amber-500/30 bg-amber-500/10 text-amber-400"
                                />

                                <ReconciliationMetric
                                  label="No pertenecen"
                                  value={reconciliation.notInInvoiceCount}
                                  className="border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400"
                                />
                              </div>

                              {reconciliation.hasDifferences && (
                                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                                  <AlertTriangle
                                    className="mt-0.5 shrink-0"
                                    size={18}
                                  />

                                  <p>
                                    Revisa estas diferencias antes de cargar. Si intentas completar la factura, el sistema solicitará una confirmación adicional.
                                  </p>
                                </div>
                              )}

                              <div className="flex flex-wrap gap-2">
                                {([
                                  ['all', 'Todos', reconciliation.rows.length],
                                  ['differences', 'Solo diferencias', reconciliation.differenceCount],
                                  ['matched', 'Coinciden', reconciliation.matchedCount],
                                ] as Array<[
                                  ReconciliationFilter,
                                  string,
                                  number,
                                ]>).map(
                                  ([filter, label, count]) => (
                                    <button
                                      key={filter}
                                      type="button"
                                      onClick={() =>
                                        setReconciliationFilters(
                                          (current) => ({
                                            ...current,
                                            [invoice.id]: filter,
                                          }),
                                        )
                                      }
                                      className={[
                                        'rounded-lg border px-3 py-2 text-xs font-semibold transition',
                                        reconciliationFilter === filter
                                          ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                                          : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200',
                                      ].join(' ')}
                                    >
                                      {label} ({count})
                                    </button>
                                  ),
                                )}
                              </div>

                              <div className="overflow-x-auto rounded-xl border border-slate-800">
                                <table className="w-full min-w-[760px] text-left text-sm">
                                  <thead className="border-b border-slate-800 bg-slate-950 text-xs uppercase text-slate-500">
                                    <tr>
                                      <th className="px-4 py-3">
                                        Número de parte
                                      </th>
                                      <th className="px-4 py-3 text-right">
                                        Factura
                                      </th>
                                      <th className="px-4 py-3 text-right">
                                        Recepciones
                                      </th>
                                      <th className="px-4 py-3 text-right">
                                        Diferencia
                                      </th>
                                      <th className="px-4 py-3 text-center">
                                        Resultado
                                      </th>
                                    </tr>
                                  </thead>

                                  <tbody className="divide-y divide-slate-800 bg-slate-950">
                                    {visibleReconciliationRows.map(
                                      (row) => (
                                        <tr key={row.key}>
                                          <td className="px-4 py-3 font-semibold">
                                            {row.partNumber}
                                          </td>

                                          <td className="px-4 py-3 text-right">
                                            {formatReconciliationQuantity(
                                              row.invoiceQuantity,
                                            )}
                                          </td>

                                          <td className="px-4 py-3 text-right">
                                            {formatReconciliationQuantity(
                                              row.receivedQuantity,
                                            )}
                                          </td>

                                          <td
                                            className={[
                                              'px-4 py-3 text-right font-bold',
                                              row.difference === 0
                                                ? 'text-slate-400'
                                                : row.difference < 0
                                                  ? 'text-red-400'
                                                  : 'text-amber-400',
                                            ].join(' ')}
                                          >
                                            {formatReconciliationDifference(
                                              row.difference,
                                            )}
                                          </td>

                                          <td className="px-4 py-3 text-center">
                                            <span
                                              className={[
                                                'inline-flex rounded-full border px-2.5 py-1 text-xs font-bold',
                                                reconciliationStatusClasses[
                                                  row.status
                                                ],
                                              ].join(' ')}
                                            >
                                              {reconciliationStatusLabels[
                                                row.status
                                              ]}
                                            </span>
                                          </td>
                                        </tr>
                                      ),
                                    )}

                                    {visibleReconciliationRows.length === 0 && (
                                      <tr>
                                        <td
                                          colSpan={5}
                                          className="px-4 py-8 text-center text-slate-500"
                                        >
                                          No hay números de parte en este filtro.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {imported && (
                        <div className="p-4">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedInvoiceImports((current) => ({
                                ...current,
                                [invoice.id]: !current[invoice.id],
                              }))
                            }
                            className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 text-left"
                          >
                            <span className="text-slate-500">
                              {expandedInvoiceImports[invoice.id]
                                ? <ChevronDown size={18} />
                                : <ChevronRight size={18} />}
                            </span>

                            <span>
                              <span className="block font-semibold">Contenido importado</span>
                              <span className="mt-1 block text-sm text-slate-400">
                                {importedLines.length} partidas · Peso {Number(
                                  imported.total_weight,
                                ).toLocaleString('es-MX')} · {imported.currency}{' '}
                                {Number(imported.invoice_total).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </span>

                            <span className="text-xs font-semibold text-emerald-400">
                              {imported.container_number || 'Sin contenedor'}
                            </span>
                          </button>

                          {expandedInvoiceImports[invoice.id] && (
                            <div className="mt-4 space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Info
                                  label="Fecha de factura"
                                  value={imported.invoice_date || '—'}
                                />
                                <Info
                                  label="Semana fiscal"
                                  value={imported.fiscal_week?.toString() || '—'}
                                />
                                <Info
                                  label="Contenedor"
                                  value={imported.container_number || '—'}
                                />
                                <Info
                                  label="Pedimento"
                                  value={imported.customs_entry || '—'}
                                />
                              </div>

                              <div className="max-h-96 overflow-auto rounded-xl border border-slate-800">
                                <table className="w-full min-w-[850px] text-left text-sm">
                                  <thead className="sticky top-0 border-b border-slate-700 bg-slate-950 text-xs uppercase text-slate-500">
                                    <tr>
                                      <th className="px-3 py-3">Línea</th>
                                      <th className="px-3 py-3">Número de parte</th>
                                      <th className="px-3 py-3">Descripción</th>
                                      <th className="px-3 py-3 text-right">Cantidad</th>
                                      <th className="px-3 py-3 text-right">Peso</th>
                                      <th className="px-3 py-3 text-right">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800 bg-slate-950">
                                    {importedLines.map((line) => (
                                      <tr key={line.id}>
                                        <td className="px-3 py-3 text-slate-500">
                                          {line.line_number}
                                        </td>
                                        <td className="px-3 py-3 font-semibold">
                                          {line.part_number}
                                        </td>
                                        <td className="max-w-sm px-3 py-3 text-slate-300">
                                          {line.description || '—'}
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                          {Number(line.commercial_quantity).toLocaleString('es-MX')}
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                          {Number(line.weight).toLocaleString('es-MX')}
                                        </td>
                                        <td className="px-3 py-3 text-right font-semibold">
                                          {imported.currency}{' '}
                                          {Number(line.total_price).toLocaleString('en-US', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {invoice.invoice_receptions.map(
                        (item) => {
                          const reception =
                            getReception(item)

                          const summary =
                            getReceptionSummary(
                              reception,
                            )

                          const expanded =
                            expandedReceptions[
                              item.id
                            ]

                          return (
                            <div
                              key={item.id}
                              className="p-4"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  toggleReception(
                                    item.id,
                                  )
                                }
                                className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 text-left lg:grid-cols-[auto_180px_1fr_140px_140px_auto]"
                              >
                                <span className="pt-1 text-slate-500">
                                  {expanded
                                    ? (
                                      <ChevronDown size={18} />
                                    )
                                    : (
                                      <ChevronRight size={18} />
                                    )}
                                </span>

                                <span className="font-semibold text-white">
                                  {reception?.reception_number ||
                                    'Sin folio'}
                                </span>

                                <span className="text-sm text-slate-300">
                                  {summary.partNumbers.length > 0
                                    ? summary.partNumbers.join(', ')
                                    : 'Sin número de parte'}
                                </span>

                                <span className="text-sm text-slate-300">
                                  {summary.totalQuantity} piezas
                                </span>

                                <span className="text-sm text-slate-300">
                                  {summary.totalPackages} bultos
                                </span>

                                <span className="text-right text-xs text-slate-500">
                                  {summary.parts.filter(
                                    (
                                      part,
                                    ) =>
                                      part
                                        .invoice_part_checks
                                        .some(
                                          (
                                            check,
                                          ) =>
                                            check.invoice_id ===
                                              invoice.id &&
                                            check.reviewed,
                                        ),
                                  ).length}
                                  /
                                  {summary.parts.length}
                                  {' '}revisados
                                </span>
                              </button>

                              {expanded && (
                                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
                                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    <Info
                                      label="Carrier"
                                      value={getCarrier(
                                        reception,
                                      )}
                                    />

                                    <Info
                                      label="Trailer"
                                      value={
                                        reception?.trailer ||
                                        '—'
                                      }
                                    />

                                    <Info
                                      label="Fecha"
                                      value={
                                        reception?.reception_date ||
                                        '—'
                                      }
                                    />

                                    <Info
                                      label="Pallets"
                                      value={String(
                                        reception?.pallets.length ||
                                          0,
                                      )}
                                    />
                                  </div>

                                  <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800">
                                    <table className="w-full min-w-[650px] text-left">
                                      <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                                        <tr>
                                          <th className="px-4 py-3">
                                            Número de parte
                                          </th>
                                          <th className="px-4 py-3">
                                            Cantidad
                                          </th>
                                          <th className="px-4 py-3">
                                            # de bultos
                                          </th>
                                          <th className="px-4 py-3 text-center">
                                            Check
                                          </th>
                                        </tr>
                                      </thead>

                                      <tbody className="divide-y divide-slate-800">
                                        {summary.parts.map(
                                          (part) => (
                                            <tr key={part.id}>
                                              <td className="px-4 py-3 font-semibold">
                                                {part.part_number}
                                              </td>
                                              <td className="px-4 py-3">
                                                {part.quantity}
                                              </td>
                                              <td className="px-4 py-3">
                                                {part.packages ??
                                                  '—'}
                                              </td>

                                              <td className="px-4 py-3 text-center">
                                                <input
                                                  type="checkbox"
                                                  disabled={
                                                    Boolean(
                                                      savingPartChecks[
                                                        `${invoice.id}:${part.id}`
                                                      ],
                                                    )
                                                  }
                                                  checked={
                                                    part
                                                      .invoice_part_checks
                                                      .some(
                                                        (
                                                          check,
                                                        ) =>
                                                          check.invoice_id ===
                                                            invoice.id &&
                                                          check.reviewed,
                                                      )
                                                  }
                                                  onChange={(
                                                    event,
                                                  ) =>
                                                    void toggleInvoicePartReviewed(
                                                      invoice.id,
                                                      part,
                                                      event.target.checked,
                                                    )
                                                  }
                                                  className="h-5 w-5 cursor-pointer accent-emerald-500 disabled:cursor-wait disabled:opacity-60"
                                                />
                                              </td>
                                            </tr>
                                          ),
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        },
                      )}
                    </div>
                  </article>
                  )
                },
              )}
            </div>
          )}
        </div>
      </section>
{newInvoiceOpen && (
  <div
    className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4"
    role="dialog"
    aria-modal="true"
    aria-label={newInvoiceMode === 'csv' ? 'Importar factura' : 'Nueva factura'}
    onClick={
      closeNewInvoice
    }
  >
    <div
      className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      onClick={(
        event,
      ) =>
        event.stopPropagation()
      }
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-700 px-5 py-4">
        <div>
          <p className="text-sm text-slate-400">
            Paso {newInvoiceStep} de 2
          </p>

          <h2 className="mt-1 text-xl font-bold">
            {newInvoiceStep === 1
              ? newInvoiceMode === 'csv'
                ? 'Importar factura'
                : 'Nueva Factura'
              : 'Seleccionar recepciones'}
          </h2>
        </div>

        <button
          type="button"
          onClick={
            closeNewInvoice
          }
          disabled={
            creatingInvoice ||
            loadingAvailableReceptions
          }
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {newInvoiceStep ===
        1 ? (
          <div className="mx-auto max-w-2xl space-y-5">
            {newInvoiceMode === 'csv' && (
              <InvoiceCsvImportSection
                data={newInvoiceImportData}
                sourceFile={newInvoiceCsvFile}
                evidenceFiles={newInvoiceEvidenceFiles}
                onImported={handleInvoiceCsvImported}
                onClear={clearInvoiceCsvImport}
                onEvidenceFilesChange={setNewInvoiceEvidenceFiles}
                onError={setError}
              />
            )}

            <div>
              <label
                htmlFor="new-invoice-carrier"
                className="mb-2 block text-sm font-semibold text-slate-300"
              >
                Carrier
              </label>

              <select
                id="new-invoice-carrier"
                value={
                  newInvoiceCarrier
                }
                onChange={(
                  event,
                ) => {
                  setNewInvoiceCarrier(
                    event.target.value,
                  )

                  setAvailableReceptions(
                    [],
                  )

                  setSelectedReceptionIds(
                    [],
                  )
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-500"
              >
                <option value="XPO">
                  XPO
                </option>

                <option value="CENTRAL">
                  CENTRAL
                </option>

                <option value="MTY">
                  MTY
                </option>

                <option value="IZI">
                  IZI
                </option>

                <option value="FLETHSA">
                  FLETHSA
                </option>

                <option value="OTHER">
                  OTHER
                </option>
              </select>

              {newInvoiceCarrier ===
                'OTHER' && (
                <p className="mt-2 text-xs text-slate-500">
                  Se mostrarán todas las recepciones registradas como OTHER, sin importar el nombre específico del transportista.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="new-invoice-number"
                className="mb-2 block text-sm font-semibold text-slate-300"
              >
                Número de factura
              </label>

              <div className="flex overflow-hidden rounded-xl border border-slate-700 bg-slate-950 focus-within:border-emerald-500">
                <span className="flex items-center border-r border-slate-700 bg-slate-800 px-4 font-bold text-slate-300">
                  INV-
                </span>

                <input
                  id="new-invoice-number"
                  value={
                    newInvoiceNumber
                  }
                  onChange={(
                    event,
                  ) =>
                    setNewInvoiceNumber(
                      event.target.value
                        .toUpperCase()
                        .replace(
                          /^INV-/,
                          '',
                        ),
                    )
                  }
                  placeholder="123456"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="new-invoice-package-count"
                className="mb-2 block text-sm font-semibold text-slate-300"
              >
                Número de bultos
              </label>

              <input
                id="new-invoice-package-count"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={
                  newInvoicePackageCount
                }
                onChange={(
                  event,
                ) =>
                  setNewInvoicePackageCount(
                    event.target.value,
                  )
                }
                placeholder="0"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-300">
                {newInvoiceMode === 'csv'
                  ? 'Fotografías adicionales (opcional)'
                  : 'Fotografías de la factura'}
              </p>

              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950 p-6 text-slate-300 hover:border-emerald-500">
                <ImagePlus size={20} />
                Agregar fotografías

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(
                    event,
                  ) => {
                    const files =
                      Array.from(
                        event.target.files ||
                          [],
                      )

                    if (
                      files.length >
                      0
                    ) {
                      setNewInvoicePhotos(
                        (
                          current,
                        ) => [
                          ...current,
                          ...files,
                        ],
                      )
                    }

                    event.target.value =
                      ''
                  }}
                />
              </label>

              {newInvoicePhotos.length >
                0 && (
                <div className="mt-3 space-y-2">
                  {newInvoicePhotos.map(
                    (
                      photo,
                      index,
                    ) => (
                      <div
                        key={`${photo.name}-${photo.lastModified}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {photo.name}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {index === 0
                              ? 'Foto principal'
                              : `Foto ${index + 1}`}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setNewInvoicePhotos(
                              (
                                current,
                              ) =>
                                current.filter(
                                  (
                                    _,
                                    photoIndex,
                                  ) =>
                                    photoIndex !==
                                    index,
                                ),
                            )
                          }
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400"
                          aria-label={`Quitar ${photo.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">
                  INV-{newInvoiceNumber
                    .trim()
                    .toUpperCase()
                    .replace(
                      /^INV-/,
                      '',
                    )}
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  {newInvoiceCarrier} · {newInvoicePackageCount} bultos
                  {newInvoiceMode === 'csv' && newInvoiceImportData
                    ? ` · ${newInvoiceImportData.lines.length} partidas · ${newInvoiceImportData.totalQuantity} unidades`
                    : ''}
                </p>
              </div>

              <p className="text-sm font-semibold text-emerald-400">
                {selectedReceptionIds.length}{' '}
                recepción(es) seleccionada(s)
              </p>
            </div>

            {availableReceptions.length ===
              0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center text-slate-500">
                No hay recepciones disponibles para este carrier.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {availableReceptions.map(
                  (
                    reception,
                  ) => {
                    const selected =
                      selectedReceptionIds.includes(
                        reception.id,
                      )

                    return (
                      <button
                        key={
                          reception.id
                        }
                        type="button"
                        onClick={() =>
                          toggleNewInvoiceReception(
                            reception.id,
                          )
                        }
                        className={[
                          'rounded-2xl border p-5 text-left transition',
                          selected
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-slate-800 bg-slate-950 hover:border-slate-600',
                        ].join(
                          ' ',
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-lg font-bold">
                              {reception.reception_number ||
                                'Sin folio'}
                            </p>

                            <p className="mt-1 text-sm text-slate-400">
                              {reception.other_carrier ||
                                reception.carrier}
                              {' · '}
                              {reception.trailer ||
                                'Sin trailer'}
                            </p>
                          </div>

                          <input
                            type="checkbox"
                            checked={
                              selected
                            }
                            readOnly
                            className="h-5 w-5 shrink-0 accent-emerald-500"
                          />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs uppercase text-slate-500">
                              Fecha
                            </p>

                            <p className="mt-1 font-semibold">
                              {reception.reception_date}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-slate-500">
                              Pallets
                            </p>

                            <p className="mt-1 font-semibold">
                              {reception.pallet_count}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-slate-500">
                              Cantidad
                            </p>

                            <p className="mt-1 font-semibold">
                              {reception.total_quantity}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-slate-500">
                              Bultos registrados
                            </p>

                            <p className="mt-1 font-semibold">
                              {reception.total_packages}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4">
                          <p className="text-xs uppercase text-slate-500">
                            Números de parte
                          </p>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {reception.part_numbers.length >
                              0 ? (
                              reception.part_numbers.map(
                                (
                                  partNumber,
                                ) => (
                                  <span
                                    key={
                                      partNumber
                                    }
                                    className="rounded-lg bg-slate-800 px-2 py-1 text-xs"
                                  >
                                    {partNumber}
                                  </span>
                                ),
                              )
                            ) : (
                              <span className="text-sm text-slate-500">
                                Sin números de parte
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  },
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-700 px-5 py-4 sm:flex-row sm:justify-end">
        {newInvoiceStep ===
        2 && (
          <button
            type="button"
            disabled={
              creatingInvoice
            }
            onClick={() => {
              setError('')
              setNewInvoiceStep(
                1,
              )
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 disabled:opacity-40"
          >
            <ArrowLeft size={18} />
            Atrás
          </button>
        )}

        <button
          type="button"
          disabled={
            creatingInvoice ||
            loadingAvailableReceptions
          }
          onClick={
            closeNewInvoice
          }
          className="rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 disabled:opacity-40"
        >
          Cancelar
        </button>

        {newInvoiceStep ===
        1 ? (
          <button
            type="button"
            disabled={
              loadingAvailableReceptions ||
              (newInvoiceMode === 'csv' &&
                (!newInvoiceImportData ||
                  !newInvoiceImportData.valid))
            }
            onClick={() =>
              void continueToReceptionSelection()
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-40"
          >
            {loadingAvailableReceptions
              ? 'Cargando...'
              : 'Continuar'}

            {!loadingAvailableReceptions && (
              <ArrowRight size={18} />
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={
              creatingInvoice ||
              selectedReceptionIds.length ===
                0
            }
            onClick={() =>
              void createNewInvoice()
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creatingInvoice
              ? 'Creando factura...'
              : 'Crear factura'}
          </button>
        )}
      </div>
    </div>
  </div>
)}


      {editingInvoice && (
        <EditInvoiceModal
          invoice={{
            id: editingInvoice.id,
            invoiceNumber: editingInvoice.invoice_number,
          }}
          invoiceNumber={editInvoiceNumber}
          carrier={editCarrier}
          packageCount={editPackageCount}
          availableReceptions={filteredEditReceptions}
          selectedReceptionIds={editSelectedReceptionIds}
          receptionSearch={editReceptionSearch}
          summary={editInvoiceSummary}
          existingPhotos={editInvoicePhotos}
          newPhotos={editNewPhotos}
          loadingReceptions={editLoadingReceptions}
          loadingPhotos={editLoadingPhotos}
          saving={savingInvoice}
          deletingPhotoId={deletingPhotoId}
          onInvoiceNumberChange={setEditInvoiceNumber}
          onCarrierChange={(carrier) => {
            setEditCarrier(carrier)
            void reloadEditReceptions(carrier)
          }}
          onPackageCountChange={setEditPackageCount}
          onReceptionSearchChange={setEditReceptionSearch}
          onToggleReception={toggleEditReception}
          onSelectAllVisible={selectAllVisibleEditReceptions}
          onClearVisible={clearVisibleEditReceptions}
          onAddPhotos={(files) =>
            setEditNewPhotos((current) => [
              ...current,
              ...files,
            ])
          }
          onRemoveNewPhoto={(index) =>
            setEditNewPhotos((current) =>
              current.filter(
                (_, photoIndex) =>
                  photoIndex !== index,
              ),
            )
          }
          onDeleteExistingPhoto={(photoId) =>
            void removeExistingInvoicePhoto(
              photoId,
            )
          }
          onClose={closeEditInvoice}
          onSave={() =>
            void saveInvoiceChanges()
          }
        />
      )}

      {scanningInvoice && (
        <InvoiceLoadScanner
          invoiceId={scanningInvoice.id}
          invoiceNumber={scanningInvoice.invoice_number}
          expectedLines={
            getInvoiceImport(scanningInvoice)
              ?.invoice_import_lines || []
          }
          onClose={() => setScanningInvoice(null)}
        />
      )}

      {invoiceViewerOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${invoiceViewerTitle}`}
          onClick={closeInvoiceViewer}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-700 px-5 py-4">
              <div>
                <p className="text-sm text-slate-400">
                  Fotografías de la factura
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  {invoiceViewerTitle}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeInvoiceViewer}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"
                aria-label="Cerrar visor"
                title="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            {invoiceViewerLoading ? (
              <div className="flex min-h-[420px] items-center justify-center text-slate-400">
                Cargando fotografías...
              </div>
            ) : (
              <>
                <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40 p-4 sm:p-6">
                  {invoiceViewerUrls.length >
                    1 && (
                    <button
                      type="button"
                      onClick={
                        showPreviousInvoicePhoto
                      }
                      className="absolute left-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
                      aria-label="Foto anterior"
                      title="Foto anterior"
                    >
                      <ChevronLeft size={26} />
                    </button>
                  )}

                  {invoiceViewerUrls[
                    invoiceViewerIndex
                  ] && (
                    <a
                      href={
                        invoiceViewerUrls[
                          invoiceViewerIndex
                        ]
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex max-h-[68vh] w-full items-center justify-center"
                      title="Abrir fotografía en una pestaña nueva"
                    >
                      <img
                        src={
                          invoiceViewerUrls[
                            invoiceViewerIndex
                          ]
                        }
                        alt={`Factura ${invoiceViewerTitle}, foto ${invoiceViewerIndex + 1}`}
                        className="max-h-[68vh] max-w-full rounded-xl object-contain"
                      />
                    </a>
                  )}

                  {invoiceViewerUrls.length >
                    1 && (
                    <button
                      type="button"
                      onClick={
                        showNextInvoicePhoto
                      }
                      className="absolute right-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
                      aria-label="Siguiente foto"
                      title="Siguiente foto"
                    >
                      <ChevronRight size={26} />
                    </button>
                  )}
                </div>

                <div className="border-t border-slate-700 p-4">
                  <p className="mb-3 text-center text-sm font-semibold text-slate-300">
                    Foto{' '}
                    {invoiceViewerIndex +
                      1}{' '}
                    de{' '}
                    {
                      invoiceViewerUrls.length
                    }
                  </p>

                  {invoiceViewerUrls.length >
                    1 && (
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {invoiceViewerUrls.map(
                        (
                          url,
                          index,
                        ) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() =>
                              setInvoiceViewerIndex(
                                index,
                              )
                            }
                            className={[
                              'h-20 w-24 shrink-0 overflow-hidden rounded-xl border-2 bg-black/40',
                              invoiceViewerIndex ===
                              index
                                ? 'border-emerald-500'
                                : 'border-slate-700',
                            ].join(' ')}
                            aria-label={`Mostrar foto ${index + 1}`}
                          >
                            <img
                              src={url}
                              alt={`Miniatura ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ReconciliationMetric({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className: string
}) {
  return (
    <div
      className={[
        'rounded-xl border px-4 py-3',
        className,
      ].join(' ')}
    >
      <p className="text-xs font-semibold uppercase opacity-80">
        {label}
      </p>

      <p className="mt-1 text-2xl font-bold">
        {value}
      </p>
    </div>
  )
}

function Info({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">
        {value}
      </p>
    </div>
  )
}
