import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Box,
  FileCheck2,
  ImagePlus,
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

function getVisualPalletNumber(
  pallet: InventoryPallet,
) {
  return `PLT-${String(
    pallet.pallet_number,
  ).padStart(6, '0')}`
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
          'Pallet enviado a OS&D.',
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
          `¿Eliminar ${getVisualPalletNumber(
            pallet,
          )} del inventario?\n\nEl registro no se borrará permanentemente; quedará archivado para conservar el historial.`,
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
          'Pallet eliminado del inventario visible.',
        )
      } catch (archiveError) {
        setError(
          archiveError instanceof Error
            ? archiveError.message
            : 'No se pudo eliminar el pallet del inventario.',
        )
      } finally {
        setUpdatingPalletId(
          null,
        )
      }
    }

  const filteredPallets =
    useMemo(
      () => {
        const search =
          searchTerm
            .trim()
            .toLowerCase()

        if (!search) {
          return pallets
        }

        return pallets.filter(
          (pallet) => {
            const reception =
              getReception(pallet)

            const parts =
              pallet.pallet_parts
                .map(
                  (part) =>
                    part.part_number,
                )
                .join(' ')

            return [
              getVisualPalletNumber(pallet),
              reception?.reception_number || '',
              getCarrierName(reception),
              reception?.trailer || '',
              pallet.location_code || '',
              parts,
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
        pallets,
        searchTerm,
      ],
    )

  const totalUnits =
    pallets.reduce(
      (total, pallet) =>
        total +
        pallet.pallet_parts.reduce(
          (subTotal, part) =>
            subTotal +
            Number(part.quantity || 0),
          0,
        ),
      0,
    )

  const availableCount =
    pallets.filter(
      (pallet) =>
        pallet.inventory_status ===
        'available',
    ).length

  const reservedLoadingCount =
    pallets.filter(
      (pallet) =>
        pallet.inventory_status ===
          'reserved' ||
        pallet.inventory_status ===
          'loading',
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
          Consulta los pallets recibidos, su contenido, ubicación física y estado dentro de la operación.
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Pallets en inventario"
          value={String(pallets.length)}
          helper={`${totalUnits} unidades registradas`}
        />

        <Metric
          label="Disponibles"
          value={String(availableCount)}
          helper="Listos para operación"
        />

        <Metric
          label="Reservados / Cargando"
          value={String(reservedLoadingCount)}
          helper="Comprometidos para salida"
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
              Pallets registrados desde Recepción
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
                placeholder="Buscar pallet, recepción, parte..."
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
          <table className="w-full min-w-[1250px] text-left">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-4">Pallet</th>
                <th className="px-5 py-4">Recepción</th>
                <th className="px-5 py-4">Carrier / Trailer</th>
                <th className="px-5 py-4">Números de parte</th>
                <th className="px-5 py-4">Cantidad</th>
                <th className="px-5 py-4">Ubicación</th>
                <th className="px-5 py-4">Estado</th>
                <th className="px-5 py-4">Proceso administrativo</th>
                <th className="px-5 py-4 text-center">Acciones</th>
                <th className="px-5 py-4">Entrada</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    Cargando inventario...
                  </td>
                </tr>
              ) : (
                filteredPallets.map(
                  (pallet) => {
                    const reception =
                      getReception(pallet)

                    const totalQuantity =
                      pallet.pallet_parts.reduce(
                        (total, part) =>
                          total +
                          Number(
                            part.quantity || 0,
                          ),
                        0,
                      )

                    return (
                      <tr key={pallet.id}>
                        <td className="px-5 py-5">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-slate-800 p-2 text-emerald-400">
                              <Box size={17} />
                            </div>

                            <div>
                              <p className="font-semibold">
                                {getVisualPalletNumber(
                                  pallet,
                                )}
                              </p>

                              <p className="text-xs text-slate-600">
                                {pallet.id.slice(0, 8)}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-5">
                          {reception?.reception_number ||
                            '—'}
                        </td>

                        <td className="px-5 py-5">
                          <p>
                            {getCarrierName(
                              reception,
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {reception?.trailer ||
                              '—'}
                          </p>
                        </td>

                        <td className="px-5 py-5">
                          <div className="flex flex-wrap gap-2">
                            {pallet.pallet_parts.map(
                              (part) => (
                                <span
                                  key={part.id}
                                  className="rounded-lg bg-slate-800 px-2 py-1 text-xs"
                                >
                                  {part.part_number}
                                </span>
                              ),
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-5">
                          {totalQuantity}
                        </td>

                        <td className="px-5 py-5">
                          {editingLocationId ===
                          pallet.id ? (
                            <div className="flex gap-2">
                              <input
                                value={locationDraft}
                                onChange={(event) =>
                                  setLocationDraft(
                                    event.target.value,
                                  )
                                }
                                className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
                              />

                              <button
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
                              onClick={() =>
                                startEditingLocation(
                                  pallet,
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs"
                            >
                              <MapPin size={14} />
                              {pallet.location_code ||
                                'Asignar ubicación'}
                            </button>
                          )}
                        </td>

                        <td className="px-5 py-5">
                          <select
                            value={
                              pallet.inventory_status
                            }
                            disabled={
                              updatingPalletId ===
                              pallet.id
                            }
                            onChange={(event) =>
                              void updateInventoryStatus(
                                pallet.id,
                                event.target.value as InventoryStatus,
                              )
                            }
                            className={[
                              'rounded-xl border px-3 py-2 text-xs font-semibold outline-none',
                              getStatusClasses(
                                pallet.inventory_status,
                              ),
                            ].join(' ')}
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
                        </td>

                        <td className="px-5 py-5">
                          {pallet.administrative_status ===
                          'billed' ? (
                            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.20)]">
                              <FileCheck2 size={16} />
                              Facturada
                            </span>
                          ) : pallet.administrative_status ===
                            'billed_osd' ? (
                            <span className="inline-flex items-center gap-2 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-300 shadow-[0_0_18px_rgba(248,113,113,0.15)]">
                              <ShieldAlert size={15} />
                              Facturada · OS&amp;D
                            </span>
                          ) : pallet.administrative_status ===
                            'in_billing' ? (
                            <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400">
                              En facturación
                            </span>
                          ) : pallet.administrative_status ===
                            'osd' ||
                            pallet.administrative_status ===
                              'osd_completed' ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
                                <ShieldAlert size={15} />
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
                                <ReceiptText size={15} />
                                Facturar
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openBillingModal(
                                    pallet,
                                  )
                                }
                                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400"
                              >
                                <ReceiptText size={15} />
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
                                <ShieldAlert size={15} />
                                OS&amp;D
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-5 text-center">
                          <button
                            type="button"
                            title="Eliminar del inventario"
                            aria-label="Eliminar del inventario"
                            disabled={
                              updatingPalletId ===
                              pallet.id
                            }
                            onClick={() =>
                              void archivePallet(
                                pallet,
                              )
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition hover:bg-red-500/20 disabled:opacity-40"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>

                        <td className="px-5 py-5">
                          <p>
                            {reception
                              ? formatDate(
                                  reception.reception_date,
                                )
                              : '—'}
                          </p>

                          {pallet.damaged && (
                            <p className="text-xs font-semibold text-red-400">
                              Material dañado
                            </p>
                          )}
                        </td>
                      </tr>
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
                  {getReception(
                    billingModalPallet,
                  )?.reception_number ||
                    'Recepción'}
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