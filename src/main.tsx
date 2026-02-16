import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { initStore } from './store'
import './index.css'

// Initialize theme from localStorage before render to avoid flash
const savedTheme = localStorage.getItem('landlordpal-theme') || 'light'
document.documentElement.setAttribute('data-theme', savedTheme)

const root = createRoot(document.getElementById('root')!)

// Show a minimal loading state while the store initializes (SQLite load via IPC)
root.render(
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted, #888)' }}>
    Loading...
  </div>,
)

// Initialize the store, then render the app
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
    console.error('Failed to initialize store', err)
    root.render(
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #888)' }}>
        <div>
          <p style={{ marginBottom: '0.5rem' }}>Failed to load data.</p>
          <p style={{ fontSize: '0.9rem' }}>Try refreshing the app. If the problem continues, check the console for details.</p>
        </div>
      </div>,
    )
  })
