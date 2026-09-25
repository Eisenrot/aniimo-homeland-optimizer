import { DEFAULT_STATE } from '../src/defaults.js'
import { GAME_DATA } from '../src/data.js'
import type { GameData, OptimizerState } from './types'

export const DATA = GAME_DATA as GameData
export const STORE_KEY = 'aniimoHomelandOptimizerStateV1'

const MAX_ANIIMO_BY_HOMELAND = [0,5,8,11,14,17,20,22,24,26,28,30,32,34,36,38,40,42,43,44,45]

export function maxAniimoForLevel(level: number) {
  return MAX_ANIIMO_BY_HOMELAND[Math.min(20, Math.max(1, Math.floor(Number(level) || 1)))] || 5
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function defaultOwned() {
  const out: OptimizerState['owned'] = {}
  const pals = (GAME_DATA as { pals?: Array<{ id: number; isForm?: boolean; unavailable?: boolean }> }).pals || []
  for (const pal of pals) {
    out[String(pal.id)] = { enabled: !pal.isForm && !pal.unavailable, count: 1 }
  }
  return out
}

export function normalizeState(raw?: Partial<OptimizerState> | null): OptimizerState {
  const base = clone(DEFAULT_STATE) as OptimizerState
  const incoming = clone(raw || {}) as Partial<OptimizerState>
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

  state.homelandLevel = Math.min(20, Math.max(1, Number(state.homelandLevel) || 1))
  const cap = maxAniimoForLevel(state.homelandLevel)
  state.workerSlots = Math.min(cap, Math.max(1, Number(state.workerSlots) || 1))
  state.teamSlots = Math.min(cap, Math.max(1, Number(state.teamSlots || state.workerSlots) || 1))
  state.collectHours = Math.max(0, Number(state.collectHours) || 0)
  state.target = String(state.target || 'coin')
  state.guarantees = Array.isArray(state.guarantees) ? state.guarantees : []

  if (!Object.keys(state.owned).length) state.owned = defaultOwned()

  const pals = (GAME_DATA as { pals?: Array<{ id: number; isForm?: boolean; unavailable?: boolean }> }).pals || []
  for (const pal of pals) {
    const id = String(pal.id)
    if (!state.owned[id]) state.owned[id] = { enabled: !pal.isForm && !pal.unavailable, count: 1 }
    if (pal.unavailable) state.owned[id].enabled = false
  }

  return state
}

export function loadState(): OptimizerState {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORE_KEY) || 'null'))
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
