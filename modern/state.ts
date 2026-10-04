import { DEFAULT_STATE } from '../src/defaults.js'
import { GAME_DATA } from '../src/data.js'
import { maxGeneratorLevelAtRv, utilityCapAtRv } from '../src/utility-system.js'
import { guaranteeStatus } from '../src/objective-status.js'
import type { GameData, Guarantee, OptimizerState } from './types'

export const DATA = GAME_DATA as GameData
export const STORE_KEY = 'aniimoHomelandOptimizerStateV1'

const MAX_ANIIMO_BY_HOMELAND = [0,5,8,11,14,17,20,22,24,26,28,30,32,34,36,38,40,42,43,44,45]

const OBJECTIVE_TARGET_DEFS = [
  ...(DATA.events || []).flatMap((event: any) =>
    (event.objectiveGroups || []).flatMap((section: any) =>
      (section.items || []).map((id: number | string) => ({
        id: String(id),
        group: String(event.name),
        subgroup: String(section.subgroup),
      })),
    ),
  ),
  { id: '4001065', group: 'Home Materials', subgroup: 'Rock' },
  { id: '4010174', group: 'Home Materials', subgroup: 'Rock' },
  { id: '4010175', group: 'Home Materials', subgroup: 'Rock' },
  { id: '4010176', group: 'Home Materials', subgroup: 'Rock' },
  { id: '4010177', group: 'Home Materials', subgroup: 'Rock' },
  { id: '4001064', group: 'Home Materials', subgroup: 'Wood' },
  { id: '4010169', group: 'Home Materials', subgroup: 'Wood' },
  { id: '4010170', group: 'Home Materials', subgroup: 'Wood' },
  { id: '4010171', group: 'Home Materials', subgroup: 'Wood' },
  { id: '4010172', group: 'Home Materials', subgroup: 'Wood' },
  { id: '150001', group: 'Aniimo Items', subgroup: 'EXP' },
  { id: '150002', group: 'Aniimo Items', subgroup: 'EXP' },
  { id: '150003', group: 'Aniimo Items', subgroup: 'EXP' },
  { id: '110001', group: 'Aniimo Items', subgroup: 'Aniipod' },
  { id: '110002', group: 'Aniimo Items', subgroup: 'Aniipod' },
  { id: '110007', group: 'Aniimo Items', subgroup: 'Aniipod' },
] as const
const GROUPED_OBJECTIVE_TARGET_IDS = new Set<string>(OBJECTIVE_TARGET_DEFS.map((item) => item.id))

function producedTargetIds() {
  const ids = new Set<string>()
  for (const recipe of DATA.recipes) {
    for (const output of recipe.outputs || []) ids.add(String(output.item))
  }
  return ids
}

const LEGACY_FORM_IDS = new Map(
  DATA.pals
    .filter((pal) => pal.isForm && pal.legacyId != null)
    .map((pal) => [String(pal.legacyId), String(pal.id)]),
)

