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

import {
  ReceivingPage,
} from './features/receiving/ReceivingPage'

import {
  NewReceivingPage,
} from './features/receiving/NewReceivingPage'

import {
  QuickReceivingPage,
} from './features/receiving/QuickReceivingPage'

import {
  ReceptionDetailPage,
} from './features/receiving/ReceptionDetailPage'

import {
  InventoryPage,
} from './features/inventory/InventoryPage'

import {
  BillingPage,
} from './features/billing/BillingPage'

import {
  LocationsPage,
} from './features/locations/LocationsPage'

import {
  ShipmentsPage,
} from './features/shipments/ShipmentsPage'

import {
  DiscrepanciesPage,
} from './features/discrepancies/DiscrepanciesPage'

import {
  ReportsPage,
} from './features/reports/ReportsPage'

import {
  SettingsPage,
} from './features/settings/SettingsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={<AppLayout />}
        >
          <Route
            path="/"
            element={
              <Navigate
                to="/operations/receiving"
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
                  to="receiving"
                  replace
                />
              }
            />

            <Route
              path="receiving"
              element={<ReceivingPage />}
            />

            <Route
              path="inventory"
              element={<InventoryPage />}
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

          {/* Recepción completa */}
          <Route
            path="/operations/receiving/new"
            element={<NewReceivingPage />}
          />

          {/* Recepción rápida: debe estar antes de /:id */}
          <Route
            path="/operations/receiving/quick"
            element={<QuickReceivingPage />}
          />

          {/* Detalle de recepción: siempre después de /new y /quick */}
          <Route
            path="/operations/receiving/:id"
            element={<ReceptionDetailPage />}
          />

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
                to="/operations/receiving"
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
                to="/operations/inventory"
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
    </BrowserRouter>
  )
}

function LegacyReceptionRedirect() {
  const id =
    window.location.pathname
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