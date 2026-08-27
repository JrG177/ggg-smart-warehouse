import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Box,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  ImagePlus,
  Layers3,
  MapPin,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'

import { supabase } from '../../lib/supabase'

type InventoryStatus =
  | 'available'
  | 'reserved'
  | 'loading'
  | 'shipped'

type AdministrativeStatus =
  | 'none'
  | 'in_billing'
  | 'billed'
  | 'osd'
  | 'osd_completed'
  | 'billed_osd'

type PalletPart = {
  id: string
  part_number: string
  quantity: number
  packages: number | null
}

type ReceptionInfo = {
  id: string
  reception_number: string | null
  carrier: string
  other_carrier: string | null
  trailer: string
  reception_date: string
}

type InventoryPallet = {
  id: string
  reception_id: string
  pallet_number: number
  inventory_status: InventoryStatus
  administrative_status: AdministrativeStatus
  location_code: string | null
  damaged: boolean
  completed: boolean
  is_archived: boolean
  created_at: string
  receptions:
    | ReceptionInfo
    | ReceptionInfo[]
    | null
  pallet_parts: PalletPart[]
}

type OpenInvoice = {
  id: string
  invoice_number: string
  carrier: string
  package_count: number
  created_at: string
}

type AggregatedPart = {
  part_number: string
  quantity: number
  packages: number
}

type DailyReceptionGroup = {
  key: string
  identifier: string
  receptionDate: string
  carrier: string
  trailers: string[]
  pallets: InventoryPallet[]
  parts: AggregatedPart[]
}

function getReception(
  pallet: InventoryPallet,
): ReceptionInfo | null {
  if (!pallet.receptions) {
    return null
  }

  if (Array.isArray(pallet.receptions)) {
    return pallet.receptions[0] || null
  }

  return pallet.receptions
}

function getCarrierName(
  reception: ReceptionInfo | null,
) {
  if (!reception) {
    return '—'
  }

  return (
    reception.other_carrier ||
    reception.carrier
  )
}

function getDailyReceptionIdentifier(
  date: string,
  carrier: string,
) {
  const normalizedDate =
    date.replace(/\D/g, '') ||
    'SINFECHA'

  const normalizedCarrier =
    carrier
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 16) ||
    'SIN-CARRIER'

  return `REC-${normalizedDate}-${normalizedCarrier}`
}

function getPalletDailyIdentifier(
  pallet: InventoryPallet,
) {
  const reception =
    getReception(pallet)

  return getDailyReceptionIdentifier(
    reception?.reception_date ||
      pallet.created_at.slice(0, 10),
    getCarrierName(reception),
  )
}

function formatDate(
  dateValue: string,
) {
  if (!dateValue) {
    return '—'
  }

  const [year, month, day] =
    dateValue.split('-')

  if (!year || !month || !day) {
    return dateValue
  }

  return `${month}/${day}/${year}`
}

function getStatusClasses(
  status: InventoryStatus,
) {
  if (status === 'available') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
  }

  if (status === 'reserved') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-400'
  }

  if (status === 'loading') {
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
  }

  return 'border-purple-500/30 bg-purple-500/10 text-purple-300'
}

function getStatusLabel(
  status: InventoryStatus,
) {
  if (status === 'available') {
    return 'Disponible'
  }

  if (status === 'reserved') {
    return 'Reservado'
  }

  if (status === 'loading') {
    return 'Cargando'
  }

  return 'Embarcado'
}

function getAdministrativeStatusLabel(
  status: AdministrativeStatus,
) {
  if (status === 'in_billing') {
    return 'En facturación'
  }

  if (status === 'billed') {
    return 'Facturada'
  }

  if (status === 'osd') {
    return 'OS&D'
  }

  if (status === 'osd_completed') {
    return 'OS&D completado'
  }

  if (status === 'billed_osd') {
    return 'Facturada · OS&D'
  }

  return 'Sin proceso'
}

function summarizeValues(
  values: string[],
) {
  const uniqueValues =
    Array.from(new Set(values))

  if (uniqueValues.length === 0) {
    return '—'
  }

  if (uniqueValues.length <= 2) {
    return uniqueValues.join(' · ')
  }

  return `${uniqueValues.length} estados`
}

