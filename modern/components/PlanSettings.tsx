import {
  Box,
  Gauge,
  Home,
  Timer,
  UsersRound,
  Zap,
  WandSparkles,
} from 'lucide-react'
import { fillHomelandForRV, progressionSummary } from '../../src/progression.js'
import {
  generatorPowerAtLevel,
  maxGeneratorLevelAtRv,
  utilityCapAtRv,
} from '../../src/utility-system.js'
import { facilityAsset } from '../lib/presentation'
import { DATA, maxAniimoForLevel } from '../state'
import type { OptimizerState } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
}

type UtilityKey = keyof OptimizerState['utilityCounts']

const utilityFacility = (slug: string) => DATA.facilities.find((facility) => facility.slug === slug)

const UTILITIES: Array<{
  key: UtilityKey
  slug: string
  label: string
  detail: string
}> = [
  { key: 'cooling', slug: 'cooling-unit', label: 'Cooling Unit', detail: 'Cool / Freeze · 9×9 field' },
  { key: 'heat', slug: 'heat-furnace', label: 'Heat Furnace', detail: 'Warm / Scorching · 9×9 field' },
  { key: 'sunlamp', slug: 'sunlamp', label: 'Sunlamp', detail: 'Adequate · 9×9 field' },
  { key: 'generator', slug: 'crackle-generator', label: 'Crackle Generator', detail: 'Electricity · 11×11 field' },
  { key: 'powerPole', slug: 'crackle-power-pole', label: 'Crackle Power Pole', detail: 'Grid extension · 7×7 field' },
]

export default function PlanSettings({ state, patch }: Props) {
  const cap = maxAniimoForLevel(state.homelandLevel)
  const progression = progressionSummary(state.homelandLevel, DATA)
  const generatorLevelCap = maxGeneratorLevelAtRv(state.homelandLevel)

  const setUtilityCount = (key: UtilityKey, slug: string, raw: number) => {
    const max = utilityCapAtRv(slug, state.homelandLevel)
    const count = Math.min(max, Math.max(0, Math.floor(Number(raw) || 0)))
    patch((draft) => {
      draft.utilityCounts[key] = count
      if (key === 'cooling') draft.climateOptions.cooling = count > 0
      if (key === 'heat') draft.climateOptions.heat = count > 0
      if (key === 'sunlamp') draft.climateOptions.sunlamp = count > 0
      if (key === 'generator') draft.generatorAvailable = count > 0
    })
  }

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
            draft.generatorLevel = filled.generatorLevel
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
              const slots = Math.min(draft.teamSlots, nextCap)
              draft.teamSlots = slots
              draft.workerSlots = slots
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
          <span><small>Aniimo</small><b>{state.teamSlots} / {cap}</b></span>
          <input
            type="number"
            min={0}
            max={cap}
            value={state.teamSlots}
            aria-label="Aniimo"
            onChange={(event) => patch((draft) => {
              const slots = Math.min(cap, Math.max(0, Number(event.target.value) || 0))
              draft.teamSlots = slots
              draft.workerSlots = slots
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
          <Box aria-hidden="true" />
          <span><b>1 recipe / facility</b><small>Each physical copy stays dedicated.</small></span>
        </label>
        <label className={state.preferElectricalAutomation ? 'rule-pill enabled' : 'rule-pill'}>
          <input
            type="checkbox"
            checked={state.preferElectricalAutomation}
            onChange={(event) => patch((draft) => {
              const enabled = event.target.checked
              draft.preferElectricalAutomation = enabled
              if (!enabled) draft.maximizeElectricalCoverage = false
            })}
          />
          <Zap aria-hidden="true" />
          <span><b>Electrical automation</b><small>Prefer E-mode when active objectives can be preserved.</small></span>
        </label>
        <label className={`${state.maximizeElectricalCoverage ? 'rule-pill enabled' : 'rule-pill'} ${state.preferElectricalAutomation ? '' : 'is-disabled'}`}>
          <input
            type="checkbox"
            checked={state.maximizeElectricalCoverage}
            disabled={!state.preferElectricalAutomation}
            onChange={(event) => patch((draft) => { draft.maximizeElectricalCoverage = event.target.checked })}
          />
          <Gauge aria-hidden="true" />
          <span><b>Max electrical coverage</b><small>Use the 97% floor to electrify more structures and reduce Aniimo.</small></span>
        </label>
      </div>

      <div className="micro-label utility-heading">Utilities available to the solver</div>
      <div className="modern-utility-grid vivid utility-cap-grid">
        {UTILITIES.map(({ key, slug, label, detail }) => {
          const facility = utilityFacility(slug)
          const max = utilityCapAtRv(slug, state.homelandLevel)
          const value = Math.min(max, state.utilityCounts[key] || 0)
          const enabled = value > 0
          const generator = key === 'generator'
          return (
            <div className={`utility-card utility-${key} ${enabled ? 'enabled' : ''}`} key={key}>
              <span className="utility-enabled-mark" aria-hidden="true">{enabled ? '\u2713' : ''}</span>
              {facility?.icon && <img src={facilityAsset(facility)} alt="" />}
              <div className="utility-main">
                <b>{label}</b>
                <small>{max ? detail : `Unlocks at RV ${Math.min(...Object.values(facility?.homeLevel || { 1: 99 }).map(Number))}`}</small>
                {generator && enabled && (
                  <em>{generatorPowerAtLevel(state.generatorLevel)} power each</em>
                )}
              </div>
              <div className={`utility-controls ${generator ? 'generator-controls' : ''}`}>
                {generator && (
                  <label className="utility-level-control">
                    <span>LV.</span>
                    <select
                      value={state.generatorLevel}
                      disabled={!generatorLevelCap || !enabled}
                      aria-label="Crackle Generator level"
                      onChange={(event) => patch((draft) => {
                        draft.generatorLevel = Math.min(
                          generatorLevelCap || 1,
                          Math.max(1, Number(event.target.value) || 1),
                        )
                      })}
                    >
                      {Array.from({ length: Math.max(1, generatorLevelCap) }, (_, index) => index + 1).map((level) => (
                        <option key={level} value={level}>Lv.{level}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="utility-count-control">
                  <span>COUNT</span>
                  <b>{value} / {max}</b>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    value={value}
                    disabled={max <= 0}
                    aria-label={`${label} available count`}
                    onChange={(event) => setUtilityCount(key, slug, Number(event.target.value))}
                  />
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
