import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { initStore } from './store'
import logger from './lib/logger'
import './index.css'

const savedTheme = localStorage.getItem('landlordpal-theme') || 'light'
document.documentElement.setAttribute('data-theme', savedTheme)

const root = createRoot(document.getElementById('root')!)

function renderApp() {
  root.render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  )
}

function renderLoading() {
  root.render(
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem', color: 'var(--text-muted, #888)' }}>
      <div className="loading-spinner" />
      <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>Loading your data…</p>
    </div>,
  )
}

function renderError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  root.render(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #888)' }}>
      <div>
        <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Failed to load data</p>
        <p style={{ fontSize: '0.9rem', marginBottom: '1rem', maxWidth: '400px' }}>{message}</p>
        <button
          type="button"
          onClick={bootstrap}
          style={{
            padding: '0.5rem 1.25rem',
            fontSize: '0.9rem',
            fontWeight: 500,
            border: 'none',
            borderRadius: '6px',
            background: 'var(--primary, #2563eb)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    </div>,
  )
}

async function checkEncryptionKeyWarning() {
  try {
    const err = await window.electronAPI?.getEncryptionKeyError()
    if (err) {
      logger.warn('Encryption key error detected:', err)
      window.dispatchEvent(
        new CustomEvent('landlordpal:encryption-warning', { detail: { message: err } })
      )
    }
  } catch {
    // non-critical — swallow
  }
}

function bootstrap() {
  renderLoading()
  initStore()
    .then(() => {
      renderApp()
      checkEncryptionKeyWarning()
    })
    .catch((err) => {
      logger.error('Failed to initialize store', err)
      renderError(err)
    })
}

if (!window.electronAPI) {
  root.render(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #888)' }}>
      <div>
        <p style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Desktop app required</p>
        <p style={{ fontSize: '0.9rem' }}>LandLord Pal is a desktop application and cannot run in a web browser. Please open it using the installed app.</p>
      </div>
    </div>,
  )
} else {
  bootstrap()
}
