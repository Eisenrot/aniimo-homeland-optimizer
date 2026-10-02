import type { OptimizerState } from './types'

export const PRESET_STORE_KEY = 'aniimoOptimizerPresetsV1'
const SHARE_VERSION = 1
const SHARE_HASH_PREFIX = '#preset='

export type PresetSnapshot = Pick<
  OptimizerState,
  | 'homelandLevel'
  | 'workerSlots'
  | 'teamSlots'
  | 'abilityLevel'
  | 'collectHours'
  | 'oneRecipePerFacility'
  | 'preferElectricalAutomation'
  | 'maximizeElectricalCoverage'
  | 'generatorAvailable'
  | 'generatorLevel'
  | 'utilityCounts'
  | 'manualSpeeds'
  | 'climateOptions'
  | 'target'
  | 'guarantees'
  | 'goal'
  | 'facilities'
  | 'modules'
  | 'speeds'
  | 'recipeNotes'
>

export type OptimizerPreset = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  state: PresetSnapshot
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function snapshotPresetState(state: OptimizerState): PresetSnapshot {
  return clone({
    homelandLevel: state.homelandLevel,
    workerSlots: state.workerSlots,
    teamSlots: state.teamSlots,
    abilityLevel: state.abilityLevel,
    collectHours: state.collectHours,
    oneRecipePerFacility: state.oneRecipePerFacility,
    preferElectricalAutomation: state.preferElectricalAutomation,
    maximizeElectricalCoverage: state.maximizeElectricalCoverage,
    generatorAvailable: state.generatorAvailable,
    generatorLevel: state.generatorLevel,
    utilityCounts: state.utilityCounts,
    manualSpeeds: state.manualSpeeds,
    climateOptions: state.climateOptions,
    target: state.target,
    guarantees: state.guarantees,
    goal: state.goal,
    facilities: state.facilities,
    modules: state.modules,
    speeds: state.speeds,
    recipeNotes: state.recipeNotes,
  })
}

export function readPresets(): OptimizerPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESET_STORE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.name === 'string' && entry.state)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString(),
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date(0).toISOString(),
        state: entry.state as PresetSnapshot,
      }))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  } catch {
    return []
  }
}

export function writePresets(presets: OptimizerPreset[]) {
  localStorage.setItem(PRESET_STORE_KEY, JSON.stringify(presets))
}

export function createPresetId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function encodeBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function buildShareUrl(state: OptimizerState) {
  const payload = encodeBase64Url(JSON.stringify({
    v: SHARE_VERSION,
    state: snapshotPresetState(state),
  }))
  const url = new URL('./', window.location.href)
  url.hash = `preset=${payload}`
  return url.toString()
}

export function readSharedPresetFromLocation(): PresetSnapshot | null {
  if (!window.location.hash.startsWith(SHARE_HASH_PREFIX)) return null
  const encoded = window.location.hash.slice(SHARE_HASH_PREFIX.length)
  if (!encoded || encoded.length > 30000) return null
  try {
    const payload = JSON.parse(decodeBase64Url(encoded))
    if (payload?.v !== SHARE_VERSION || !payload?.state || typeof payload.state !== 'object') return null
    return payload.state as PresetSnapshot
  } catch {
    return null
  }
}

export function clearSharedPresetFromLocation() {
  if (!window.location.hash.startsWith(SHARE_HASH_PREFIX)) return
  const url = new URL(window.location.href)
  url.hash = ''
  window.history.replaceState(null, '', url.toString())
}