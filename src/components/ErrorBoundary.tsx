import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import logger from '../lib/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('ErrorBoundary caught:', error, info.componentStack)
  }

  handleRecover = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <AlertTriangle size={40} className="error-boundary-icon" />
            <h2>Something went wrong</h2>
            <p className="error-boundary-message">
              An unexpected error occurred. Your data is safe — it&apos;s stored securely on this device.
            </p>
            {this.state.error && (
              <details className="error-boundary-details">
                <summary>Error details</summary>
                <pre>{this.state.error.message}</pre>
              </details>
            )}
            <div className="error-boundary-actions">
              <button type="button" className="btn primary" onClick={this.handleRecover}>
                Try again
              </button>
              <button type="button" className="btn" onClick={this.handleReload}>
                Reload app
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
