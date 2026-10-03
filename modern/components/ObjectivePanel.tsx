import { CircleHelp, Equal, Plus, ShieldCheck, Target, Trash2 } from 'lucide-react'
import { explainPlanObjectives } from '../../src/plan-explanation.js'
import ItemPicker from './ItemPicker'
import { DATA, objectiveTargets } from '../state'
import { itemIcon } from '../lib/presentation'
import type { OptimizerPlan, OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  plan: OptimizerPlan | null
  patch: (update: (draft: OptimizerState) => void) => void
}

function fmt(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function pct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(value >= 0.995 ? 0 : 1)}%`
}

export default function ObjectivePanel({ state, plan, patch }: Props) {
  const targets = objectiveTargets()
  const explanation = explainPlanObjectives(plan, state, DATA)
  const fairness = explanation.mode === 'fairness'
  const configuredCoMax = Math.max(0, explanation.configuredMaxCount - 1)

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
        <div className="objective-field-label">
          <label>MAX objective</label>
          {fairness && <em><Equal aria-hidden="true" /> co-equal</em>}
        </div>
        <ItemPicker
          value={state.target}
          options={targets}
          includeCoin
          ariaLabel="Optimization MAX objective"
          onChange={(value) => patch((draft) => { draft.target = value })}
        />
        {fairness && (
          <small className="objective-primary-note">
            This is not priority #1. Every enabled MAX objective below enters the same fairness solve.
          </small>
        )}
      </div>

      <div className="micro-label objective-subtitle">
        <span>Additional objectives / requirements</span>
        <b>{configuredCoMax} co-max</b>
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

            <label
              className="maximize-toggle"
              title={guarantee.maximize
                ? 'Co-equal MAX objective'
                : 'Turn this hard minimum into a co-equal MAX objective'}
            >
              <input
                type="checkbox"
                checked={guarantee.maximize}
                onChange={(event) => patch((draft) => { draft.guarantees[index].maximize = event.target.checked })}
              />
              <span>{guarantee.maximize ? 'MAX' : 'MIN'}</span>
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

      <div className={`objective-explanation ${fairness ? 'fairness' : 'single'}`}>
        <div className="objective-explanation-head">
          <span>
            <CircleHelp aria-hidden="true" />
            <b>{fairness ? 'Why these MAX numbers?' : 'How this objective is solved'}</b>
          </span>
          {fairness && explanation.fairnessFloor != null && (
            <em>fairness floor {pct(explanation.fairnessFloor)}</em>
          )}
        </div>

        <p>
          {fairness
            ? 'Each MAX target is compared with the best result it could reach alone. The solver first raises the weakest retained share across all active MAX targets, then spends the remaining room improving their combined result.'
            : 'With one active MAX objective, the solver pushes it directly after every hard minimum is satisfied.'}
        </p>

        <div className="objective-breakdown">
          {explanation.maxObjectives.map((objective) => (
            <div className={`objective-breakdown-row ${objective.active ? '' : 'inactive'}`} key={objective.key}>
              <img src={itemIcon(objective.item)} alt="" />
              <span>
                <b>{objective.label}</b>
                <small>
                  {objective.active
                    ? objective.soloMax != null
                      ? `${fmt(objective.achieved)} / ${fmt(objective.soloMax)} solo max`
                      : 'Waiting for solved calibration'
                    : 'No positive solo maximum under the current assumptions'}
                </small>
              </span>
              <strong>{objective.active ? pct(objective.share) : 'inactive'}</strong>
            </div>
          ))}
        </div>

        {explanation.minimums.length > 0 && (
          <div className="objective-minimums">
            <div className="objective-minimums-title">
              <ShieldCheck aria-hidden="true" />
              <span><b>Hard minimums</b><small>These are constraints, not fairness targets.</small></span>
            </div>
            {explanation.minimums.map((minimum: { key: string; item: string; label: string; minimum: number; achieved: number | null; satisfied: boolean | null }) => (
              <div className="objective-minimum-row" key={minimum.key}>
                <img src={itemIcon(minimum.item)} alt="" />
                <span>
                  <b>{minimum.label}</b>
                  <small>must stay at or above {fmt(minimum.minimum)} / h</small>
                </span>
                <strong className={minimum.satisfied === false ? 'failed' : ''}>
                  {minimum.achieved == null ? '—' : `${fmt(minimum.achieved)} / h`}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="micro objective-help">
        MAX objectives share the normalized fairness solve. MIN rows are hard requirements that must be met first.
      </p>
    </section>
  )
}
