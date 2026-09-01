import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import {
  ImagePlus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import type {
  AvailableInvoiceReception,
  InvoicePhoto,
} from '../../../services/invoiceService'

type InvoiceSummary = {
  receptionCount: number
  totalPallets: number
  totalQuantity: number
  totalPackages: number
  partNumberCount: number
}

type EditInvoiceModalProps = {
  invoice: {
    id: string
    invoiceNumber: string
  }
  invoiceNumber: string
  carrier: string
  packageCount: string
  availableReceptions: AvailableInvoiceReception[]
  selectedReceptionIds: string[]
  receptionSearch: string
  summary: InvoiceSummary
  existingPhotos: InvoicePhoto[]
  newPhotos: File[]
  loadingReceptions: boolean
  loadingPhotos: boolean
  saving: boolean
  deletingPhotoId: string | null
  onInvoiceNumberChange: (value: string) => void
  onCarrierChange: (value: string) => void
  onPackageCountChange: (value: string) => void
  onReceptionSearchChange: (value: string) => void
  onToggleReception: (receptionId: string) => void
  onSelectAllVisible: () => void
  onClearVisible: () => void
  onAddPhotos: (files: File[]) => void
  onRemoveNewPhoto: (index: number) => void
  onDeleteExistingPhoto: (photoId: string) => void
  onClose: () => void
  onSave: () => void
}

const carriers = [
  'XPO',
  'CENTRAL',
  'MTY',
  'IZI',
  'OTHER',
]

export function EditInvoiceModal({
  invoice,
  invoiceNumber,
  carrier,
  packageCount,
  availableReceptions,
  selectedReceptionIds,
  receptionSearch,
  summary,
  existingPhotos,
  newPhotos,
  loadingReceptions,
  loadingPhotos,
  saving,
  deletingPhotoId,
  onInvoiceNumberChange,
  onCarrierChange,
  onPackageCountChange,
  onReceptionSearchChange,
  onToggleReception,
  onSelectAllVisible,
  onClearVisible,
  onAddPhotos,
  onRemoveNewPhoto,
  onDeleteExistingPhoto,
  onClose,
  onSave,
}: EditInvoiceModalProps) {
  const storedPackages = Number(packageCount || 0)
  const packageMismatch =
    Number.isFinite(storedPackages) &&
    storedPackages !== summary.totalPackages

  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow

    document.body.style.overflow =
      'hidden'

    return () => {
      document.body.style.overflow =
        previousOverflow
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 text-slate-900 backdrop-blur-sm dark:text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Editar factura ${invoice.invoiceNumber}`}
      onClick={() => {
        if (!saving && !deletingPhotoId) {
          onClose()
        }
      }}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Editar factura completa</p>
            <h2 className="mt-1 text-xl font-bold">{invoice.invoiceNumber}</h2>
          </div>
          <button
            type="button"
            disabled={saving || Boolean(deletingPhotoId)}
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-200 dark:bg-slate-800 disabled:opacity-40"
            aria-label="Cerrar editor"
          >
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 p-5">
                <h3 className="text-lg font-bold">Información general</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <label htmlFor="edit-full-invoice-number" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Número de factura</label>
                    <input id="edit-full-invoice-number" value={invoiceNumber} onChange={(event) => onInvoiceNumberChange(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-4 py-3 outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label htmlFor="edit-full-carrier" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Carrier</label>
                    <select id="edit-full-carrier" value={carrier} disabled={loadingReceptions} onChange={(event) => onCarrierChange(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-4 py-3 outline-none focus:border-emerald-500 disabled:opacity-50">
                      {carriers.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-full-package-count" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Número de bultos</label>
                    <input id="edit-full-package-count" type="number" min="0" step="1" inputMode="numeric" value={packageCount} onChange={(event) => onPackageCountChange(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-4 py-3 outline-none focus:border-emerald-500" />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h3 className="text-lg font-bold">Recepciones</h3>
                    <p className="mt-1 text-sm text-slate-500">Agrega o quita recepciones antes de guardar.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onSelectAllVisible} className="rounded-xl border border-emerald-500/40 px-3 py-2 text-xs font-bold text-emerald-400">Seleccionar visibles</button>
                    <button type="button" onClick={onClearVisible} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300">Limpiar visibles</button>
                  </div>
                </div>
                <div className="relative mt-4">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={receptionSearch} onChange={(event) => onReceptionSearchChange(event.target.value)} placeholder="Buscar por recepción, trailer, carrier o número de parte..." className="w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 py-3 pl-10 pr-4 outline-none focus:border-emerald-500" />
                </div>

                {loadingReceptions ? (
                  <div className="py-12 text-center text-slate-500">Cargando recepciones...</div>
                ) : availableReceptions.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-700 py-12 text-center text-slate-500">No hay recepciones disponibles con estos filtros.</div>
                ) : (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {availableReceptions.map((reception) => {
                      const selected = selectedReceptionIds.includes(reception.id)
                      return (
                        <button key={reception.id} type="button" onClick={() => onToggleReception(reception.id)} className={['rounded-2xl border p-4 text-left transition', selected ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-slate-400 dark:border-slate-600'].join(' ')}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-bold">{reception.reception_number || 'Sin folio'}</p>
                                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-400">{reception.already_in_current_invoice ? 'Actual' : 'Disponible'}</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{reception.other_carrier || reception.carrier}{' · '}{reception.trailer || 'Sin trailer'}</p>
                            </div>
                            <input type="checkbox" checked={selected} readOnly className="h-5 w-5 accent-emerald-500" />
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                            <SummaryValue label="Fecha" value={reception.reception_date} />
                            <SummaryValue label="Pallets" value={String(reception.pallet_count)} />
                            <SummaryValue label="Piezas" value={String(reception.total_quantity)} />
                            <SummaryValue label="Bultos" value={String(reception.total_packages)} />
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {reception.part_numbers.slice(0,6).map((partNumber) => <span key={partNumber} className="rounded-lg bg-slate-200 dark:bg-slate-800 px-2 py-1 text-xs">{partNumber}</span>)}
                            {reception.part_numbers.length > 6 && <span className="rounded-lg bg-slate-200 dark:bg-slate-800 px-2 py-1 text-xs text-slate-500 dark:text-slate-400">+{reception.part_numbers.length - 6}</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 p-5">
                <h3 className="text-lg font-bold">Fotografías</h3>
                {loadingPhotos ? (
                  <div className="py-8 text-center text-slate-500">Cargando fotografías...</div>
                ) : (
                  <>
                    <div className="mt-4 space-y-2">
                      {existingPhotos.map((photo, index) => (
                        <div key={photo.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">Foto guardada {index + 1}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{photo.photo_path}</p>
                          </div>
                          <button type="button" disabled={Boolean(deletingPhotoId) || existingPhotos.length + newPhotos.length <= 1} onClick={() => onDeleteExistingPhoto(photo.id)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 disabled:opacity-30" aria-label="Eliminar fotografía guardada"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                    <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 p-5 text-slate-700 dark:text-slate-300 hover:border-emerald-500">
                      <ImagePlus size={20} />Agregar fotografías
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length > 0) onAddPhotos(files); event.target.value = '' }} />
                    </label>
                    {newPhotos.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {newPhotos.map((photo,index) => (
                          <div key={`${photo.name}-${photo.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                            <div className="min-w-0"><p className="truncate text-sm font-semibold">{photo.name}</p><p className="mt-1 text-xs text-emerald-400">Nueva fotografía</p></div>
                            <button type="button" onClick={() => onRemoveNewPhoto(index)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400"><Trash2 size={16} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
              <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                <h3 className="font-bold text-emerald-400">Resumen</h3>
                <div className="mt-4 space-y-3">
                  <SummaryValue label="Recepciones" value={String(summary.receptionCount)} />
                  <SummaryValue label="Pallets" value={String(summary.totalPallets)} />
                  <SummaryValue label="Piezas" value={String(summary.totalQuantity)} />
                  <SummaryValue label="Bultos registrados" value={String(summary.totalPackages)} />
                  <SummaryValue label="Números de parte" value={String(summary.partNumberCount)} />
                </div>
              </section>
              {packageMismatch && <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">La factura captura {storedPackages} bultos, pero las recepciones seleccionadas suman {summary.totalPackages}. Verifica antes de guardar.</section>}
              <section className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 p-4 text-sm text-slate-500 dark:text-slate-400">Las recepciones quitadas volverán a estar disponibles para otra factura. Las nuevas quedarán marcadas como “En facturación”.</section>
            </aside>
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700 sm:flex-row sm:justify-end">
          <button type="button" disabled={saving || Boolean(deletingPhotoId)} onClick={onClose} className="rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40">Cancelar</button>
          <button type="button" disabled={saving || loadingReceptions || loadingPhotos || selectedReceptionIds.length === 0 || existingPhotos.length + newPhotos.length === 0} onClick={onSave} className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Guardando cambios...' : 'Guardar cambios'}</button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>
}