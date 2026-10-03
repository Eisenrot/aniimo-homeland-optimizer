import { GAME_DATA } from './src/data.js'
import { DEFAULT_STATE } from './src/defaults.js'
import { diagnoseFixedPlanRoster } from './src/solver-next/roster-diagnostics.js'
import { loadNextHighs, solveNextWithHighs } from './src/solver-next/index.js'

function baseState() {
  return {
    ...structuredClone(DEFAULT_STATE),
    homelandLevel: 20,
    workerSlots: 20,
    teamSlots: 20,
    owned: {},
    facilities: {},
    utilityCounts: { cooling: 0, heat: 0, sunlamp: 0, generator: 0, powerPole: 0 },
  }
}

function recipe(id) {
  const found = GAME_DATA.recipes.find((item) => String(item.id) === String(id))
  if (!found) throw new Error(`missing fixture recipe ${id}`)
  return found
}

function enableFamily(state, familyIds) {
  for (const id of familyIds) {
    state.owned[String(id)] = { enabled: true, count: 1 }
  }
}

// Resident-family blocker should explain why raising the team cap does nothing.
{
  const state = baseState()
  state.facilities['tidewhisper-sandcastle'] = { count: 1, level: 2 }

  const plan = {
    rows: [{
      facility: 'tidewhisper-sandcastle',
      recipe: recipe(4020060),
      batchesPerHour: 2,
      units: 1,
      manualSeconds: 1800,
      cycleSeconds: 1800,
    }],
    scenario: {},
  }

  const diagnosis = diagnoseFixedPlanRoster(plan, state, GAME_DATA)
  if (diagnosis.kind !== 'resident-shortage') {
    throw new Error(`missing resident should report resident-shortage, got ${diagnosis.kind}`)
  }
  if (!/Tidewhisper Sandcastle/i.test(diagnosis.message) || !/Leisure Lv\.2/i.test(diagnosis.message)) {
    throw new Error('resident diagnosis does not name the blocked structure / ability')
  }
  if (!/More team slots will not help/i.test(diagnosis.message)) {
    throw new Error('resident diagnosis should explicitly reject the slot-count red herring')
  }

  enableFamily(state, [1017100])
  const underleveled = diagnoseFixedPlanRoster(plan, state, GAME_DATA)
  if (underleveled.kind !== 'resident-shortage' || !/none reach Leisure Lv\.2/i.test(underleveled.message)) {
    throw new Error('underleveled resident family should be diagnosed separately')
  }

  state.owned = {}
  enableFamily(state, [1017200])
  const covered = diagnoseFixedPlanRoster(plan, state, GAME_DATA)
  if (covered.kind === 'resident-shortage') {
    throw new Error('enabled qualified resident should clear the family shortage')
  }
}

// Static utility blocker should report the exact utility skill instead of generic failure.
{
  const state = baseState()
  state.utilityCounts.heat = 1

  const plan = {
    rows: [],
    scenario: {
      heat: 'Scorching',
      heatUnits: ['Scorching'],
      heatCount: 1,
    },
  }

  const diagnosis = diagnoseFixedPlanRoster(plan, state, GAME_DATA)
  if (diagnosis.kind !== 'utility-shortage') {
    throw new Error(`missing utility worker should report utility-shortage, got ${diagnosis.kind}`)
  }
  if (!/Heat Furnace/i.test(diagnosis.message) || !/Fire Lv\.2/i.test(diagnosis.message)) {
    throw new Error('utility diagnosis does not name Heat Furnace / Fire Lv.2')
  }
}

// Even a perfect roster cannot fit more mandatory full-time jobs than the cap.
{
  const state = baseState()
  state.workerSlots = 1
  state.teamSlots = 1
  state.utilityCounts.heat = 1
  state.facilities['tidewhisper-sandcastle'] = { count: 1, level: 2 }
  enableFamily(state, [1017100, 1005100, 1005200])

  const plan = {
    rows: [{
      facility: 'tidewhisper-sandcastle',
      recipe: recipe(4020060),
      batchesPerHour: 2,
      units: 1,
      manualSeconds: 1800,
      cycleSeconds: 1800,
    }],
    scenario: {
      heat: 'Warm',
      heatUnits: ['Warm'],
      heatCount: 1,
    },
  }

  const diagnosis = diagnoseFixedPlanRoster(plan, state, GAME_DATA)
  if (diagnosis.kind !== 'cap' || !/at least 2/i.test(diagnosis.message)) {
    throw new Error('mandatory full-time cap shortage was not diagnosed')
  }
}

