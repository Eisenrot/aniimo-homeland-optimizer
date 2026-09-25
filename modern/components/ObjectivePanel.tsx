import { producedTargets } from '../state'
import type { OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

export default function ObjectivePanel({ state, patch }: Props) {
  const targets = producedTargets()

  const addRequirement = () => {
    patch((draft) => {
      draft.guarantees.push({
        item: targets[0]?.id || '',
        perHour: 1,
        maximize: false,
        enabled: true,
      })
    })
  }

  return (
    <section className="panel">
      <div className="section-title">
        <span />
        <h3>Objective</h3>
        <i />
        <em className="micro">
          {state.guarantees.filter((item) => item.enabled !== false).length}/{state.guarantees.length} active
        </em>
      </div>

      <div className="field">
        <label>Maximise</label>
        <select value={state.target} onChange={(event) => patch((draft) => { draft.target = event.target.value })}>
          <option value="coin">Home Coin</option>
          {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
        </select>
      </div>

      <div className="micro-label objective-subtitle">
        <span>Also make at least</span>
        <b>{state.guarantees.filter((item) => item.maximize && item.enabled !== false).length} co-max</b>
      </div>

      <div className="modern-objectives">
        {state.guarantees.map((guarantee, index) => (
          <div
            className={`objective-row ${guarantee.enabled === false ? 'disabled' : ''} ${guarantee.maximize ? 'maxed' : ''}`}
            key={index}
          >
            <label className="guarantee-enabled-toggle" title="Enable requirement">
              <input
                type="checkbox"
                checked={guarantee.enabled !== false}
                onChange={(event) => patch((draft) => { draft.guarantees[index].enabled = event.target.checked })}
              />
            </label>

            <select
              value={guarantee.item}
              onChange={(event) => patch((draft) => { draft.guarantees[index].item = event.target.value })}
            >
              {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
            </select>

            <label className="rate-field">
              <input
                type="number"
                min={0}
                step="any"
                value={guarantee.perHour}
                disabled={guarantee.maximize}
                onChange={(event) => patch((draft) => {
                  draft.guarantees[index].perHour = Math.max(0, Number(event.target.value) || 0)
                })}
              />
              <span>{guarantee.maximize ? 'MAX' : '/h'}</span>
            </label>

            <label className="maximize-toggle" title="Maximise this item together with the primary objective">
              <input
                type="checkbox"
                checked={guarantee.maximize}
                onChange={(event) => patch((draft) => { draft.guarantees[index].maximize = event.target.checked })}
              />
              <span>MAX</span>
            </label>

            <button
              className="ghost guarantee-remove"
              aria-label="Remove requirement"
              onClick={() => patch((draft) => { draft.guarantees.splice(index, 1) })}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="objective-actions">
        <button className="ghost" onClick={addRequirement}>+ another requirement</button>
        <button className="ghost" onClick={() => patch((draft) => { draft.guarantees = [] })}>Clear requirements</button>
      </div>

      <p className="micro">
        Normal rows are hard minimums. MAX pauses the saved /h value and joins the normalised multi-objective solve.
      </p>
    </section>
  )
}