export function maxAniimoForLevel(level: number) {
  return MAX_ANIIMO_BY_HOMELAND[Math.min(20, Math.max(1, Math.floor(Number(level) || 1)))] || 5
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function defaultOwned(): OptimizerState['owned'] {
  const out: OptimizerState['owned'] = {}
  for (const pal of DATA.pals) {
    out[String(pal.id)] = {
      enabled: false,
      count: 1,
    }
  }
  return out
}

function defaultRecipeNotes(): OptimizerState['recipeNotes'] {
  const out: OptimizerState['recipeNotes'] = {}
  for (const recipe of DATA.recipes) {
    if (recipe.note) out[String(recipe.note.item)] = false
  }
  return out
}

type LegacyState = Partial<OptimizerState> & {
  climate?: {
    enabled?: boolean
    temperature?: string
  }
}

export function normalizeState(raw?: LegacyState | null): OptimizerState {
  const base = clone(DEFAULT_STATE) as OptimizerState
  const incoming = clone(raw || {}) as LegacyState
  const state = {
    ...base,
    ...incoming,
    facilities: { ...base.facilities, ...(incoming.facilities || {}) },
    modules: { ...base.modules, ...(incoming.modules || {}) },
    speeds: { ...base.speeds, ...(incoming.speeds || {}) },
    climateOptions: { ...base.climateOptions, ...(incoming.climateOptions || {}) },
    recipeNotes: raw == null ? defaultRecipeNotes() : { ...(incoming.recipeNotes || {}) },
    owned: { ...(incoming.owned || {}) },
  } as OptimizerState

  if (incoming.climate?.enabled && !incoming.climateOptions) {
    const temperature = incoming.climate.temperature
    if (temperature === 'Cool' || temperature === 'Freeze') state.climateOptions.cooling = true
    else if (temperature === 'Warm' || temperature === 'Scorching') state.climateOptions.heat = true
    else if (temperature === 'Adequate') state.climateOptions.sunlamp = true
  }

  state.homelandLevel = Math.min(20, Math.max(1, Number(state.homelandLevel) || 1))
  const cap = maxAniimoForLevel(state.homelandLevel)
  const slots = Math.min(
    cap,
    Math.max(0, Number(incoming.teamSlots ?? incoming.workerSlots ?? state.teamSlots ?? state.workerSlots) || 0),
  )
  state.teamSlots = slots
  state.workerSlots = slots
  state.collectHours = Math.max(0, Number(state.collectHours) || 0)
  state.oneRecipePerFacility = Boolean(state.oneRecipePerFacility)
  state.preferElectricalAutomation = Boolean(state.preferElectricalAutomation)
  state.maximizeElectricalCoverage = Boolean(state.maximizeElectricalCoverage) && state.preferElectricalAutomation

  const incomingCounts = (incoming.utilityCounts || {}) as Partial<OptimizerState['utilityCounts']>
  const legacyClimate = (incoming.climateOptions || state.climateOptions || {}) as Partial<OptimizerState['climateOptions']>
  const legacyGenerator = Boolean(incoming.generatorAvailable ?? state.generatorAvailable)
  state.utilityCounts = {
    cooling: Math.min(
      utilityCapAtRv('cooling-unit', state.homelandLevel),
      Math.max(0, Math.floor(Number(incomingCounts.cooling ?? (legacyClimate.cooling ? 1 : 0)) || 0)),
    ),
    heat: Math.min(
      utilityCapAtRv('heat-furnace', state.homelandLevel),
      Math.max(0, Math.floor(Number(incomingCounts.heat ?? (legacyClimate.heat ? 1 : 0)) || 0)),
    ),
    sunlamp: Math.min(
      utilityCapAtRv('sunlamp', state.homelandLevel),
      Math.max(0, Math.floor(Number(incomingCounts.sunlamp ?? (legacyClimate.sunlamp ? 1 : 0)) || 0)),
    ),
    generator: Math.min(
      utilityCapAtRv('crackle-generator', state.homelandLevel),
      Math.max(0, Math.floor(Number(incomingCounts.generator ?? (legacyGenerator ? 1 : 0)) || 0)),
    ),
    powerPole: Math.min(
      utilityCapAtRv('crackle-power-pole', state.homelandLevel),
      Math.max(0, Math.floor(Number(incomingCounts.powerPole ?? utilityCapAtRv('crackle-power-pole', state.homelandLevel)) || 0)),
    ),
  }

  const generatorLevelCap = maxGeneratorLevelAtRv(state.homelandLevel)
  state.generatorLevel = generatorLevelCap
    ? Math.min(generatorLevelCap, Math.max(1, Math.floor(Number(incoming.generatorLevel ?? state.generatorLevel ?? 1) || 1)))
    : 1

  // Legacy solver compatibility. The current solver still consumes booleans;
  // Solver Next consumes the numeric availability caps directly.
  state.climateOptions.cooling = state.utilityCounts.cooling > 0
  state.climateOptions.heat = state.utilityCounts.heat > 0
  state.climateOptions.sunlamp = state.utilityCounts.sunlamp > 0
  state.generatorAvailable = state.utilityCounts.generator > 0

  delete (state as OptimizerState & { hungry?: boolean }).hungry
  state.manualSpeeds = Boolean(state.manualSpeeds)

  const validTargets = producedTargetIds()
  const requestedTarget = String(state.target || 'coin')
  state.target = requestedTarget === 'coin' || validTargets.has(requestedTarget)
    ? requestedTarget
    : 'coin'

  state.guarantees = Array.isArray(incoming.guarantees)
    ? incoming.guarantees
        .map((guarantee) => {
          const status = guaranteeStatus(guarantee) as NonNullable<Guarantee['status']>
          return {
            item: String(guarantee.item || ''),
            perHour: Math.max(0, Number(guarantee.perHour || 0)),
            maximize: Boolean(guarantee.maximize),
            status,
            // Excluded degrades to disabled if an older build sees this state.
            enabled: status === 'enabled',
          }
        })
        .filter((guarantee) => validTargets.has(guarantee.item))
    : []

  if (!Object.keys(state.owned).length) {
    state.owned = defaultOwned()
  } else {
    for (const [legacy, current] of LEGACY_FORM_IDS) {
      if (state.owned[legacy] && !state.owned[current]) {
        state.owned[current] = { ...state.owned[legacy] }
      }
      if (legacy !== current) delete state.owned[legacy]
    }
  }

  for (const pal of DATA.pals) {
    const id = String(pal.id)
    if (!state.owned[id]) {
      state.owned[id] = {
        enabled: false,
        count: 1,
      }
    }
    state.owned[id].count = Math.max(1, Number(state.owned[id].count) || 1)
    if (pal.unavailable) state.owned[id].enabled = false
  }

  return state
}

export function loadState(): OptimizerState {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORE_KEY) || 'null') as LegacyState | null)
  } catch {
    return normalizeState()
  }
}

export function saveState(state: OptimizerState) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state))
}

export function resetState() {
  const next = normalizeState()
  saveState(next)
  return next
}

export function objectiveTargets() {
  const grouped = OBJECTIVE_TARGET_DEFS.map((item) => ({
    ...item,
    name: DATA.items[item.id]?.name || item.id,
  }))

  const rest = [...producedTargetIds()]
    .filter((id) => !GROUPED_OBJECTIVE_TARGET_IDS.has(id))
    .map((id) => ({
      id,
      name: DATA.items[id]?.name || id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return [...grouped, ...rest]
}
