import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (
  'serviceWorker' in navigator &&
  import.meta.env.PROD
) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', {
        updateViaCache: 'none',
      })
      .then((registration) =>
        registration.update(),
      )
      .catch((error) => {
        console.error(
          'No se pudo registrar la aplicación GGG Inventory.',
          error,
        )
      })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
