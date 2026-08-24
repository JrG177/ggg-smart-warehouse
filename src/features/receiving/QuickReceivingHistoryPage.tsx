import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FileImage,
  LoaderCircle,
  RefreshCcw,
  Search,
} from 'lucide-react'
import {
  getQuickReceptionHistory,
  type QuickPhotoType,
  type QuickReceptionClient,
  type QuickReceptionHistoryItem,
} from '../../services/quickReceivingService'

const photoLabels: Record<QuickPhotoType, string> = {
  invoice: 'Factura',
  boxes: 'Cajas',
  labels: 'Labels',
  part_number_label: 'Etiqueta Número de Parte',
  pallet: 'Tarima',
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function QuickReceivingHistoryPage() {
  const navigate = useNavigate()
  const [receptions, setReceptions] =
    useState<QuickReceptionHistoryItem[]>([])
  const [client, setClient] =
    useState<'ALL' | QuickReceptionClient>('ALL')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadHistory() {
    setLoading(true)
    setError('')

    try {
      setReceptions(await getQuickReceptionHistory())
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'No se pudo cargar el historial.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadHistory()
  }, [])

  const filteredReceptions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return receptions.filter((reception) => {
      const matchesClient = client === 'ALL' || reception.client === client
      const matchesSearch =
        !normalizedSearch ||
        reception.reference_number.toLowerCase().includes(normalizedSearch) ||
        reception.observations?.toLowerCase().includes(normalizedSearch)

      return matchesClient && Boolean(matchesSearch)
    })
  }, [client, receptions, search])

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/operations/receiving')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:bg-slate-800"
            aria-label="Volver a recepciones"
          >
            <ArrowLeft size={22} />
          </button>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Recepciones rápidas
            </p>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              Historial
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadHistory()}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-60"
        >
          <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </header>

      <section className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-[1fr_180px]">
        <label className="relative">
          <Search className="absolute left-3 top-3.5 text-slate-500" size={19} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar referencia u observación"
            className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500"
          />
        </label>

        <select
          value={client}
          onChange={(event) =>
            setClient(event.target.value as 'ALL' | QuickReceptionClient)
          }
          className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-4 font-semibold text-white outline-none focus:border-emerald-500"
        >
          <option value="ALL">Todos</option>
          <option value="UPS">UPS</option>
          <option value="A1">A1</option>
        </select>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-52 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-slate-400">
          <LoaderCircle className="mr-2 animate-spin" size={22} />
          Cargando recepciones…
        </div>
      ) : filteredReceptions.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">
          No se encontraron recepciones rápidas.
        </div>
      ) : (
        <section className="space-y-3">
          {filteredReceptions.map((reception) => {
            const expanded = expandedId === reception.id

            return (
              <article
                key={reception.id}
                className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : reception.id)}
                  className="grid w-full gap-3 p-4 text-left sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-white">
                        {reception.reference_number}
                      </span>
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
                        {reception.client}
                      </span>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-400">
                      <CalendarDays size={16} />
                      {formatDateTime(reception.created_at)}
                    </p>
                  </div>

                  <span className="text-sm font-semibold text-slate-400">
                    {reception.photos.length} fotos
                  </span>

                  {expanded ? (
                    <ChevronUp className="text-slate-400" size={20} />
                  ) : (
                    <ChevronDown className="text-slate-400" size={20} />
                  )}
                </button>

                {expanded && (
                  <div className="border-t border-slate-800 p-4 sm:p-5">
                    {reception.observations && (
                      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Observaciones
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">
                          {reception.observations}
                        </p>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {reception.photos.map((photo) => (
                        <a
                          key={photo.id}
                          href={photo.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-950 transition hover:border-emerald-500/50"
                        >
                          <img
                            src={photo.signed_url}
                            alt={photoLabels[photo.photo_type]}
                            loading="lazy"
                            className="aspect-[4/3] w-full object-cover"
                          />
                          <div className="flex items-center gap-2 px-3 py-3 text-sm font-semibold text-slate-300 group-hover:text-emerald-400">
                            <FileImage size={17} />
                            {photoLabels[photo.photo_type]}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </section>
      )}
    </div>
  )
}
