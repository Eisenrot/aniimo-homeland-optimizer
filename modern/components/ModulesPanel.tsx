import type { OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

const MODULES = [
  ['crafting-module', 'Crafting Module', 'https://aniipedia.com/items/4040014.webp'],
  ['ecological-module', 'Ecological Module', 'https://aniipedia.com/items/4040011.webp'],
  ['kitchen-module', 'Kitchen Module', 'https://aniipedia.com/items/4040012.webp'],
  ['resource-detector', 'Resource Detector', 'https://aniipedia.com/items/4040013.webp'],
] as const

export default function ModulesPanel({ state, patch }: Props) {
  return (
    <section className="panel">
      <div className="section-title"><span /><h3>Upgrade modules</h3><i /></div>
      <div className="module-grid">
        {MODULES.map(([key, name, icon]) => (
          <div className="module-card" key={key}>
            <img src={icon} alt="" loading="lazy" />
            <div className="module-info">
              <label>{name}</label>
              <span>Upgrade level</span>
            </div>
            <input
              type="number"
              min={0}
              max={20}
              value={state.modules[key] || 0}
              onChange={(event) => patch((draft) => {
                draft.modules[key] = Math.max(0, Number(event.target.value) || 0)
              })}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
