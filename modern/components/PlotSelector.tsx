import { LockKeyhole, MapPinned } from 'lucide-react'
import { PLOT_MATRIX } from '../../src/full-layout.js'

type Props = {
  unlocked: number[]
  disabled: number[]
  used?: number[]
  onToggle: (plot: number) => void
}

export default function PlotSelector({ unlocked, disabled, used = [], onToggle }: Props) {
  const unlockedSet = new Set(unlocked)
  const disabledSet = new Set(disabled)
  const usedSet = new Set(used)

  return (
    <section className="plot-selector surface-card">
      <div className="plot-selector-copy">
        <MapPinned aria-hidden="true" />
        <span><small>Enabled plots</small><b>Tap the mini Homeland map.</b></span>
      </div>

      <div className="plot-map-selector" aria-label="Homeland plot selector">
        {PLOT_MATRIX.flatMap((row, rowIndex) => row.map((number, colIndex) => {
          const locked = !unlockedSet.has(number)
          const active = !locked && !disabledSet.has(number)
          const usedByPlan = usedSet.has(number)
          return (
            <button
              type="button"
              key={number}
              disabled={locked}
              aria-pressed={active}
              className={[
                'plot-map-cell',
                active ? 'active' : '',
                locked ? 'locked' : '',
                usedByPlan ? 'used' : '',
              ].filter(Boolean).join(' ')}
              style={{ gridRow: rowIndex + 1, gridColumn: colIndex + 1 }}
              onClick={() => onToggle(number)}
              title={locked ? `Plot ${number} is locked` : `Plot ${number}: ${active ? 'enabled' : 'excluded'}`}
            >
              {locked ? <LockKeyhole aria-hidden="true" /> : <b>{number}</b>}
              {!locked && <small>{usedByPlan ? 'used' : active ? 'on' : 'off'}</small>}
            </button>
          )
        }))}
      </div>
    </section>
  )
}
