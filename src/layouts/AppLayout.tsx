import {
  useEffect,
  useState,
} from 'react'

import {
  NavLink,
  Outlet,
} from 'react-router-dom'

import {
  Workflow,
  MapPinned,
  Truck,
  ChartNoAxesCombined,
  Settings,
  Menu,
  X,
  Moon,
  Sun,
} from 'lucide-react'

const navigation = [
  { name: 'Operación', path: '/operations', icon: Workflow },
  { name: 'Embarques', path: '/shipments', icon: Truck },
  { name: 'Ubicaciones', path: '/locations', icon: MapPinned },
  { name: 'Reportes', path: '/reports', icon: ChartNoAxesCombined },
  { name: 'Configuración', path: '/settings', icon: Settings },
]

const THEME_KEY = 'ggg-theme'

export function AppLayout() {
  const [
    mobileMenuOpen,
    setMobileMenuOpen,
  ] = useState(false)

  const [
    darkMode,
    setDarkMode,
  ] = useState(() => {
    return (
      localStorage.getItem(
        THEME_KEY,
      ) === 'dark'
    )
  })

  useEffect(
    () => {
      document.documentElement
        .classList
        .toggle(
          'dark',
          darkMode,
        )

      localStorage.setItem(
        THEME_KEY,
        darkMode
          ? 'dark'
          : 'light',
      )
    },
    [
      darkMode,
    ],
  )

  const toggleTheme =
    () => {
      setDarkMode(
        (
          current,
        ) =>
          !current,
      )
    }

  const renderNavigation =
    (
      closeMobile = false,
    ) => (
      <nav className="p-4">
        <ul className="space-y-1">
          {navigation.map(
            (
              item,
            ) => {
              const Icon =
                item.icon

              return (
                <li
                  key={
                    item.path
                  }
                >
                  <NavLink
                    to={
                      item.path
                    }
                    end={
                      false
                    }
                    onClick={
                      closeMobile
                        ? () =>
                            setMobileMenuOpen(
                              false,
                            )
                        : undefined
                    }
                    className={({
                      isActive,
                    }) =>
                      [
                        'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition',

                        isActive
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                      ].join(
                        ' ',
                      )
                    }
                  >
                    <Icon
                      size={
                        19
                      }
                    />

                    {
                      item.name
                    }
                  </NavLink>
                </li>
              )
            },
          )}
        </ul>
      </nav>
    )

  const themeToggle =
    (
      <button
        type="button"
        onClick={
          toggleTheme
        }
        className="ggg-theme-toggle"
        aria-label={
          darkMode
            ? 'Cambiar a modo claro'
            : 'Cambiar a modo oscuro'
        }
      >
        <span className="ggg-theme-toggle-label">
          {darkMode ? (
            <Sun
              size={
                18
              }
            />
          ) : (
            <Moon
              size={
                18
              }
            />
          )}

          <span>
            {darkMode
              ? 'Modo claro'
              : 'Modo oscuro'}
          </span>
        </span>

        <span
          className={[
            'ggg-theme-switch',

            darkMode
              ? 'is-active'
              : '',
          ].join(
            ' ',
          )}
        >
          <span className="ggg-theme-switch-knob" />
        </span>
      </button>
    )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-800 bg-slate-900 lg:flex">
        <div className="flex h-32 items-center justify-center border-b border-slate-800 px-5 py-4">
          <NavLink
            to="/operations/receiving"
            aria-label="Ir al menú principal"
            className="flex h-full w-full items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <img
              src="/ggg-logo.png"
              alt="GGG"
              className="max-h-24 w-auto max-w-full object-contain"
            />
          </NavLink>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            {
              renderNavigation()
            }
          </div>

          <div className="ggg-theme-toggle-wrapper">
            {
              themeToggle
            }
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur lg:hidden">
        <NavLink
          to="/operations/receiving"
          aria-label="Ir al menú principal"
          className="rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <img
            src="/ggg-logo.png"
            alt="GGG"
            className="h-14 w-auto object-contain"
          />
        </NavLink>

        <button
          type="button"
          onClick={() =>
            setMobileMenuOpen(
              true,
            )
          }
          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-300"
          aria-label="Abrir menú"
        >
          <Menu
            size={
              22
            }
          />
        </button>
      </header>

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() =>
            setMobileMenuOpen(
              false,
            )
          }
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-hidden border-r border-slate-800 bg-slate-900 transition-transform duration-300 lg:hidden',

          mobileMenuOpen
            ? 'translate-x-0'
            : '-translate-x-full',
        ].join(
          ' ',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <NavLink
            to="/operations/receiving"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Ir al menú principal"
            className="rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <img
              src="/ggg-logo.png"
              alt="GGG"
              className="h-20 w-auto object-contain"
            />
          </NavLink>

          <button
            type="button"
            onClick={() =>
              setMobileMenuOpen(
                false,
              )
            }
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Cerrar menú"
          >
            <X
              size={
                22
              }
            />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            {
              renderNavigation(
                true,
              )
            }
          </div>

          <div className="ggg-theme-toggle-wrapper">
            {
              themeToggle
            }
          </div>
        </div>
      </aside>

      <main className="min-h-screen overflow-x-hidden px-4 py-5 sm:px-6 lg:ml-64 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}