export function InventoryPage() {
  const [pallets, setPallets] =
    useState<InventoryPallet[]>([])

  const [openInvoices, setOpenInvoices] =
    useState<OpenInvoice[]>([])

  const [searchTerm, setSearchTerm] =
    useState('')

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [successMessage, setSuccessMessage] =
    useState('')

  const [
    updatingPalletId,
    setUpdatingPalletId,
  ] = useState<string | null>(null)

  const [
    editingLocationId,
    setEditingLocationId,
  ] = useState<string | null>(null)

  const [
    locationDraft,
    setLocationDraft,
  ] = useState('')

  const [
    billingModalPallet,
    setBillingModalPallet,
  ] =
    useState<InventoryPallet | null>(null)

  const [
    billingMode,
    setBillingMode,
  ] =
    useState<'choose' | 'create'>('choose')

  const [
    selectedInvoiceId,
    setSelectedInvoiceId,
  ] =
    useState('')

  const [newInvoiceCarrier, setNewInvoiceCarrier] =
    useState('XPO')

  const [
    newInvoiceOtherCarrier,
    setNewInvoiceOtherCarrier,
  ] =
    useState('')

  const [newInvoiceNumber, setNewInvoiceNumber] =
    useState('')

  const [newInvoicePackages, setNewInvoicePackages] =
    useState('')

  const [
    newInvoicePhotos,
    setNewInvoicePhotos,
  ] =
    useState<File[]>([])

  const [savingInvoice, setSavingInvoice] =
    useState(false)

  const [
    expandedGroupKeys,
    setExpandedGroupKeys,
  ] = useState<string[]>([])

  const [
    deletingGroupKey,
    setDeletingGroupKey,
  ] = useState<string | null>(null)

  const toggleGroup = (
    groupKey: string,
  ) => {
    setExpandedGroupKeys(
      (current) =>
        current.includes(groupKey)
          ? current.filter(
              (key) =>
                key !== groupKey,
            )
          : [
              ...current,
              groupKey,
            ],
    )
  }

  const showSuccess = (
    message: string,
  ) => {
    setSuccessMessage(message)

    window.setTimeout(() => {
      setSuccessMessage('')
    }, 3000)
  }

  const loadInventory =
    async (
      showRefreshing = false,
    ) => {
      if (!showRefreshing) {
        setLoading(true)
      }

      setError('')

      const [
        inventoryResponse,
        invoicesResponse,
      ] = await Promise.all([
        supabase
          .from('pallets')
          .select(`
            id,
            reception_id,
            pallet_number,
            inventory_status,
            administrative_status,
            location_code,
            damaged,
            completed,
            is_archived,
            created_at,
            receptions (
              id,
              reception_number,
              carrier,
              other_carrier,
              trailer,
              reception_date
            ),
            pallet_parts (
              id,
              part_number,
              quantity,
              packages
            )
          `)
          .eq('is_archived', false)
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('invoices')
          .select(`
            id,
            invoice_number,
            carrier,
            package_count,
            created_at
          `)
          .eq('status', 'open')
          .order('created_at', {
            ascending: false,
          }),
      ])

      if (inventoryResponse.error) {
        setError(
          `No se pudo cargar el inventario: ${inventoryResponse.error.message}`,
        )
        setPallets([])
      } else {
        setPallets(
          (inventoryResponse.data || []) as InventoryPallet[],
        )
      }

      if (invoicesResponse.error) {
        setError(
          `No se pudieron cargar las facturas abiertas: ${invoicesResponse.error.message}`,
        )
        setOpenInvoices([])
      } else {
        setOpenInvoices(
          (invoicesResponse.data || []) as OpenInvoice[],
        )
      }

      setLoading(false)
    }

  useEffect(() => {
    void loadInventory()
  }, [])

  const updateInventoryStatus =
    async (
      palletId: string,
      newStatus: InventoryStatus,
    ) => {
      setUpdatingPalletId(palletId)

      const {
        error: updateError,
      } = await supabase
        .from('pallets')
        .update({
          inventory_status:
            newStatus,
        })
        .eq('id', palletId)

      if (updateError) {
        setError(
          updateError.message,
        )
      } else {
        setPallets(
          (current) =>
            current.map(
              (pallet) =>
                pallet.id === palletId
                  ? {
                      ...pallet,
                      inventory_status:
                        newStatus,
                    }
                  : pallet,
            ),
        )
      }

      setUpdatingPalletId(null)
    }

  const startEditingLocation =
    (
      pallet: InventoryPallet,
    ) => {
      setEditingLocationId(pallet.id)
      setLocationDraft(
        pallet.location_code || '',
      )
    }

  const saveLocation =
    async (
      palletId: string,
    ) => {
      const normalizedLocation =
        locationDraft
          .trim()
          .toUpperCase()

      setUpdatingPalletId(palletId)

      const {
        error: updateError,
      } = await supabase
        .from('pallets')
        .update({
          location_code:
            normalizedLocation || null,
        })
        .eq('id', palletId)

      if (updateError) {
        setError(updateError.message)
      } else {
        setEditingLocationId(null)
        setLocationDraft('')
        await loadInventory()
      }

      setUpdatingPalletId(null)
    }

  const resetBillingModal =
    () => {
      setBillingModalPallet(null)
      setBillingMode('choose')
      setSelectedInvoiceId('')
      setNewInvoiceOtherCarrier('')
      setNewInvoiceNumber('')
      setNewInvoicePackages('')
      setNewInvoicePhotos([])
      setSavingInvoice(false)
    }

  const openBillingModal =
    (
      pallet: InventoryPallet,
    ) => {
      const reception =
        getReception(pallet)

      setBillingModalPallet(pallet)
      setBillingMode('choose')
      setSelectedInvoiceId('')
      const carrier =
        getCarrierName(
          reception,
        )

      const predefinedCarriers = [
        'XPO',
        'CENTRAL',
        'MTY',
        'IZI',
      ]

      if (
        carrier !==
          '—' &&
        predefinedCarriers.includes(
          carrier.toUpperCase(),
        )
      ) {
        setNewInvoiceCarrier(
          carrier.toUpperCase(),
        )

        setNewInvoiceOtherCarrier(
          '',
        )
      } else if (
        carrier !==
        '—'
      ) {
        setNewInvoiceCarrier(
          'OTHER',
        )

        setNewInvoiceOtherCarrier(
          carrier,
        )
      } else {
        setNewInvoiceCarrier(
          'XPO',
        )

        setNewInvoiceOtherCarrier(
          '',
        )
      }

      setNewInvoiceNumber('')
      setNewInvoicePackages('')
      setNewInvoicePhotos([])
      setError('')
    }

  const ensureReceptionNotInOpenInvoice =
    async (
      receptionId: string,
    ) => {
      const {
        data,
        error: checkError,
      } = await supabase
        .from('invoice_receptions')
        .select(`
          id,
          invoices!inner (
            id,
            status,
            invoice_number
          )
        `)
        .eq('reception_id', receptionId)
        .eq('invoices.status', 'open')
        .limit(1)

      if (checkError) {
        throw new Error(
          checkError.message,
        )
      }

      if (data && data.length > 0) {
        throw new Error(
          'Esta recepción ya está agregada a una factura abierta.',
        )
      }
    }

  const markReceptionInBilling =
    async (
      receptionId: string,
    ) => {
      const {
        error: palletError,
      } = await supabase
        .from('pallets')
        .update({
          administrative_status:
            'in_billing',
        })
        .eq(
          'reception_id',
          receptionId,
        )
        .eq(
          'administrative_status',
          'none',
        )

      if (palletError) {
        throw new Error(
          palletError.message,
        )
      }
    }

  const addReceptionToInvoice =
    async (
      invoiceId: string,
      receptionId: string,
    ) => {
      await ensureReceptionNotInOpenInvoice(
        receptionId,
      )

      const {
        error: linkError,
      } = await supabase
        .from('invoice_receptions')
        .insert({
          invoice_id:
            invoiceId,
          reception_id:
            receptionId,
        })

      if (linkError) {
        throw new Error(
          linkError.message,
        )
      }

      await markReceptionInBilling(
        receptionId,
      )
    }

  const addToExistingInvoice =
    async () => {
      if (
        !billingModalPallet ||
        !selectedInvoiceId
      ) {
        return
      }

      try {
        setSavingInvoice(true)

        await addReceptionToInvoice(
          selectedInvoiceId,
          billingModalPallet.reception_id,
        )

        resetBillingModal()
        await loadInventory()

        showSuccess(
          'Recepción agregada a la factura.',
        )
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : 'No se pudo agregar la recepción.',
        )
      } finally {
        setSavingInvoice(false)
      }
    }

  const createInvoiceAndAddReception =
    async () => {
      if (!billingModalPallet) {
        return
      }

      const resolvedCarrier =
        newInvoiceCarrier ===
        'OTHER'
          ? newInvoiceOtherCarrier.trim()
          : newInvoiceCarrier.trim()

      if (
        !resolvedCarrier ||
        !newInvoiceNumber.trim() ||
        !newInvoicePackages ||
        Number(newInvoicePackages) < 0 ||
        newInvoicePhotos.length ===
          0
      ) {
        setError(
          newInvoiceCarrier ===
            'OTHER' &&
          !newInvoiceOtherCarrier.trim()
            ? 'Escribe el nombre del carrier.'
            : 'Completa Carrier, Número de Factura, Número de Bultos y Foto de la factura.',
        )
        return
      }

      try {
        setSavingInvoice(true)
        setError('')

        await ensureReceptionNotInOpenInvoice(
          billingModalPallet.reception_id,
        )

        const {
          data: invoice,
          error: invoiceError,
        } = await supabase
          .from('invoices')
          .insert({
            invoice_number:
              `INV-${newInvoiceNumber.trim()}`,
            carrier:
              resolvedCarrier,
            package_count:
              Number(newInvoicePackages),
            status:
              'open',
          })
          .select()
          .single()

        if (invoiceError) {
          throw new Error(
            invoiceError.message,
          )
        }

        const uploadedPhotoPaths:
          string[] = []

        for (
          const [
            photoIndex,
            photoFile,
          ] of newInvoicePhotos.entries()
        ) {
          const extension =
            photoFile.name
              .split('.')
              .pop() ||
            'jpg'

          const storagePath =
            `${invoice.id}/${Date.now()}-${photoIndex}-${Math.random()
              .toString(36)
              .slice(2, 8)}.${extension}`

          const {
            error: uploadError,
          } = await supabase.storage
            .from('invoice-documents')
            .upload(
              storagePath,
              photoFile,
              {
                upsert: false,
              },
            )

          if (
            uploadError
          ) {
            throw new Error(
              uploadError.message,
            )
          }

          uploadedPhotoPaths.push(
            storagePath,
          )
        }

        const primaryPhotoPath =
          uploadedPhotoPaths[0]

        const {
          error:
            photoUpdateError,
        } = await supabase
          .from('invoices')
          .update({
            invoice_photo_path:
              primaryPhotoPath,
          })
          .eq(
            'id',
            invoice.id,
          )

        if (
          photoUpdateError
        ) {
          throw new Error(
            photoUpdateError.message,
          )
        }

        const {
          error:
            invoicePhotosError,
        } = await supabase
          .from(
            'invoice_photos',
          )
          .insert(
            uploadedPhotoPaths.map(
              (
                photoPath,
                photoIndex,
              ) => ({
                invoice_id:
                  invoice.id,

                photo_path:
                  photoPath,

                sort_order:
                  photoIndex,
              }),
            ),
          )

        if (
          invoicePhotosError
        ) {
          throw new Error(
            invoicePhotosError.message,
          )
        }

        await addReceptionToInvoice(
          invoice.id,
          billingModalPallet.reception_id,
        )

        resetBillingModal()
        await loadInventory()

        showSuccess(
          'Factura creada y recepción agregada.',
        )
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : 'No se pudo crear la factura.',
        )
      } finally {
        setSavingInvoice(false)
      }
    }

  const sendToOsd =
    async (
      pallet: InventoryPallet,
    ) => {
      try {
        setUpdatingPalletId(pallet.id)

        const {
          error: queueError,
        } = await supabase
          .from('osd_queue')
          .insert({
            pallet_id:
              pallet.id,
          })

        if (queueError) {
          throw new Error(
            queueError.message,
          )
        }

        const {
          error: palletError,
        } = await supabase
          .from('pallets')
          .update({
            administrative_status:
              'osd',
          })
          .eq('id', pallet.id)

        if (palletError) {
          throw new Error(
            palletError.message,
          )
        }

        await loadInventory()
        showSuccess(
          'Registro enviado a OS&D.',
        )
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : 'No se pudo enviar a OS&D.',
        )
      } finally {
        setUpdatingPalletId(null)
      }
    }


  const archivePallet =
    async (
      pallet: InventoryPallet,
    ) => {
      const confirmed =
        window.confirm(
          `¿Eliminar un registro interno de ${getPalletDailyIdentifier(
            pallet,
          )}?\n\nNo se borrará permanentemente; quedará archivado para conservar el historial.`,
        )

      if (!confirmed) {
        return
      }

      try {
        setUpdatingPalletId(
          pallet.id,
        )

        setError('')

        const {
          error: archiveError,
        } = await supabase
          .from('pallets')
          .update({
            is_archived:
              true,
          })
          .eq(
            'id',
            pallet.id,
          )

        if (archiveError) {
          throw new Error(
            archiveError.message,
          )
        }

        setPallets(
          (current) =>
            current.filter(
              (item) =>
                item.id !==
                pallet.id,
            ),
        )

        showSuccess(
          'Registro eliminado del inventario visible.',
        )
      } catch (archiveError) {
        setError(
          archiveError instanceof Error
            ? archiveError.message
            : 'No se pudo eliminar el registro del inventario.',
        )
      } finally {
        setUpdatingPalletId(
          null,
        )
      }
    }

  const archiveReceptionGroup =
    async (
      group: DailyReceptionGroup,
    ) => {
      const confirmed =
        window.confirm(
          `¿Eliminar ${group.identifier} del inventario?\n\nSe archivarán sus ${group.pallets.length} registros internos. No se borrarán permanentemente y el historial se conservará.`,
        )

      if (!confirmed) {
        return
      }

      const palletIds =
        group.pallets.map(
          (pallet) =>
            pallet.id,
        )

      try {
        setDeletingGroupKey(
          group.key,
        )

        setError('')

        const {
          error: archiveError,
        } = await supabase
          .from('pallets')
          .update({
            is_archived:
              true,
          })
          .in(
            'id',
            palletIds,
          )

        if (archiveError) {
          throw new Error(
            archiveError.message,
          )
        }

        const archivedIds =
          new Set(
            palletIds,
          )

        setPallets(
          (current) =>
            current.filter(
              (pallet) =>
                !archivedIds.has(
                  pallet.id,
                ),
            ),
        )

        setExpandedGroupKeys(
          (current) =>
            current.filter(
              (key) =>
                key !== group.key,
            ),
        )

        showSuccess(
          `${group.identifier} se eliminó del inventario visible.`,
        )
      } catch (archiveError) {
        setError(
          archiveError instanceof Error
            ? archiveError.message
            : 'No se pudo eliminar la recepción agrupada.',
        )
      } finally {
        setDeletingGroupKey(
          null,
        )
      }
    }

  const dailyReceptionGroups =
    useMemo(
      () => {
        const grouped =
          new Map<
            string,
            {
              key: string
              receptionDate: string
              carrier: string
              trailers: Set<string>
              pallets: InventoryPallet[]
              parts: Map<string, AggregatedPart>
            }
          >()

        pallets.forEach(
          (pallet) => {
            const reception =
              getReception(pallet)

            const receptionDate =
              reception?.reception_date ||
              pallet.created_at.slice(0, 10)

            const carrier =
              getCarrierName(reception)

            const key =
              `${receptionDate}|${carrier.toLowerCase()}`

            const current =
              grouped.get(key) || {
                key,
                receptionDate,
                carrier,
                trailers:
                  new Set<string>(),
                pallets: [],
                parts:
                  new Map<
                    string,
                    AggregatedPart
                  >(),
              }

            current.pallets.push(
              pallet,
            )

            if (reception?.trailer) {
              current.trailers.add(
                reception.trailer,
              )
            }

            pallet.pallet_parts.forEach(
              (part) => {
                const partNumber =
                  part.part_number.trim() ||
                  'Sin número de parte'

                const partKey =
                  partNumber.toLowerCase()

                const existingPart =
                  current.parts.get(
                    partKey,
                  )

                if (existingPart) {
                  existingPart.quantity +=
                    Number(
                      part.quantity || 0,
                    )

                  existingPart.packages +=
                    Number(
                      part.packages || 0,
                    )
                } else {
                  current.parts.set(
                    partKey,
                    {
                      part_number:
                        partNumber,
                      quantity:
                        Number(
                          part.quantity || 0,
                        ),
                      packages:
                        Number(
                          part.packages || 0,
                        ),
                    },
                  )
                }
              },
            )

            grouped.set(
              key,
              current,
            )
          },
        )

        return Array.from(
          grouped.values(),
        )
          .map(
            (group): DailyReceptionGroup => ({
              key:
                group.key,
              identifier:
                getDailyReceptionIdentifier(
                  group.receptionDate,
                  group.carrier,
                ),
              receptionDate:
                group.receptionDate,
              carrier:
                group.carrier,
              trailers:
                Array.from(
                  group.trailers,
                ).sort(),
              pallets:
                group.pallets,
              parts:
                Array.from(
                  group.parts.values(),
                ).sort((first, second) =>
                  first.part_number.localeCompare(
                    second.part_number,
                    undefined,
                    {
                      numeric: true,
                    },
                  ),
                ),
            }),
          )
          .sort((first, second) =>
            second.receptionDate.localeCompare(
              first.receptionDate,
            ) ||
            first.carrier.localeCompare(
              second.carrier,
            ),
          )
      },
      [pallets],
    )

  const filteredReceptionGroups =
    useMemo(
      () => {
        const search =
          searchTerm
            .trim()
            .toLowerCase()

        if (!search) {
          return dailyReceptionGroups
        }

        return dailyReceptionGroups.filter(
          (group) =>
            [
              group.identifier,
              group.carrier,
              group.receptionDate,
              group.trailers.join(' '),
              group.parts
                .map(
                  (part) =>
                    part.part_number,
                )
                .join(' '),
              group.pallets
                .map((pallet) => {
                  const reception =
                    getReception(pallet)

                  return [
                    reception?.reception_number || '',
                    pallet.location_code || '',
                  ].join(' ')
                })
                .join(' '),
            ].some((value) =>
              value
                .toLowerCase()
                .includes(search),
            ),
        )
      },
      [
        dailyReceptionGroups,
        searchTerm,
      ],
    )

  const availableCount =
    pallets.filter(
      (pallet) =>
        pallet.inventory_status ===
        'available',
    ).length

  const withoutLocationCount =
    pallets.filter(
      (pallet) =>
        !pallet.location_code,
    ).length

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-slate-400">
          Control de almacén
        </p>

        <h1 className="mt-2 text-3xl font-bold text-white">
          Inventario
        </h1>

        <p className="mt-2 text-slate-400">
          Consulta el material agrupado por fecha y carrier, con todos sus números de parte y controles operativos.
        </p>
      </section>

      {successMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-400">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-400">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <Metric
          label="Recepciones agrupadas"
          value={String(
            dailyReceptionGroups.length,
          )}
          helper={`${pallets.length} registros internos`}
        />

        <Metric
          label="Disponibles"
          value={String(availableCount)}
          helper="Registros listos para operación"
        />

        <Metric
          label="Sin ubicación"
          value={String(withoutLocationCount)}
          helper="Requieren asignación"
        />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-800 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Inventario actual
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Una recepción por fecha y carrier
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
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
                placeholder="Buscar identificador, carrier o parte..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-4 text-sm outline-none sm:w-80"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                void loadInventory(true)
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold"
            >
              <RefreshCcw size={17} />
              Actualizar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-4">
                  Identificador
                </th>
                <th className="px-5 py-4">
                  Carrier / Trailer
                </th>
                <th className="px-5 py-4">
                  Números de parte
                </th>
                <th className="px-5 py-4">
                  Cantidad
                </th>
                <th className="px-5 py-4">
                  Ubicaciones
                </th>
                <th className="px-5 py-4">
                  Estado
                </th>
                <th className="px-5 py-4">
                  Proceso administrativo
                </th>
                <th className="px-5 py-4 text-center">
                  Acciones
                </th>
                <th className="px-5 py-4">
                  Entrada
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    Cargando inventario...
                  </td>
                </tr>
              ) : filteredReceptionGroups.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    {searchTerm
                      ? 'No se encontraron recepciones con esa búsqueda.'
                      : 'Todavía no hay material registrado.'}
                  </td>
                </tr>
              ) : (
                filteredReceptionGroups.map(
                  (group) => {
                    const isExpanded =
                      expandedGroupKeys.includes(
                        group.key,
                      )

                    const totalQuantity =
                      group.parts.reduce(
                        (total, part) =>
                          total +
                          part.quantity,
                        0,
                      )

                    const locations =
                      Array.from(
                        new Set(
                          group.pallets
                            .map(
                              (pallet) =>
                                pallet.location_code,
                            )
                            .filter(
                              (
                                location,
                              ): location is string =>
                                Boolean(location),
                            ),
                        ),
                      )

                    const withoutLocation =
                      group.pallets.filter(
                        (pallet) =>
                          !pallet.location_code,
                      ).length

                    const inventorySummary =
                      summarizeValues(
                        group.pallets.map(
                          (pallet) =>
                            getStatusLabel(
                              pallet.inventory_status,
                            ),
                        ),
                      )

                    const administrativeSummary =
                      summarizeValues(
                        group.pallets.map(
                          (pallet) =>
                            getAdministrativeStatusLabel(
                              pallet.administrative_status,
                            ),
                        ),
                      )

                    return (
                      <Fragment key={group.key}>
                        <tr className="transition hover:bg-slate-800/40">
                          <td className="px-5 py-5">
                            <div className="flex items-center gap-3">
                              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                                <Layers3 size={18} />
                              </div>

                              <div>
                                <p className="font-semibold text-white">
                                  {group.identifier}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                  {group.pallets.length}{' '}
                                  registro(s) interno(s)
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-5">
                            <p className="font-medium text-slate-200">
                              {group.carrier}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {group.trailers.length >
                              0
                                ? group.trailers.join(
                                    ' · ',
                                  )
                                : 'Sin trailer'}
                            </p>
                          </td>

                          <td className="px-5 py-5">
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() =>
                                toggleGroup(
                                  group.key,
                                )
                              }
                              className="inline-flex min-w-44 items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:border-emerald-500/50"
                            >
                              <span>
                                {group.parts.length}{' '}
                                número(s) de parte
                              </span>

                              {isExpanded ? (
                                <ChevronDown
                                  size={17}
                                  className="text-emerald-400"
                                />
                              ) : (
                                <ChevronRight
                                  size={17}
                                  className="text-slate-500"
                                />
                              )}
                            </button>
                          </td>

                          <td className="px-5 py-5 font-semibold text-slate-200">
                            {totalQuantity}
                          </td>

                          <td className="px-5 py-5">
                            <p className="text-sm text-slate-300">
                              {locations.length >
                              0
                                ? locations.join(
                                    ' · ',
                                  )
                                : 'Sin ubicación'}
                            </p>

                            {withoutLocation >
                              0 && (
                              <p className="mt-1 text-xs font-semibold text-amber-400">
                                {withoutLocation}{' '}
                                pendiente(s)
                              </p>
                            )}
                          </td>

                          <td className="px-5 py-5">
                            <span className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300">
                              {inventorySummary}
                            </span>
                          </td>

                          <td className="px-5 py-5">
                            <span className="text-sm text-slate-300">
                              {administrativeSummary}
                            </span>
                          </td>

                          <td className="px-5 py-5 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleGroup(
                                    group.key,
                                  )
                                }
                                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                              >
                                {isExpanded ? (
                                  <ChevronDown
                                    size={15}
                                  />
                                ) : (
                                  <ChevronRight
                                    size={15}
                                  />
                                )}

                                {isExpanded
                                  ? 'Cerrar'
                                  : 'Administrar'}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  deletingGroupKey ===
                                  group.key
                                }
                                onClick={() =>
                                  void archiveReceptionGroup(
                                    group,
                                  )
                                }
                                className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2
                                  size={15}
                                />

                                {deletingGroupKey ===
                                group.key
                                  ? 'Eliminando...'
                                  : 'Eliminar'}
                              </button>
                            </div>
                          </td>

                          <td className="px-5 py-5">
                            <p className="text-sm text-slate-300">
                              {formatDate(
                                group.receptionDate,
                              )}
                            </p>

                            {group.pallets.some(
                              (pallet) =>
                                pallet.damaged,
                            ) && (
                              <p className="mt-1 text-xs font-semibold text-red-400">
                                Contiene material dañado
                              </p>
                            )}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td
                              colSpan={9}
                              className="bg-slate-950/60 px-5 py-5"
                            >
                              <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(520px,1.7fr)]">
                                <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                                  <h3 className="font-semibold text-white">
                                    Números de parte
                                  </h3>

                                  <p className="mt-1 text-xs text-slate-500">
                                    Cantidades sumadas de toda la recepción del día.
                                  </p>

                                  <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
                                    {group.parts.map(
                                      (part) => (
                                        <div
                                          key={
                                            part.part_number
                                          }
                                          className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
                                        >
                                          <div className="flex min-w-0 items-center gap-3">
                                            <Box
                                              size={16}
                                              className="shrink-0 text-emerald-400"
                                            />

                                            <p className="truncate font-semibold text-slate-200">
                                              {
                                                part.part_number
                                              }
                                            </p>
                                          </div>

                                          <div className="shrink-0 text-right">
                                            <p className="text-sm font-bold text-white">
                                              {
                                                part.quantity
                                              }{' '}
                                              unidades
                                            </p>

                                            {part.packages >
                                              0 && (
                                              <p className="text-xs text-slate-500">
                                                {
                                                  part.packages
                                                }{' '}
                                                bultos
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </section>

                                <section className="space-y-3">
                                  <div>
                                    <h3 className="font-semibold text-white">
                                      Controles internos
                                    </h3>

                                    <p className="mt-1 text-xs text-slate-500">
                                      Los registros internos permanecen separados para conservar ubicación, estado, facturación y OS&amp;D.
                                    </p>
                                  </div>

                                  {group.pallets.map(
                                    (
                                      pallet,
                                      palletIndex,
                                    ) => (
                                      <article
                                        key={pallet.id}
                                        className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                                      >
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                          <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <p className="font-semibold text-slate-200">
                                                Registro interno{' '}
                                                {palletIndex +
                                                  1}
                                              </p>

                                              {pallet.damaged && (
                                                <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-400">
                                                  Dañado
                                                </span>
                                              )}
                                            </div>

                                            <div className="mt-2 flex flex-wrap gap-2">
                                              {pallet.pallet_parts.map(
                                                (part) => (
                                                  <span
                                                    key={
                                                      part.id
                                                    }
                                                    className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300"
                                                  >
                                                    {
                                                      part.part_number
                                                    }
                                                  </span>
                                                ),
                                              )}
                                            </div>
                                          </div>

                                          <button
                                            type="button"
                                            title="Archivar registro"
                                            aria-label="Archivar registro"
                                            disabled={
                                              updatingPalletId ===
                                              pallet.id
                                            }
                                            onClick={() =>
                                              void archivePallet(
                                                pallet,
                                              )
                                            }
                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition hover:bg-red-500/20 disabled:opacity-40"
                                          >
                                            <Trash2
                                              size={16}
                                            />
                                          </button>
                                        </div>

                                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                                          <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                              Ubicación
                                            </p>

                                            {editingLocationId ===
                                            pallet.id ? (
                                              <div className="flex gap-2">
                                                <input
                                                  value={
                                                    locationDraft
                                                  }
                                                  onChange={(
                                                    event,
                                                  ) =>
                                                    setLocationDraft(
                                                      event
                                                        .target
                                                        .value,
                                                    )
                                                  }
                                                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
                                                />

                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    void saveLocation(
                                                      pallet.id,
                                                    )
                                                  }
                                                  className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950"
                                                >
                                                  Guardar
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  startEditingLocation(
                                                    pallet,
                                                  )
                                                }
                                                className="inline-flex w-full items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300"
                                              >
                                                <MapPin
                                                  size={14}
                                                />

                                                {pallet.location_code ||
                                                  'Asignar ubicación'}
                                              </button>
                                            )}
                                          </div>

                                          <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                              Estado
                                            </p>

                                            <select
                                              value={
                                                pallet.inventory_status
                                              }
                                              disabled={
                                                updatingPalletId ===
                                                pallet.id
                                              }
                                              onChange={(
                                                event,
                                              ) =>
                                                void updateInventoryStatus(
                                                  pallet.id,
                                                  event
                                                    .target
                                                    .value as InventoryStatus,
                                                )
                                              }
                                              className={[
                                                'w-full rounded-xl border px-3 py-2 text-xs font-semibold outline-none',
                                                getStatusClasses(
                                                  pallet.inventory_status,
                                                ),
                                              ].join(
                                                ' ',
                                              )}
                                            >
                                              <option value="available">
                                                Disponible
                                              </option>
                                              <option value="reserved">
                                                Reservado
                                              </option>
                                              <option value="loading">
                                                Cargando
                                              </option>
                                              <option value="shipped">
                                                Embarcado
                                              </option>
                                            </select>
                                          </div>

                                          <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                              Proceso
                                            </p>

                                            {pallet.administrative_status ===
                                            'billed' ? (
                                              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300">
                                                <FileCheck2
                                                  size={15}
                                                />
                                                Facturada
                                              </span>
                                            ) : pallet.administrative_status ===
                                              'billed_osd' ? (
                                              <span className="inline-flex items-center gap-2 rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">
                                                <ShieldAlert
                                                  size={15}
                                                />
                                                Facturada · OS&amp;D
                                              </span>
                                            ) : pallet.administrative_status ===
                                              'in_billing' ? (
                                              <span className="inline-flex rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400">
                                                En facturación
                                              </span>
                                            ) : pallet.administrative_status ===
                                                'osd' ||
                                              pallet.administrative_status ===
                                                'osd_completed' ? (
                                              <div className="flex flex-wrap gap-2">
                                                <span className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
                                                  <ShieldAlert
                                                    size={15}
                                                  />
                                                  {pallet.administrative_status ===
                                                  'osd'
                                                    ? 'OS&D'
                                                    : 'OS&D completado'}
                                                </span>

                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    openBillingModal(
                                                      pallet,
                                                    )
                                                  }
                                                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400"
                                                >
                                                  <ReceiptText
                                                    size={15}
                                                  />
                                                  Facturar
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex flex-wrap gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    openBillingModal(
                                                      pallet,
                                                    )
                                                  }
                                                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400"
                                                >
                                                  <ReceiptText
                                                    size={15}
                                                  />
                                                  Facturar
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    void sendToOsd(
                                                      pallet,
                                                    )
                                                  }
                                                  className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400"
                                                >
                                                  <ShieldAlert
                                                    size={15}
                                                  />
                                                  OS&amp;D
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </article>
                                    ),
                                  )}
                                </section>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  },
                )
              )}
            </tbody>
          </table>
        </div>
      </section>
      {billingModalPallet && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">
                  Agregar a factura
                </p>

                <h2 className="mt-1 text-2xl font-bold">
                  {getPalletDailyIdentifier(
                    billingModalPallet,
                  )}
                </h2>
              </div>

              <button
                type="button"
                onClick={resetBillingModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"
              >
                <X size={20} />
              </button>
            </div>

            {billingMode === 'choose' ? (
              <div className="mt-6 space-y-6">
                <button
                  type="button"
                  onClick={() =>
                    setBillingMode('create')
                  }
                  className="flex w-full items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-left text-emerald-400"
                >
                  <Plus size={22} />

                  <div>
                    <p className="font-semibold">
                      Crear nueva factura
                    </p>

                    <p className="text-xs text-emerald-300/70">
                      Registrar carrier, número, bultos y foto.
                    </p>
                  </div>
                </button>

                <div>
                  <h3 className="font-semibold">
                    Facturas abiertas
                  </h3>

                  <div className="mt-3 space-y-2">
                    {openInvoices.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">
                        No hay facturas abiertas.
                      </p>
                    ) : (
                      openInvoices.map(
                        (invoice) => (
                          <label
                            key={invoice.id}
                            className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-4"
                          >
                            <div>
                              <p className="font-semibold">
                                {invoice.invoice_number}
                              </p>

                              <p className="text-xs text-slate-500">
                                {invoice.carrier} · {invoice.package_count} bultos
                              </p>
                            </div>

                            <input
                              type="radio"
                              name="invoice"
                              value={invoice.id}
                              checked={
                                selectedInvoiceId ===
                                invoice.id
                              }
                              onChange={() =>
                                setSelectedInvoiceId(
                                  invoice.id,
                                )
                              }
                              className="h-5 w-5 accent-emerald-500"
                            />
                          </label>
                        ),
                      )
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    !selectedInvoiceId ||
                    savingInvoice
                  }
                  onClick={() =>
                    void addToExistingInvoice()
                  }
                  className="w-full rounded-xl bg-emerald-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-30"
                >
                  Agregar a factura seleccionada
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <Field label="Carrier">
                  <select
                    value={
                      newInvoiceCarrier
                    }
                    onChange={(
                      event,
                    ) => {
                      const value =
                        event.target.value

                      setNewInvoiceCarrier(
                        value,
                      )

                      if (
                        value !==
                        'OTHER'
                      ) {
                        setNewInvoiceOtherCarrier(
                          '',
                        )
                      }
                    }}
                    className="input-style"
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

                    <option value="OTHER">
                      OTHER
                    </option>
                  </select>
                </Field>

                {newInvoiceCarrier ===
                  'OTHER' && (
                  <Field label="Nombre del Carrier">
                    <input
                      value={
                        newInvoiceOtherCarrier
                      }
                      onChange={(
                        event,
                      ) =>
                        setNewInvoiceOtherCarrier(
                          event.target.value,
                        )
                      }
                      placeholder="Nombre del carrier"
                      className="input-style"
                    />
                  </Field>
                )}

                <Field label="Número de Factura">
                  <div className="flex overflow-hidden rounded-xl border border-slate-700 bg-slate-950 focus-within:border-emerald-500">
                    <span className="flex items-center border-r border-slate-700 bg-slate-800 px-4 font-bold text-slate-300">
                      INV-
                    </span>

                    <input
                      type="text"
                      inputMode="numeric"
                      value={newInvoiceNumber}
                      onChange={(event) =>
                        setNewInvoiceNumber(
                          event.target.value.replace(
                            /\D/g,
                            '',
                          ),
                        )
                      }
                      placeholder="123456"
                      className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none"
                    />
                  </div>
                </Field>

                <Field label="Número de Bultos">
                  <input
                    type="number"
                    min="0"
                    value={newInvoicePackages}
                    onChange={(event) =>
                      setNewInvoicePackages(
                        event.target.value,
                      )
                    }
                    className="input-style"
                  />
                </Field>

                <Field label="Fotos de la Factura">
                  <div className="space-y-3">
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950 p-6 text-slate-300">
                      <ImagePlus size={20} />

                      Agregar fotos de la factura

                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(
                          event,
                        ) => {
                          const selectedFiles =
                            Array.from(
                              event.target.files ||
                                [],
                            )

                          if (
                            selectedFiles.length >
                            0
                          ) {
                            setNewInvoicePhotos(
                              (
                                current,
                              ) => [
                                ...current,

                                ...selectedFiles,
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
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-slate-400">
                          {newInvoicePhotos.length}{' '}
                          foto(s) agregada(s)
                        </p>

                        <div className="space-y-2">
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
                                  <p className="truncate text-sm font-medium">
                                    {photo.name}
                                  </p>

                                  {index ===
                                    0 && (
                                    <p className="mt-1 text-xs text-emerald-400">
                                      Foto principal
                                    </p>
                                  )}
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
                                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                  title="Quitar foto"
                                  aria-label={`Quitar ${photo.name}`}
                                >
                                  <Trash2
                                    size={
                                      16
                                    }
                                  />
                                </button>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Field>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() =>
                      setBillingMode('choose')
                    }
                    className="flex-1 rounded-xl border border-slate-700 px-5 py-3 font-semibold"
                  >
                    Atrás
                  </button>

                  <button
                    type="button"
                    disabled={savingInvoice}
                    onClick={() =>
                      void createInvoiceAndAddReception()
                    }
                    className="flex-1 rounded-xl bg-emerald-500 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
                  >
                    Guardar factura
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>
        {`
          .input-style {
            width: 100%;
            border-radius: 0.75rem;
            border: 1px solid rgb(51 65 85);
            background: rgb(2 6 23);
            padding: 0.75rem 1rem;
            color: white;
            outline: none;
          }

          .input-style:focus {
            border-color: rgb(16 185 129);
          }
        `}
      </style>
    </div>
  )
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper: string
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">
        {label}
      </p>

      <p className="mt-3 text-3xl font-bold">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {helper}
      </p>
    </article>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-slate-400">
        {label}
      </span>
      {children}
    </label>
  )
}
