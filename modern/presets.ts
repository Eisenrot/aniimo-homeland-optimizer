import LZString from 'lz-string'

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZString
import type { OptimizerState } from './types'

export const PRESET_STORE_KEY = 'aniimoOptimizerPresetsV1'
export const DEFAULT_PRESET_KEY = 'aniimoOptimizerDefaultPresetV1'
const SHARE_VERSION = 2
const LEGACY_SHARE_VERSION = 1
const LEGACY_SHARE_HASH_PREFIX = '#preset='
const SHARE_HASH_PREFIX = '#code='
const SHARE_CODE_PREFIX = 'AH1.'

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

export function readDefaultPresetId() {
  try {
    return localStorage.getItem(DEFAULT_PRESET_KEY) || null
  } catch {
    return null
  }
}

export function writeDefaultPresetId(id: string | null) {
  if (id) localStorage.setItem(DEFAULT_PRESET_KEY, id)
  else localStorage.removeItem(DEFAULT_PRESET_KEY)
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

function parseCompactCode(value: string): PresetSnapshot | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith(SHARE_CODE_PREFIX)) return null
  const encoded = trimmed.slice(SHARE_CODE_PREFIX.length)
  if (!encoded || encoded.length > 12000) return null
  try {
    const json = decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const payload = JSON.parse(json)
    if (payload?.v !== SHARE_VERSION || !payload?.s || typeof payload.s !== 'object') return null
    return payload.s as PresetSnapshot
  } catch {
    return null
  }
}

function parseLegacyPayload(encoded: string): PresetSnapshot | null {
  if (!encoded || encoded.length > 30000) return null
  try {
    const payload = JSON.parse(decodeBase64Url(encoded))
    if (payload?.v !== LEGACY_SHARE_VERSION || !payload?.state || typeof payload.state !== 'object') return null
    return payload.state as PresetSnapshot
  } catch {
    return null
  }
}

export function buildShareCodeFromSnapshot(snapshot: PresetSnapshot) {
  const encoded = compressToEncodedURIComponent(JSON.stringify({
    v: SHARE_VERSION,
    s: snapshot,
  }))
  return `${SHARE_CODE_PREFIX}${encoded}`
}

export function buildShareCode(state: OptimizerState) {
  return buildShareCodeFromSnapshot(snapshotPresetState(state))
}

export function buildShareUrlFromSnapshot(snapshot: PresetSnapshot) {
  const url = new URL('./', window.location.href)
  url.hash = `code=${buildShareCodeFromSnapshot(snapshot)}`
  return url.toString()
}

export function buildShareUrl(state: OptimizerState) {
  return buildShareUrlFromSnapshot(snapshotPresetState(state))
}

export function parseSharedPresetInput(input: string): PresetSnapshot | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const direct = parseCompactCode(trimmed)
  if (direct) return direct

  if (trimmed.startsWith(SHARE_HASH_PREFIX)) {
    return parseCompactCode(decodeURIComponent(trimmed.slice(SHARE_HASH_PREFIX.length)))
  }
  if (trimmed.startsWith(LEGACY_SHARE_HASH_PREFIX)) {
    return parseLegacyPayload(trimmed.slice(LEGACY_SHARE_HASH_PREFIX.length))
  }

  try {
    const url = new URL(trimmed)
    if (url.hash.startsWith(SHARE_HASH_PREFIX)) {
      return parseCompactCode(decodeURIComponent(url.hash.slice(SHARE_HASH_PREFIX.length)))
    }
    if (url.hash.startsWith(LEGACY_SHARE_HASH_PREFIX)) {
      return parseLegacyPayload(url.hash.slice(LEGACY_SHARE_HASH_PREFIX.length))
    }
  } catch {
    // Raw code/hash input is handled above.
  }
  return null
}

export function readSharedPresetFromLocation(): PresetSnapshot | null {
  return parseSharedPresetInput(window.location.href)
}

export function clearSharedPresetFromLocation() {
  if (!window.location.hash.startsWith(SHARE_HASH_PREFIX) && !window.location.hash.startsWith(LEGACY_SHARE_HASH_PREFIX)) return
  const url = new URL(window.location.href)
  url.hash = ''
  window.history.replaceState(null, '', url.toString())
}
