import {
  NavLink,
  Outlet,
} from 'react-router-dom'

import {
  Boxes,
  PackagePlus,
  ReceiptText,
  ShieldAlert,
  Workflow,
} from 'lucide-react'

const operationTabs = [
  {
    name: 'Recepción',
    path: '/operations/receiving',
    icon: PackagePlus,
  },
  {
    name: 'Inventario',
    path: '/operations/inventory',
    icon: Boxes,
  },
  {
    name: 'Factura',
    path: '/operations/billing',
    icon: ReceiptText,
  },
  {
    name: 'OS&D',
    path: '/operations/osd',
    icon: ShieldAlert,
  },
]

export function OperationsLayout() {
  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Workflow size={24} />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-white">
              Operación
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Recepción, inventario, facturación y OS&amp;D en un solo lugar.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <div className="grid min-w-[620px] grid-cols-4">
          {operationTabs.map(
            (tab) => {
              const Icon =
                tab.icon

              return (
                <NavLink
                  key={
                    tab.path
                  }
                  to={
                    tab.path
                  }
                  className={({
                    isActive,
                  }) =>
                    [
                      'flex items-center justify-center gap-2 border-b-2 px-4 py-4 text-sm font-semibold transition',

                      isActive
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white',
                    ].join(
                      ' ',
                    )
                  }
                >
                  <Icon
                    size={
                      18
                    }
                  />

                  {
                    tab.name
                  }
                </NavLink>
              )
            },
          )}
        </div>
      </section>

      <Outlet />
    </div>
  )
}