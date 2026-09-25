import { DATA } from '../state'
import type { OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

export default function FacilitiesPanel({ state, patch }: Props) {
  const facilities = DATA.facilities.filter((facility) => facility.kind !== 'utility')

  return (
    <section className="panel">
      <div className="section-title"><span /><h3>Facilities</h3><i /></div>
      <div className="modern-facility-list">
        {facilities.map((facility) => {
          const config = state.facilities[facility.slug] || { count: 0, level: 1 }
          return (
            <div className="modern-facility-row" key={facility.slug}>
              <div>
                <b>{facility.name}</b>
                <small>{facility.categoryName || facility.kind}</small>
              </div>
              <label>
                <span>Copies</span>
                <input
                  type="number"
                  min={0}
                  value={config.count}
                  onChange={(event) => patch((draft) => {
                    draft.facilities[facility.slug] = {
                      ...(draft.facilities[facility.slug] || { level: 1 }),
                      count: Math.max(0, Number(event.target.value) || 0),
                    }
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
                    draft.facilities[facility.slug] = {
                      ...(draft.facilities[facility.slug] || { count: 0 }),
                      level: Math.min(facility.maxLevel, Math.max(1, Number(event.target.value) || 1)),
                    }
                  })}
                />
              </label>
            </div>
          )
        })}
      </div>
    </section>
  )
}
