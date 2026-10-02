import {
  defaultRecipeEfficiencyPct,
  displayedEfficiencyMultiplier,
  familyId,
  isGrowerRecipe,
  manualWorkload,
  recipeUsesMeasuredEfficiency,
  recipeWorkSteps,
} from '../optimizer.js'
import { generatorLightningAtLevel } from '../utility-system.js'

export const ROSTER_RESIDENT_FACILITIES = new Set([
  'mine',
  'well',
  'dewy-house',
  'tidewhisper-sandcastle',
  'nimbus-bed',
  'starfall-hammock',
  'floral-windmill',
])

export function ownedWorkerCopies(state, data) {
  const out = []
  for (const pal of data.pals || []) {
    const owned = state.owned?.[String(pal.id)] ?? state.owned?.[pal.name]
    if (!owned?.enabled) continue
    const count = Math.max(0, Math.floor(Number(owned.count || 0)))
    for (let copy = 1; copy <= count; copy++) {
      out.push({
        index: out.length,
        key: `${pal.id}#${copy}`,
        copy,
        pal,
      })
    }
  }
  return out
}

export function rosterWorkerCanDo(worker, task) {
  const pal = worker?.pal || worker
  if (!pal) return false
  if (Number(pal.abilities?.[task.ability] || 0) < Number(task.level || 0)) return false
  if (task.family && familyId(pal.id) !== Number(task.family)) return false
  return true
}

export function recipeRosterTasks(entry) {
  if (entry.electric || Number(entry.labor || 0) <= 1e-12) return []
  const recipe = entry.recipe
  const steps = recipeWorkSteps(recipe)
  if (!steps.length) return []

  const rawTotal = manualWorkload(recipe)
  if (rawTotal <= 1e-12) return []

  const family = recipe.pet ? familyId(recipe.pet) : null
  const raw = new Map()
  const add = (step, amount) => {
    const weight = Math.max(0, Number(amount || 0))
    if (!step || weight <= 1e-12) return
    const key = `${step.ability}|${Number(step.level || 1)}|${family || ''}`
    const current = raw.get(key) || {
      key,
      ability: step.ability,
      level: Math.max(1, Number(step.level || 1)),
      family,
      raw: 0,
    }
    current.raw += weight
    raw.set(key, current)
  }

  if (Number(recipe.workload || 0) > 0) add(steps[0], Number(recipe.workload || 0))
  for (const step of steps) add(step, Number(step.workload || 0))

  return [...raw.values()].map((task) => ({
    ...task,
    baselineSeconds: Number(entry.labor || 0) * task.raw / rawTotal,
  }))
}

export function workerTaskSpeed(entry, worker, task, state) {
  if (!rosterWorkerCanDo(worker, task)) return 0
  if (state.manualSpeeds || !recipeUsesMeasuredEfficiency(entry.recipe)) return 1

  const level = Number((worker.pal || worker).abilities?.[task.ability] || 0)
  const actual = displayedEfficiencyMultiplier(entry.recipe, level, false)
  const baseline = Math.max(0.01, defaultRecipeEfficiencyPct(entry.recipe) / 100)
  return actual > 0 ? actual / baseline : 0
}

export function workerAdjustedCycle(entry, worker, task, state) {
  const speed = workerTaskSpeed(entry, worker, task, state)
  if (speed <= 1e-12) return Infinity
  if (isGrowerRecipe(entry.recipe)) return Number(entry.cycle || 0)

  const fixed = Math.max(0, Number(entry.cycle || 0) - Number(entry.labor || 0))
  return fixed + Number(entry.labor || 0) / speed
}

export function rosterWorkerArchetypes(state, data, entries) {
  const workers = ownedWorkerCopies(state, data)
  const utilities = utilityRosterSpecs(state)
  const groups = new Map()

  for (const worker of workers) {
    const capabilities = []
    for (const entry of entries) {
      if (entry.electric) continue
      const tasks = recipeRosterTasks(entry)
      if (ROSTER_RESIDENT_FACILITIES.has(entry.recipe.facility)) {
        const task = tasks[0]
        const cycle = task && rosterWorkerCanDo(worker, task)
          ? workerAdjustedCycle(entry, worker, task, state)
          : Infinity
        capabilities.push(Number.isFinite(cycle) && cycle > 0 ? 3600 / cycle : 0)
        continue
      }
      for (const task of tasks) capabilities.push(workerTaskSpeed(entry, worker, task, state))
    }
    for (const spec of utilities) capabilities.push(rosterWorkerCanDo(worker, spec) ? 1 : 0)

    const key = capabilities.map((value) => value.toFixed(9)).join('|')
    const group = groups.get(key) || { capabilities, workers: [] }
    group.workers.push(worker)
    groups.set(key, group)
  }

  const archetypes = [...groups.values()].map((group, index) => ({
    key: `archetype:${index}`,
    count: group.workers.length,
    representative: group.workers[0],
    workers: group.workers,
    capabilities: group.capabilities,
  }))

  const cap = Math.max(0, Math.floor(Number(state.workerSlots ?? state.teamSlots ?? 0) || 0))
  if (cap <= 0) return archetypes

  const dominates = (left, right) => {
    let strictlyBetter = false
    for (let index = 0; index < left.capabilities.length; index++) {
      const a = Number(left.capabilities[index] || 0)
      const b = Number(right.capabilities[index] || 0)
      if (a + 1e-9 < b) return false
      if (a > b + 1e-9) strictlyBetter = true
    }
    return strictlyBetter
  }

  // If the roster already owns enough strictly-better substitutes to fill the
  // entire team cap, this archetype can stay home and enjoy the event snacks.
  return archetypes.filter((candidate, candidateIndex) => {
    let betterCopies = 0
    for (let index = 0; index < archetypes.length; index++) {
      if (index === candidateIndex) continue
      const other = archetypes[index]
      if (dominates(other, candidate)) betterCopies += other.count
      if (betterCopies >= cap) return false
    }
    return true
  })
}
export function utilityRosterSpecs(state) {
  return [
    { key: 'cooling:cool', utility: 'cooling', mode: 'Cool', ability: 'Ice', level: 1 },
    { key: 'cooling:freeze', utility: 'cooling', mode: 'Freeze', ability: 'Ice', level: 2 },
    { key: 'heat:warm', utility: 'heat', mode: 'Warm', ability: 'Fire', level: 1 },
    { key: 'heat:scorching', utility: 'heat', mode: 'Scorching', ability: 'Fire', level: 2 },
    { key: 'sunlamp', utility: 'sunlamp', mode: 'Adequate', ability: 'Light', level: 1 },
    {
      key: 'generator',
      utility: 'generator',
      mode: 'Generator',
      ability: 'Lightning',
      level: generatorLightningAtLevel(Number(state.generatorLevel || 1)),
    },
  ]
}