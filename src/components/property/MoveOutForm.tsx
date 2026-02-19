import { useState } from 'react'
import { addActivityLog, deleteTenant, takeSnapshot, restoreSnapshot } from '../../store'
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
    addActivityLog({
      entityType: 'unit',
      entityId: tenant.unitId,
      note: `Tenant "${tenant.name}" moved out. Deposit returned: ${formatMoney(depositReturned)}${depositDeductions ? `. Deductions: ${depositDeductions}` : ''}${moveOutNotes ? `. Notes: ${moveOutNotes}` : ''}`,
      date: moveOutDate,
    })
    deleteTenant(tenant.id)
    onClose()
    toast('Tenant moved out and unit marked available', {
      type: 'success',
      action: {
        label: 'Undo',
        onClick: () => {
          restoreSnapshot(snapshot)
          toast('Move-out undone')
        },
      },
    })
  }

  return (
    <div className="card form-card" style={{ marginTop: '1rem' }}>
      <h3>Move-out: {tenant.name}</h3>
      <div className="form-grid">
        <label>Move-out date * <input type="date" required value={moveOutDate} onChange={(e) => setMoveOutDate(e.target.value)} /></label>
        <label>Deposit held <div className="form-static">{formatMoney(tenant.deposit ?? 0)}</div></label>
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
