import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="page not-found-page">
      <div className="empty-state-card card" style={{ maxWidth: 480, margin: '3rem auto' }}>
        <p className="empty-state-title">Page not found</p>
        <p className="empty-state-text">The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/" className="btn primary">Go to Dashboard</Link>
      </div>
    </div>
  )
}
