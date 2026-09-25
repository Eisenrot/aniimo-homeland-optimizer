import { DEFAULT_STATE } from '../src/defaults.js'
import { GAME_DATA } from '../src/data.js'
import type { GameData, OptimizerState } from './types'

export const DATA = GAME_DATA as GameData
export const STORE_KEY = 'aniimoHomelandOptimizerStateV1'

const MAX_ANIIMO_BY_HOMELAND = [0,5,8,11,14,17,20,22,24,26,28,30,32,34,36,38,40,42,43,44,45]

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
      enabled: !pal.isForm && !pal.unavailable,
      count: 1,
    }
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
    recipeNotes: { ...(incoming.recipeNotes || {}) },
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
  state.workerSlots = Math.min(cap, Math.max(1, Number(state.workerSlots) || 1))
  state.teamSlots = Math.min(
    cap,
    Math.max(1, Number(incoming.teamSlots ?? incoming.workerSlots ?? state.teamSlots) || 1),
  )
  state.collectHours = Math.max(0, Number(state.collectHours) || 0)
  state.oneRecipePerFacility = Boolean(state.oneRecipePerFacility)
  state.generatorAvailable = Boolean(state.generatorAvailable)
  state.hungry = Boolean(state.hungry)
  state.manualSpeeds = Boolean(state.manualSpeeds)
  state.target = String(state.target || 'coin')
  state.guarantees = Array.isArray(incoming.guarantees)
    ? incoming.guarantees.map((guarantee) => ({
        item: String(guarantee.item || ''),
        perHour: Math.max(0, Number(guarantee.perHour || 0)),
        maximize: Boolean(guarantee.maximize),
        enabled: guarantee.enabled !== false,
      }))
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
        enabled: !pal.isForm && !pal.unavailable,
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

export function producedTargets() {
  const ids = new Set<number>()
  for (const recipe of DATA.recipes) {
    for (const output of recipe.outputs || []) ids.add(Number(output.item))
  }
  return [...ids]
    .map((id) => ({ id: String(id), name: DATA.items[String(id)]?.name || String(id) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
