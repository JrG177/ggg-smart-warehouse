import {
  ArrowDownToLine,
  Boxes,
  CircleAlert,
  Clock3,
  PackageCheck,
  Truck,
} from 'lucide-react'

const stats = [
  {
    title: 'Recibidos hoy',
    value: 34,
    subtitle: 'Pallets y contenedores',
    icon: ArrowDownToLine,
  },
  {
    title: 'Listos para cargar',
    value: 18,
    subtitle: 'Material verificado',
    icon: PackageCheck,
  },
  {
    title: 'Pendientes de facturación',
    value: 7,
    subtitle: 'Requieren revisión',
    icon: Clock3,
  },
  {
    title: 'OCND / Discrepancias',
    value: 3,
    subtitle: 'Requieren atención',
    icon: CircleAlert,
  },
]

const shipments = [
  {
    id: 'INV-23891',
    client: 'Caterpillar',
    loaded: 4,
    total: 5,
    status: 'Falta 1 pallet',
  },
  {
    id: 'INV-23892',
    client: 'Caterpillar',
    loaded: 6,
    total: 6,
    status: 'Completo',
  },
  {
    id: 'INV-23893',
    client: 'Danhill',
    loaded: 2,
    total: 4,
    status: 'En proceso',
  },
]

const recentActivity = [
  {
    action: 'Pallet recibido',
    detail: 'PLT-000185 · Caterpillar',
    user: 'Roberto',
    time: 'Hace 8 min',
  },
  {
    action: 'Ubicación actualizada',
    detail: 'PLT-000178 → A-01-04',
    user: 'Javier',
    time: 'Hace 17 min',
  },
  {
    action: 'Discrepancia registrada',
    detail: 'PLT-000167 · Material dañado',
    user: 'Víctor',
    time: 'Hace 31 min',
  },
]

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-slate-400">
          Martes, 15 de julio
        </p>

        <div className="mt-2 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">
              Buenos días, Gerardo
            </h1>

            <p className="mt-2 text-slate-400">
              Este es el resumen de la operación actual de GGG Forwarding.
            </p>
          </div>

          <div className="hidden rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-right md:block">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Estado de operación
            </p>

            <p className="mt-1 font-semibold text-emerald-400">
              Operación activa
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon

          return (
            <article
              key={stat.title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-400">
                    {stat.title}
                  </p>

                  <p className="mt-3 text-3xl font-bold text-white">
                    {stat.value}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {stat.subtitle}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-800 p-3 text-emerald-400">
                  <Icon size={22} />
                </div>
              </div>
            </article>
          )
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <article className="rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Embarques del día
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Verificación de cargas activas
              </p>
            </div>

            <Truck className="text-slate-500" size={22} />
          </div>

          <div className="divide-y divide-slate-800">
            {shipments.map((shipment) => {
              const complete = shipment.loaded === shipment.total

              return (
                <div
                  key={shipment.id}
                  className="flex items-center justify-between gap-4 px-6 py-5"
                >
                  <div>
                    <p className="font-semibold text-white">
                      {shipment.id}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {shipment.client}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-slate-300">
                      {shipment.loaded} de {shipment.total} pallets
                    </p>

                    <p
                      className={[
                        'mt-1 text-xs font-semibold',
                        complete
                          ? 'text-emerald-400'
                          : 'text-amber-400',
                      ].join(' ')}
                    >
                      {shipment.status}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-6 py-5">
            <div className="flex items-center gap-3">
              <Boxes className="text-slate-500" size={22} />

              <div>
                <h2 className="text-lg font-semibold text-white">
                  Resumen de inventario
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Estado actual del almacén
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">
                Total en almacén
              </span>

              <span className="font-semibold text-white">
                189
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">
                Caterpillar
              </span>

              <span className="font-semibold text-white">
                148
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">
                Danhill
              </span>

              <span className="font-semibold text-white">
                41
              </span>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  Material detenido
                </span>

                <span className="font-semibold text-amber-400">
                  5
                </span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-6 py-5">
          <h2 className="text-lg font-semibold text-white">
            Actividad reciente
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Últimos movimientos registrados
          </p>
        </div>

        <div className="divide-y divide-slate-800">
          {recentActivity.map((item) => (
            <div
              key={`${item.action}-${item.time}`}
              className="grid gap-2 px-6 py-5 md:grid-cols-[1.2fr_1fr_auto]"
            >
              <div>
                <p className="font-medium text-white">
                  {item.action}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {item.detail}
                </p>
              </div>

              <div className="text-sm text-slate-400">
                {item.user}
              </div>

              <div className="text-sm text-slate-500">
                {item.time}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}