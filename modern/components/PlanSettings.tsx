import {
  Gauge,
  Home,
  Timer,
  UsersRound,
  UserRoundCheck,
  UtensilsCrossed,
  WandSparkles,
} from 'lucide-react'
import { fillHomelandForRV, progressionSummary } from '../../src/progression.js'
import { facilityAsset } from '../lib/presentation'
import { DATA, maxAniimoForLevel } from '../state'
import type { OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

const utilityFacility = (slug: string) => DATA.facilities.find((facility) => facility.slug === slug)
const GENERATOR_ICON = 'https://aniipedia.com/items/10400021.webp'

export default function PlanSettings({ state, patch }: Props) {
  const cap = maxAniimoForLevel(state.homelandLevel)
  const progression = progressionSummary(state.homelandLevel, DATA)

  const utilities = [
    ['cooling', 'Cooling Unit', 'cooling-unit'],
    ['heat', 'Heat Furnace', 'heat-furnace'],
    ['sunlamp', 'Sunlamp', 'sunlamp'],
  ] as const

  return (
    <section className="panel plan-settings-panel">
      <div className="section-title">
        <span />
        <h3><Home aria-hidden="true" /> Homeland</h3>
        <i />
        <button
          className="fill-rv-button"
          type="button"
          onClick={() => patch((draft) => {
            const filled = fillHomelandForRV(draft, DATA)
            draft.facilities = filled.facilities
            draft.modules = filled.modules
          })}
        >
          <WandSparkles aria-hidden="true" />
          Fill RV {state.homelandLevel}
        </button>
      </div>

      <div className="rv-capacity-line">
        <span>RV {progression.rv} progression</span>
        <b>{progression.bulk.farmland} Farmland</b>
        <b>{progression.bulk.woodland} Woodland</b>
        <b>{progression.bulk.mine} Mine</b>
        <b>{progression.bulk.well} Well</b>
      </div>

      <div className="setting-tile-grid">
        <label className="setting-tile tone-red">
          <Home aria-hidden="true" />
          <span><small>Homeland level</small><b>RV {state.homelandLevel}</b></span>
          <input
            type="number"
            min={1}
            max={20}
            value={state.homelandLevel}
            aria-label="Homeland level"
            onChange={(event) => patch((draft) => {
              draft.homelandLevel = Math.min(20, Math.max(1, Number(event.target.value) || 1))
              const nextCap = maxAniimoForLevel(draft.homelandLevel)
              draft.workerSlots = Math.min(draft.workerSlots, nextCap)
              draft.teamSlots = Math.min(draft.teamSlots, nextCap)
            })}
          />
        </label>

        <label className="setting-tile tone-purple">
          <Gauge aria-hidden="true" />
          <span><small>Ability ceiling</small><b>{state.abilityLevel === 'auto' ? 'Roster' : `Lv.${state.abilityLevel}`}</b></span>
          <select
            value={String(state.abilityLevel)}
            aria-label="Ability ceiling"
            onChange={(event) => patch((draft) => {
              draft.abilityLevel = event.target.value === 'auto' ? 'auto' : Number(event.target.value)
            })}
          >
            <option value="auto">Auto from roster</option>
            {[1, 2, 3, 4].map((level) => <option key={level} value={level}>Lv.{level}</option>)}
          </select>
        </label>

        <label className="setting-tile tone-blue">
          <UsersRound aria-hidden="true" />
          <span><small>Theoretical Aniimo</small><b>{state.workerSlots} / {cap}</b></span>
          <input
            type="number"
            min={1}
            max={cap}
            value={state.workerSlots}
            aria-label="Theoretical Aniimo"
            onChange={(event) => patch((draft) => {
              draft.workerSlots = Math.min(cap, Math.max(1, Number(event.target.value) || 1))
            })}
          />
        </label>

        <label className="setting-tile tone-green">
          <UserRoundCheck aria-hidden="true" />
          <span><small>Real-team Aniimo</small><b>{state.teamSlots} / {cap}</b></span>
          <input
            type="number"
            min={1}
            max={cap}
            value={state.teamSlots}
            aria-label="Real-team Aniimo"
            onChange={(event) => patch((draft) => {
              draft.teamSlots = Math.min(cap, Math.max(1, Number(event.target.value) || 1))
            })}
          />
        </label>

        <label className="setting-tile tone-amber">
          <Timer aria-hidden="true" />
          <span><small>Collection</small><b>{state.collectHours ? `${state.collectHours}h` : 'Unlimited'}</b></span>
          <select
            value={state.collectHours}
            aria-label="Collection interval"
            onChange={(event) => patch((draft) => { draft.collectHours = Number(event.target.value) })}
          >
            <option value={0}>Unlimited</option>
            {[1, 2, 4, 8, 12, 24, 48].map((hours) => <option key={hours} value={hours}>{hours}h</option>)}
          </select>
        </label>
      </div>

      <div className="rule-row">
        <label className={state.oneRecipePerFacility ? 'rule-pill enabled' : 'rule-pill'}>
          <input
            type="checkbox"
            checked={state.oneRecipePerFacility}
            onChange={(event) => patch((draft) => { draft.oneRecipePerFacility = event.target.checked })}
          />
          <span><b>1 recipe / facility</b><small>Each physical copy stays dedicated.</small></span>
        </label>
        <label className={state.hungry ? 'rule-pill danger enabled' : 'rule-pill danger'}>
          <input
            type="checkbox"
            checked={state.hungry}
            onChange={(event) => patch((draft) => { draft.hungry = event.target.checked })}
          />
          <UtensilsCrossed aria-hidden="true" />
          <span><b>Out of food</b><small>Manual work falls to 20%.</small></span>
        </label>
      </div>

      <div className="micro-label utility-heading">Utilities available to the solver</div>
      <div className="modern-utility-grid vivid">
        {utilities.map(([key, label, slug]) => {
          const facility = utilityFacility(slug)
          return (
            <label className={`utility-card utility-${key} ${state.climateOptions[key] ? 'enabled' : ''}`} key={key}>
              <input
                type="checkbox"
                checked={state.climateOptions[key]}
                onChange={(event) => patch((draft) => { draft.climateOptions[key] = event.target.checked })}
              />
              {facility?.icon && <img src={facilityAsset(facility)} alt="" />}
              <div className="utility-main"><b>{label}</b><small>{state.climateOptions[key] ? 'Available' : 'Disabled'}</small></div>
            </label>
          )
        })}
        {(() => {
          const facility = utilityFacility('crackle-generator')
          return (
            <label className={`utility-card utility-generator ${state.generatorAvailable ? 'enabled' : ''}`}>
              <input
                type="checkbox"
                checked={state.generatorAvailable}
                onChange={(event) => patch((draft) => { draft.generatorAvailable = event.target.checked })}
              />
              <img src={GENERATOR_ICON} alt="" />
              <div className="utility-main"><b>Crackle Generator</b><small>{state.generatorAvailable ? 'Available' : 'Disabled'}</small></div>
            </label>
          )
        })()}
      </div>
    </section>
  )
}
