import { Plus, Target, Trash2 } from 'lucide-react'
import ItemPicker from './ItemPicker'
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
    <section className="panel objective-panel">
      <div className="section-title">
        <span />
        <h3><Target aria-hidden="true" /> Objective</h3>
        <i />
        <em className="micro">
          {state.guarantees.filter((item) => item.enabled !== false).length}/{state.guarantees.length} active
        </em>
      </div>

      <div className="field objective-primary">
        <label>Maximise</label>
        <ItemPicker
          value={state.target}
          options={targets}
          includeCoin
          ariaLabel="Primary optimization target"
          onChange={(value) => patch((draft) => { draft.target = value })}
        />
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

            <ItemPicker
              value={guarantee.item}
              options={targets}
              ariaLabel={`Requirement ${index + 1} item`}
              onChange={(value) => patch((draft) => { draft.guarantees[index].item = value })}
            />

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
              type="button"
              aria-label="Remove requirement"
              onClick={() => patch((draft) => { draft.guarantees.splice(index, 1) })}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <div className="objective-actions">
        <button className="ghost" type="button" onClick={addRequirement}><Plus aria-hidden="true" /> another requirement</button>
        <button className="ghost" type="button" onClick={() => patch((draft) => { draft.guarantees = [] })}><Trash2 aria-hidden="true" /> Clear</button>
      </div>

      <p className="micro objective-help">
        Minimum rows are hard requirements. MAX joins the normalized multi-objective solve.
      </p>
    </section>
  )
}
