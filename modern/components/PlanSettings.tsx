import { DATA, maxAniimoForLevel } from '../state'
import type { OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

export default function PlanSettings({ state, patch }: Props) {
  const cap = maxAniimoForLevel(state.homelandLevel)

  return (
    <section className="panel">
      <div className="section-title"><span /><h3>Plan settings</h3><i /><em className="micro">{DATA.version || 'data'}</em></div>
      <div className="grid2 plan-settings-grid">
        <div className="field">
          <label>Homeland level</label>
          <input
            type="number"
            min={1}
            max={20}
            value={state.homelandLevel}
            onChange={(event) => patch((draft) => {
              draft.homelandLevel = Math.min(20, Math.max(1, Number(event.target.value) || 1))
              const nextCap = maxAniimoForLevel(draft.homelandLevel)
              draft.workerSlots = Math.min(draft.workerSlots, nextCap)
              draft.teamSlots = Math.min(draft.teamSlots, nextCap)
            })}
          />
        </div>
        <div className="field">
          <label>Ability ceiling</label>
          <select
            value={String(state.abilityLevel)}
            onChange={(event) => patch((draft) => {
              draft.abilityLevel = event.target.value === 'auto' ? 'auto' : Number(event.target.value)
            })}
          >
            <option value="auto">Auto from roster</option>
            {[1, 2, 3, 4].map((level) => <option key={level} value={level}>Lv.{level}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Theoretical Aniimo</label>
          <input
            type="number"
            min={1}
            max={cap}
            value={state.workerSlots}
            onChange={(event) => patch((draft) => {
              draft.workerSlots = Math.min(cap, Math.max(1, Number(event.target.value) || 1))
            })}
          />
        </div>
        <div className="field">
          <label>Real-team Aniimo</label>
          <input
            type="number"
            min={1}
            max={cap}
            value={state.teamSlots}
            onChange={(event) => patch((draft) => {
              draft.teamSlots = Math.min(cap, Math.max(1, Number(event.target.value) || 1))
            })}
          />
        </div>
        <div className="field">
          <label>Collection interval</label>
          <select
            value={state.collectHours}
            onChange={(event) => patch((draft) => { draft.collectHours = Number(event.target.value) })}
          >
            <option value={0}>Unlimited</option>
            {[1, 2, 4, 8, 12, 24, 48].map((hours) => <option key={hours} value={hours}>{hours}h</option>)}
          </select>
        </div>
      </div>

      <div className="modern-checks">
        <label className="check-row compact-rule">
          <input
            type="checkbox"
            checked={state.oneRecipePerFacility}
            onChange={(event) => patch((draft) => { draft.oneRecipePerFacility = event.target.checked })}
          />
          <span><b>One recipe per facility</b><small>Each physical copy stays on one recipe.</small></span>
        </label>
        <label className="check-row compact-rule">
          <input
            type="checkbox"
            checked={state.hungry}
            onChange={(event) => patch((draft) => { draft.hungry = event.target.checked })}
          />
          <span><b>Aniimo are out of food</b><small>Manual work runs at 20% speed.</small></span>
        </label>
      </div>

      <div className="micro-label utility-heading">Utility buildings available to the solver</div>
      <div className="modern-utility-grid">
        {([
          ['cooling', 'Cooling Unit'],
          ['heat', 'Heat Furnace'],
          ['sunlamp', 'Sunlamp'],
        ] as const).map(([key, label]) => (
          <label className={`utility-card ${state.climateOptions[key] ? 'enabled' : ''}`} key={key}>
            <input
              type="checkbox"
              checked={state.climateOptions[key]}
              onChange={(event) => patch((draft) => { draft.climateOptions[key] = event.target.checked })}
            />
            <div className="utility-main"><b>{label}</b></div>
          </label>
        ))}
        <label className={`utility-card ${state.generatorAvailable ? 'enabled' : ''}`}>
          <input
            type="checkbox"
            checked={state.generatorAvailable}
            onChange={(event) => patch((draft) => { draft.generatorAvailable = event.target.checked })}
          />
          <div className="utility-main"><b>Crackle Generator</b></div>
        </label>
      </div>
    </section>
  )
}
