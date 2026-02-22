import { useState } from 'react'
import { addActivityLog, deleteTenant, updateTenant, takeSnapshot, restoreSnapshot } from '../../store'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { nowISO } from '../../lib/id'
import { formatMoney } from '../../lib/format'
import type { Tenant } from '../../types'

interface Props {
  tenant: Tenant
  onClose: () => void
}

export default function MoveOutForm({ tenant, onClose }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const [moveOutDate, setMoveOutDate] = useState(nowISO())
  const [moveOutNotes, setMoveOutNotes] = useState('')
  const [depositReturned, setDepositReturned] = useState(tenant.deposit ?? 0)
  const [depositDeductions, setDepositDeductions] = useState('')

  async function handleSubmit() {
    const ok = await confirm({
      title: 'Confirm move-out',
      message: `This will permanently remove "${tenant.name}" and all their payment history from the system. This cannot be undone without a backup.`,
      confirmText: 'Complete move-out',
      danger: true,
    })
    if (!ok) return

    const snapshot = takeSnapshot()
    try {
      await updateTenant(tenant.id, {
        moveOutDate,
        moveOutNotes: moveOutNotes || undefined,
        depositReturned: depositReturned,
        depositDeductions: depositDeductions || undefined,
      })
      await addActivityLog({
        entityType: 'unit',
        entityId: tenant.unitId,
        note: `Tenant "${tenant.name}" moved out. Deposit held: ${formatMoney(tenant.deposit ?? 0)}. Returned: ${formatMoney(depositReturned)}${depositDeductions ? `. Deductions: ${depositDeductions}` : ''}${moveOutNotes ? `. Notes: ${moveOutNotes}` : ''}`,
        date: moveOutDate,
      })
      await deleteTenant(tenant.id)
      onClose()
      toast('Tenant moved out and unit marked available', {
        type: 'success',
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await restoreSnapshot(snapshot)
              toast('Move-out undone')
            } catch { toast('Undo failed', 'error') }
          },
        },
      })
    } catch {
      toast('Failed to complete move-out', 'error')
    }
  }

  return (
    <div className="card form-card" style={{ marginTop: '1rem' }}>
      <h3>Move-out: {tenant.name}</h3>
      <div className="form-grid">
        <label>Move-out date * <input type="date" required value={moveOutDate} onChange={(e) => setMoveOutDate(e.target.value)} /></label>
        <label>Deposit held
          <div className="form-static">
            {formatMoney(tenant.deposit ?? 0)}
            {tenant.depositStatus && (
              <span className={`badge ${tenant.depositStatus === 'paid' ? 'paid' : tenant.depositStatus === 'partial' ? 'partial' : 'overdue'}`} style={{ marginLeft: '0.5rem' }}>
                {tenant.depositStatus === 'paid' ? 'Collected' : tenant.depositStatus === 'partial' ? `${formatMoney(tenant.depositPaidAmount ?? 0)} collected` : 'Not collected'}
              </span>
            )}
          </div>
        </label>
        <label>Amount returned <input type="number" min={0} step={0.01} value={depositReturned || ''} onChange={(e) => setDepositReturned(+e.target.value)} /></label>
        <label>Deductions <input value={depositDeductions} onChange={(e) => setDepositDeductions(e.target.value)} placeholder="e.g. Carpet replacement, wall damage" /></label>
      </div>
      <label style={{ marginTop: '0.75rem' }}>Move-out notes <textarea rows={2} value={moveOutNotes} onChange={(e) => setMoveOutNotes(e.target.value)} placeholder="Condition notes, inspection results..." /></label>
      <div className="form-actions">
        <button type="button" className="btn primary" onClick={handleSubmit}>Complete move-out</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