// Flexible recipe with no qualified worker should name the missing ability.
{
  const state = baseState()
  state.facilities['crafting-table'] = { count: 1, level: 5 }

  const crafting = GAME_DATA.recipes.find((item) =>
    item.facility === 'crafting-table'
    && !item.electric
    && (item.steps || []).some((step) => step.ability === 'Artisanship'))
  if (!crafting) throw new Error('missing Artisanship crafting fixture')

  const plan = {
    rows: [{
      facility: 'crafting-table',
      recipe: crafting,
      batchesPerHour: 1,
      units: 1,
      manualSeconds: Number(crafting.workload || 1800),
      cycleSeconds: Number(crafting.workload || 1800),
    }],
    scenario: {},
  }

  const diagnosis = diagnoseFixedPlanRoster(plan, state, GAME_DATA)
  if (diagnosis.kind !== 'ability-shortage' || !/Artisanship/i.test(diagnosis.message)) {
    throw new Error('missing flexible ability was not diagnosed')
  }
}

// Fixed Team must keep a theoretically valid resident recipe in the model
// even when the actual owned family is too weak to staff it.
{
  const state = baseState()
  state.homelandLevel = 20
  state.workerSlots = 2
  state.teamSlots = 2
  state.abilityLevel = 3
  state.oneRecipePerFacility = true
  state.facilities['tidewhisper-sandcastle'] = { count: 1, level: 2 }
  state.modules['resource-detector'] = 2
  state.target = String(recipe(4020060).outputs?.[0]?.item)
  state.guarantees = []
  state.owned['1017100'] = { enabled: true, count: 1 }

  const highs = await loadNextHighs()
  const plan = await solveNextWithHighs(highs, state, GAME_DATA, {
    timeLimitSeconds: 2,
    maxClimateCuts: 4,
    mipRelativeGap: 0,
  })
  if (plan.infeasible || !(plan.rows || []).some((row) => String(row.recipe?.id) === '4020060')) {
    throw new Error('theoretical Plan lost the Sandcastle resident recipe')
  }

  const staffed = await solveNextWithHighs(highs, state, GAME_DATA, {
    rosterAware: true,
    fixedPlan: plan,
    objectiveWeights: plan.objectiveWeights,
    timeLimitSeconds: 2,
    maxClimateCuts: 4,
    mipRelativeGap: 0,
  })
  if (!staffed.infeasible) {
    throw new Error('underleveled basic Susuta should not fully staff the fixed Sandcastle Plan')
  }

  const diagnosis = diagnoseFixedPlanRoster(plan, state, GAME_DATA)
  if (diagnosis.kind !== 'resident-shortage' || !/none reach Leisure Lv\.2/i.test(diagnosis.message)) {
    throw new Error('fixed-plan underleveled resident regression was not explained')
  }
}

// Fixed Team must keep a visible resident row even when Owned Aniimo cannot
// staff it. Missing staff should make the solve infeasible, not make the row
// mysteriously vanish before we can explain what went wrong.
{
  const state = baseState()
  state.abilityLevel = 3
  state.facilities['tidewhisper-sandcastle'] = { count: 1, level: 2 }
  state.owned['1017100'] = { enabled: true, count: 1 } // Susuta itself: Leisure 1.

  const row = {
    facility: 'tidewhisper-sandcastle',
    recipe: recipe(4020060),
    batchesPerHour: 2,
    units: 1,
    manualSeconds: 1800,
    cycleSeconds: 1800,
    baselineManualSeconds: 1800,
    baselineCycleSeconds: 1800,
    effectiveEnv: null,
  }
  const plan = {
    ratePerHour: 0,
    targetRate: 0,
    objectiveRate: 0,
    rows: [row],
    scenario: {},
    objectiveWeights: [],
  }

  const highs = await loadNextHighs()
  const staffed = await solveNextWithHighs(highs, state, GAME_DATA, {
    rosterAware: true,
    fixedPlan: plan,
    objectiveWeights: [],
    timeLimitSeconds: 2,
    maxClimateCuts: 4,
    mipRelativeGap: 0,
  })
  if (!staffed.infeasible) {
    throw new Error('underleveled fixed resident should make Team infeasible')
  }

  const diagnosis = diagnoseFixedPlanRoster(plan, state, GAME_DATA)
  if (diagnosis.kind !== 'resident-shortage' || !/none reach Leisure Lv\.2/i.test(diagnosis.message)) {
    throw new Error('fixed resident infeasibility did not preserve the useful blocker diagnosis')
  }
}

console.log('fixed-plan roster diagnostics OK')