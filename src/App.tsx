import { lazy, Suspense } from 'react'
const InvoiceUxTrialPage = import.meta.env.DEV
  ? lazy(() => import('./features/trials/InvoiceUxTrialPage').then(module => ({ default: module.InvoiceUxTrialPage })))
  : () => null
const A1Page = lazy(() => import('./features/a1/A1Page').then(module => ({ default: module.A1Page })))
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import {
  AppLayout,
} from './layouts/AppLayout'

import {
  OperationsLayout,
} from './layouts/OperationsLayout'

const NewReceivingPage = lazy(() => import('./features/receiving/NewReceivingPage').then(module => ({ default: module.NewReceivingPage })))

const ReceptionDetailPage = lazy(() => import('./features/receiving/ReceptionDetailPage').then(module => ({ default: module.ReceptionDetailPage })))

const QuickReceivingPage = lazy(() => import('./features/receiving/QuickReceivingPage').then(module => ({ default: module.QuickReceivingPage })))

const QuickReceivingHistoryPage = lazy(() => import('./features/receiving/QuickReceivingHistoryPage').then(module => ({ default: module.QuickReceivingHistoryPage })))

const MaterialPage = lazy(() => import('./features/material/MaterialPage').then(module => ({ default: module.MaterialPage })))

const BillingPage = lazy(() => import('./features/billing/BillingPage').then(module => ({ default: module.BillingPage })))

const LocationsPage = lazy(() => import('./features/locations/LocationsPage').then(module => ({ default: module.LocationsPage })))

const ShipmentsPage = lazy(() => import('./features/shipments/ShipmentsPage').then(module => ({ default: module.ShipmentsPage })))

const DiscrepanciesPage = lazy(() => import('./features/discrepancies/DiscrepanciesPage').then(module => ({ default: module.DiscrepanciesPage })))

const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then(module => ({ default: module.ReportsPage })))

const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then(module => ({ default: module.SettingsPage })))

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={
        <div role="status" aria-live="polite" className="mx-auto my-8 max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 text-center">
          <p className="font-semibold">Cargando módulo…</p>
          <p className="mt-2 text-sm text-slate-400">Preparando tu espacio de trabajo.</p>
        </div>
      }>
      <Routes>
        <Route
          element={<AppLayout />}
        >
          <Route
            path="/"
            element={
              <Navigate
                to="/operations/material"
                replace
              />
            }
          />

          <Route
            path="/operations"
            element={<OperationsLayout />}
          >
            <Route
              index
              element={
                <Navigate
                  to="material"
                  replace
                />
              }
            />

            <Route
              path="material"
              element={<MaterialPage />}
            />

            <Route
              path="receiving"
              element={
                <Navigate
                  to="/operations/material?view=receiving"
                  replace
                />
              }
            />

            <Route
              path="inventory"
              element={
                <Navigate
                  to="/operations/material?view=inventory"
                  replace
                />
              }
            />

            <Route
              path="billing"
              element={<BillingPage />}
            />

            <Route
              path="osd"
              element={<DiscrepanciesPage />}
            />
          </Route>

          <Route
            path="/operations/receiving/new"
            element={<NewReceivingPage />}
          />

          <Route
            path="/operations/receiving/quick"
            element={<QuickReceivingPage />}
          />

          <Route
            path="/operations/receiving/quick/history"
            element={<QuickReceivingHistoryPage />}
          />

          <Route
            path="/operations/receiving/:id"
            element={<ReceptionDetailPage />}
          />

          <Route path="/a1" element={<A1Page />} />
          {import.meta.env.DEV && <Route path="/pruebas/factura" element={<InvoiceUxTrialPage />} />}

          <Route
            path="/shipments"
            element={<ShipmentsPage />}
          />

          <Route
            path="/locations"
            element={<LocationsPage />}
          />

          <Route
            path="/reports"
            element={<ReportsPage />}
          />

          <Route
            path="/settings"
            element={<SettingsPage />}
          />

          <Route
            path="/discrepancies"
            element={<DiscrepanciesPage />}
          />

          {/* Rutas antiguas */}
          <Route
            path="/receiving"
            element={
              <Navigate
                to="/operations/material?view=receiving"
                replace
              />
            }
          />

          <Route
            path="/receiving/new"
            element={
              <Navigate
                to="/operations/receiving/new"
                replace
              />
            }
          />

          <Route
            path="/receiving/quick"
            element={
              <Navigate
                to="/operations/receiving/quick"
                replace
              />
            }
          />

          <Route
            path="/receiving/:id"
            element={<LegacyReceptionRedirect />}
          />

          <Route
            path="/inventory"
            element={
              <Navigate
                to="/operations/material?view=inventory"
                replace
              />
            }
          />

          <Route
            path="/billing"
            element={
              <Navigate
                to="/operations/billing"
                replace
              />
            }
          />

          <Route
            path="/osd"
            element={
              <Navigate
                to="/operations/osd"
                replace
              />
            }
          />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

function LegacyReceptionRedirect() {
  const id = window.location.pathname
    .split('/')
    .filter(Boolean)[1]

  return (
    <Navigate
      to={`/operations/receiving/${id}`}
      replace
    />
  )
}

export default App
