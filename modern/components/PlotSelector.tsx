import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Check, LockKeyhole, MapPinned, X } from 'lucide-react'
import { useState } from 'react'
import { PLOT_MATRIX } from '../../src/full-layout.js'

type Props = {
  unlocked: number[]
  disabled: number[]
  used?: number[]
  onApply: (disabled: number[]) => void
}

export default function PlotSelector({ unlocked, disabled, used = [], onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<number[]>(disabled)
  const unlockedSet = new Set(unlocked)
  const usedSet = new Set(used)
  const draftDisabled = new Set(draft)
  const enabledCount = unlocked.filter((plot) => !draftDisabled.has(plot)).length

  const openDialog = (next: boolean) => {
    if (next) setDraft([...disabled])
    setOpen(next)
  }

  const toggle = (plot: number) => {
    setDraft((current) => {
      const next = new Set(current)
      if (next.has(plot)) next.delete(plot)
      else next.add(plot)
      return [...next].sort((a, b) => a - b)
    })
  }

  const apply = () => {
    onApply(draft)
    setOpen(false)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={openDialog}>
      <DialogPrimitive.Trigger className="plot-management-trigger">
        <img src="./assets/plot_management.webp" alt="" />
        <span>
          <small>Homeland plots</small>
          <b>Plot management</b>
          <em>{unlocked.length - disabled.length}/{unlocked.length} enabled</em>
        </span>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="rewrite-dialog-backdrop" />
        <DialogPrimitive.Viewport className="rewrite-dialog-viewport">
          <DialogPrimitive.Popup className="plot-management-dialog">
            <header className="plot-management-dialog-head">
              <img src="./assets/plot_management.webp" alt="" />
              <div>
                <span>FULL BASE</span>
                <DialogPrimitive.Title>Plot management</DialogPrimitive.Title>
                <DialogPrimitive.Description>
                  Plot 1 unlocks at RV1; each following plot unlocks with the matching Homeland level.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="rewrite-dialog-close" aria-label="Close plot management">
                <X aria-hidden="true" />
              </DialogPrimitive.Close>
            </header>

            <div className="plot-management-summary">
              <MapPinned aria-hidden="true" />
              <span><b>{enabledCount}</b><small>enabled</small></span>
              <i />
              <span><b>{usedSet.size}</b><small>used by plan</small></span>
            </div>

            <div className="plot-management-grid" aria-label="Homeland plot grid">
              {PLOT_MATRIX.flatMap((row, rowIndex) => row.map((number, colIndex) => {
                const locked = !unlockedSet.has(number)
                const enabled = !locked && !draftDisabled.has(number)
                const usedByPlan = usedSet.has(number)
                return (
                  <button
                    type="button"
                    key={number}
                    disabled={locked}
                    aria-pressed={enabled}
                    className={[
                      'plot-management-cell',
                      locked ? 'locked' : enabled ? 'enabled' : 'disabled',
                      usedByPlan ? 'used' : '',
                    ].filter(Boolean).join(' ')}
                    style={{ gridRow: rowIndex + 1, gridColumn: colIndex + 1 }}
                    onClick={() => toggle(number)}
                  >
                    <span className="plot-management-number">{locked ? <LockKeyhole aria-hidden="true" /> : number}</span>
                    <span className="plot-management-state">
                      {locked ? `RV ${number}` : enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                    {usedByPlan && !locked && <em><Check aria-hidden="true" /> USED</em>}
                  </button>
                )
              }))}
            </div>

            <p className="plot-management-help">
              Disable unlocked plots you do not want the auto-layout to use. Changes are applied together so the layout only rebuilds once.
            </p>

            <footer className="plot-management-actions">
              <DialogPrimitive.Close className="ui-button secondary">Cancel</DialogPrimitive.Close>
              <button className="ui-button primary" type="button" onClick={apply}>Apply plots</button>
            </footer>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
