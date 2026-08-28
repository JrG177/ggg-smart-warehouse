import {
  Boxes,
  History,
  PackagePlus,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { InventoryPage } from '../inventory/InventoryPage'
import { QuickReceivingHistoryPage } from '../receiving/QuickReceivingHistoryPage'
import { ReceivingPage } from '../receiving/ReceivingPage'

type MaterialView =
  | 'receiving'
  | 'inventory'
  | 'history'

const materialTabs: Array<{
  view: MaterialView
  label: string
  helper: string
  icon: typeof PackagePlus
}> = [
  {
    view: 'receiving',
    label: 'Recibir',
    helper: 'Entradas normales y rápidas',
    icon: PackagePlus,
  },
  {
    view: 'inventory',
    label: 'En almacén',
    helper: 'Agrupado por día y carrier',
    icon: Boxes,
  },
  {
    view: 'history',
    label: 'Historial rápido',
    helper: 'Detalles, paquetes y fotografías',
    icon: History,
  },
]

function getMaterialView(value: string | null): MaterialView {
  if (value === 'inventory' || value === 'history') {
    return value
  }

  return 'receiving'
}

export function MaterialPage() {
  const [searchParams, setSearchParams] =
    useSearchParams()

  const currentView =
    getMaterialView(
      searchParams.get('view'),
    )

  const selectView =
    (view: MaterialView) => {
      const nextParams =
        new URLSearchParams(
          searchParams,
        )

      nextParams.set(
        'view',
        view,
      )

      setSearchParams(
        nextParams,
        {
          replace: true,
        },
      )
    }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-400">
          Control de material
        </p>

        <h1 className="mt-2 text-3xl font-bold text-white">
          Material
        </h1>

        <p className="mt-2 max-w-3xl text-slate-400">
          Recibe, consulta y administra todo el material desde un solo lugar.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {materialTabs.map((tab) => {
          const Icon = tab.icon
          const active =
            currentView ===
            tab.view

          return (
            <button
              key={tab.view}
              type="button"
              onClick={() =>
                selectView(
                  tab.view,
                )
              }
              className={[
                'flex min-h-20 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition',
                active
                  ? 'border-emerald-500 bg-emerald-500/10 text-white'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:bg-slate-800',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                  active
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-950 text-slate-400',
                ].join(' ')}
              >
                <Icon size={21} />
              </span>

              <span className="min-w-0">
                <span className="block font-bold">
                  {tab.label}
                </span>

                <span className="mt-1 block text-xs text-slate-500">
                  {tab.helper}
                </span>
              </span>
            </button>
          )
        })}
      </section>

      {currentView === 'receiving' && (
        <ReceivingPage embedded />
      )}

      {currentView === 'inventory' && (
        <InventoryPage embedded />
      )}

      {currentView === 'history' && (
        <QuickReceivingHistoryPage embedded />
      )}
    </div>
  )
}
