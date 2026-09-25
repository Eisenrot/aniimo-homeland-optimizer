import { facilityAsset } from '../lib/presentation'
import { DATA } from '../state'
import type { FacilityConfig, OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

function displayedConfig(config: FacilityConfig | undefined) {
  if (!config) return { count: 0, level: 1, mixed: false }
  if (!config.stacks?.length) return { count: Number(config.count || 0), level: Number(config.level || 1), mixed: false }
  const count = config.stacks.reduce((sum, stack) => sum + Number(stack.count || 0), 0)
  const level = config.stacks.reduce((max, stack) => Math.max(max, Number(stack.level || 1)), 1)
  return { count, level, mixed: config.stacks.length > 1 }
}

export default function FacilitiesPanel({ state, patch }: Props) {
  const facilities = DATA.facilities
    .filter((facility) => facility.kind !== 'utility')
    .sort((a, b) => {
      const ac = displayedConfig(state.facilities[a.slug]).count > 0
      const bc = displayedConfig(state.facilities[b.slug]).count > 0
      return Number(bc) - Number(ac) || Number(a.category || 0) - Number(b.category || 0) || a.name.localeCompare(b.name)
    })

  const collapseConfig = (draft: OptimizerState, slug: string, count: number, level: number) => {
    draft.facilities[slug] = { count, level }
  }

  return (
    <section className="panel">
      <div className="section-title">
        <span />
        <h3>Facilities</h3>
        <i />
        <em className="micro">{state.manualSpeeds ? 'manual Speed % locked' : 'automatic recipe-aware Efficiency'}</em>
      </div>

      <label className="speed-mode-toggle">
        <input
          type="checkbox"
          checked={state.manualSpeeds}
          onChange={(event) => patch((draft) => { draft.manualSpeeds = event.target.checked })}
        />
        <span>
          <b>Manual Speed %</b>
          <small>{state.manualSpeeds ? 'Stored speed values are authoritative.' : 'Off = recipe-aware theoretical baseline.'}</small>
        </span>
      </label>

      <div className="modern-facility-list">
        {facilities.map((facility) => {
          const raw = state.facilities[facility.slug]
          const config = displayedConfig(raw)
          const speed = Number(state.speeds[facility.slug] ?? 300)

          return (
            <div className="modern-facility-row" key={facility.slug}>
              <div className="facility-identity">
                <span className="facility-icon">
                  {facility.icon
                    ? <img src={facilityAsset(facility)} alt="" />
                    : <b>{facility.name.slice(0, 1)}</b>}
                </span>
                <span>
                  <b>{facility.name}</b>
                  <small>
                    {facility.categoryName || facility.kind} · max Lv.{facility.maxLevel}
                    {config.mixed ? ' · mixed-level stack' : ''}
                  </small>
                </span>
              </div>
              <label>
                <span>Copies</span>
                <input
                  type="number"
                  min={0}
                  value={config.count}
                  onChange={(event) => patch((draft) => {
                    collapseConfig(
                      draft,
                      facility.slug,
                      Math.max(0, Number(event.target.value) || 0),
                      config.level,
                    )
                  })}
                />
              </label>
              <label>
                <span>Lv.</span>
                <input
                  type="number"
                  min={1}
                  max={facility.maxLevel}
                  value={config.level}
                  onChange={(event) => patch((draft) => {
                    collapseConfig(
                      draft,
                      facility.slug,
                      config.count,
                      Math.min(facility.maxLevel, Math.max(1, Number(event.target.value) || 1)),
                    )
                  })}
                />
              </label>
              <label>
                <span>{state.manualSpeeds ? 'Speed %' : 'Speed'}</span>
                <input
                  type={state.manualSpeeds ? 'number' : 'text'}
                  min={state.manualSpeeds ? 1 : undefined}
                  max={state.manualSpeeds ? 999 : undefined}
                  step={state.manualSpeeds ? 0.1 : undefined}
                  readOnly={!state.manualSpeeds}
                  value={state.manualSpeeds ? speed : 'AUTO'}
                  onChange={(event) => {
                    if (!state.manualSpeeds) return
                    patch((draft) => {
                      draft.speeds[facility.slug] = Math.max(1, Number(event.target.value) || 100)
                    })
                  }}
                />
              </label>
            </div>
          )
        })}
      </div>
      <p className="micro">Editing count or level on a mixed-level stack intentionally collapses it to one level. The legacy reference remains available for comparison.</p>
    </section>
  )
}
