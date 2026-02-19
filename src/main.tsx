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
  root.render(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted, #888)' }}>
      Loading...
    </div>,
  )

  initStore()
    .then(() => {
      root.render(
        <StrictMode>
          <HashRouter>
            <App />
          </HashRouter>
        </StrictMode>,
      )
    })
    .catch((err) => {
      logger.error('Failed to initialize store', err)
      root.render(
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #888)' }}>
          <div>
            <p style={{ marginBottom: '0.5rem' }}>Failed to load data.</p>
            <p style={{ fontSize: '0.9rem' }}>Try restarting the app. If the problem continues, check the console for details.</p>
          </div>
        </div>,
      )
    })
}
