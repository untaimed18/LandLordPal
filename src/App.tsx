import { Routes, Route } from 'react-router-dom'
import { ToastProvider } from './context/ToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import PropertyDetail from './pages/PropertyDetail'
import RentIncome from './pages/RentIncome'
import Expenses from './pages/Expenses'
import Maintenance from './pages/Maintenance'
import Reports from './pages/Reports'
import Vendors from './pages/Vendors'
import Settings from './pages/Settings'
import Calendar from './pages/Calendar'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <ErrorBoundary>
    <ToastProvider>
      <ConfirmProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/properties" element={<Properties />} />
            <Route path="/properties/:id" element={<PropertyDetail />} />
            <Route path="/rent" element={<RentIncome />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </ConfirmProvider>
    </ToastProvider>
    </ErrorBoundary>
  )
}
