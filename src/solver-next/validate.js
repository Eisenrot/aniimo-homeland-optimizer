import { evaluateClimateLayout } from '../climate.js'
import { isGrowerRecipe } from '../optimizer.js'
import {
  facilityStacks,
  globallyProducedItems,
  laborSeconds,
  recipeNetItem,
  recipeNetValue,
  recipeElectricDemand,
  utilityWorkerCount,
} from './domain.js'
import {
  ROSTER_RESIDENT_FACILITIES,
  ownedWorkerCopies,
  recipeRosterTasks,
  rosterWorkerCanDo,
} from './roster.js'
import { gridPowerEfficiency, totalGeneratorPower } from '../utility-system.js'
import { excludedObjectiveItems, isGuaranteeEnabled } from '../objective-status.js'

const EPS = 1e-5

function validateRosterPlan(plan, state, data) {
  const errors = []
  const roster = plan.roster
  if (!roster?.aware) return { errors, laborHours: null }

  const available = new Map(ownedWorkerCopies(state, data).map((worker) => [worker.key, worker]))
  const cap = Math.max(0, Math.floor(Number(state.workerSlots ?? state.teamSlots ?? 0) || 0))
  const selected = roster.selected || []
  const assignments = roster.assignments || []
  const selectedKeys = new Set(selected.map((worker) => worker.key))

  if (selected.length > cap + EPS) errors.push(`Roster uses ${selected.length} workers, cap ${cap}`)
  if (Number(roster.selectedCount || 0) !== selected.length) {
    errors.push(`Roster selectedCount mismatch: ${roster.selectedCount} vs ${selected.length}`)
  }

  for (const worker of selected) {
    if (!available.has(worker.key)) errors.push(`Roster selected unavailable worker ${worker.key}`)
  }

  const secondsByWorker = new Map()
  for (const assignment of assignments) {
    const worker = available.get(assignment.workerKey)
    if (!worker) {
      errors.push(`Roster assignment uses unavailable worker ${assignment.workerKey}`)
      continue
    }
    if (!selectedKeys.has(assignment.workerKey)) {
      errors.push(`Roster assignment uses unselected worker ${assignment.workerKey}`)
    }
    if (!rosterWorkerCanDo(worker, assignment.task || {})) {
      errors.push(`${assignment.workerKey} cannot perform ${assignment.task?.ability || 'unknown'} Lv.${assignment.task?.level || '?'}`)
    }
    const seconds = Math.max(0, Number(assignment.seconds || 0))
    secondsByWorker.set(assignment.workerKey, (secondsByWorker.get(assignment.workerKey) || 0) + seconds)
  }

  for (const [workerKey, seconds] of secondsByWorker) {
    if (seconds > 3600 + EPS) errors.push(`${workerKey} is booked for ${seconds}s in one hour`)
  }

  const cooling = plan.scenario?.coolingUnits || []
  const heat = plan.scenario?.heatUnits || []
  const utilityExpected = new Map([
    ['cooling:cool', cooling.filter((mode) => mode === 'Cool').length],
    ['cooling:freeze', cooling.filter((mode) => mode === 'Freeze').length],
    ['heat:warm', heat.filter((mode) => mode === 'Warm').length],
    ['heat:scorching', heat.filter((mode) => mode === 'Scorching').length],
    ['sunlamp', Math.max(0, Math.round(Number(plan.scenario?.sunlampCount || 0)))],
    ['generator', Math.max(0, Math.round(Number(plan.scenario?.generatorCount || 0)))],
  ])
  for (const [key, expected] of utilityExpected) {
    const actual = assignments.filter(
      (assignment) => assignment.kind === 'utility' && assignment.utilityKey === key,
    ).length
    if (actual !== expected) errors.push(`Utility staffing ${key}: ${actual} workers, expected ${expected}`)
  }

  for (const row of plan.rows || []) {
    if (row.recipe?.electric) continue
    const recipeId = String(row.recipe?.id)
    const baselineCycle = Math.max(0, Number(row.baselineCycleSeconds ?? row.cycleSeconds ?? 0))
    const baselineManual = Math.max(0, Number(row.baselineManualSeconds ?? row.manualSeconds ?? 0))
    const resident = ROSTER_RESIDENT_FACILITIES.has(row.facility)

    if (resident) {
      const residentAssignments = assignments.filter(
        (assignment) => assignment.kind === 'permanent' && String(assignment.recipeId) === recipeId,
      )
      const expectedUnits = Math.max(0, Math.round(Number(row.units || 0)))
      if (residentAssignments.length !== expectedUnits) {
        errors.push(`Resident staffing recipe ${recipeId}: ${residentAssignments.length} workers, expected ${expectedUnits}`)
      }
      const capacity = residentAssignments.reduce(
        (sum, assignment) => sum + (Number(assignment.cycle || 0) > EPS ? 3600 / Number(assignment.cycle) : 0),
        0,
      )
      if (Number(row.batchesPerHour || 0) > capacity + EPS) {
        errors.push(`Resident throughput recipe ${recipeId}: ${row.batchesPerHour} > ${capacity}`)
      }
      continue
    }

    const entry = {
      recipe: row.recipe,
      electric: false,
      labor: baselineManual,
      cycle: baselineCycle,
    }
    const tasks = recipeRosterTasks(entry)
    const flex = assignments.filter(
      (assignment) => assignment.kind === 'flex' && String(assignment.recipeId) === recipeId,
    )

    for (const task of tasks) {
      const supplied = flex
        .filter((assignment) => assignment.task?.key === task.key)
        .reduce(
          (sum, assignment) => sum + Number(assignment.seconds || 0) * Number(assignment.speed || 0),
          0,
        )
      const required = task.baselineSeconds * Number(row.batchesPerHour || 0)
      if (supplied + EPS < required) {
        errors.push(`Roster task ${recipeId}/${task.key}: ${supplied} < ${required}`)
      }
    }

    if (isGrowerRecipe(row.recipe)) {
      const occupied = Number(row.batchesPerHour || 0) * baselineCycle
      const capacity = Number(row.units || 0) * 3600
      if (occupied > capacity + EPS) errors.push(`Grower occupancy recipe ${recipeId}: ${occupied}s > ${capacity}s`)
    } else {
      const fixed = Math.max(0, baselineCycle - baselineManual)
      const workerSeconds = flex.reduce((sum, assignment) => sum + Number(assignment.seconds || 0), 0)
      const occupied = Number(row.batchesPerHour || 0) * fixed + workerSeconds
      const capacity = Number(row.units || 0) * 3600
      if (occupied > capacity + EPS) errors.push(`Roster occupancy recipe ${recipeId}: ${occupied}s > ${capacity}s`)
    }
  }

  return {
    errors,
    laborHours: [...secondsByWorker.values()].reduce((sum, seconds) => sum + seconds / 3600, 0),
  }
}

export function validateNextPlan(plan, state, data) {
  const errors = []
  if (!plan || plan.infeasible) return { ok: false, errors: ['Plan is infeasible or missing.'] }

  const rows = plan.rows || []
  const exclusions = excludedObjectiveItems(state)
  for (const row of rows) {
    if (Number(row.batchesPerHour || 0) <= EPS) continue
    const blocked = (row.recipe?.outputs || []).find((output) => exclusions.has(String(output.item)))
    if (blocked) errors.push(`Excluded item ${blocked.item} is still produced by recipe ${row.recipe?.id}`)
  }
  if (state.oneRecipePerFacility) {
    for (const row of rows) {
      if (Math.abs(Number(row.units || 0) - Math.round(Number(row.units || 0))) > EPS) {
        errors.push(`Non-integer units for recipe ${row.recipe?.id}`)
      }
    }
  }

  const byFacility = new Map()
  for (const row of rows) {
    const list = byFacility.get(row.facility) || []
    list.push(row)
    byFacility.set(row.facility, list)
  }

  for (const [facility, facilityRows] of byFacility) {
    const stacks = facilityStacks(state, facility)
    const levels = [...new Set(facilityRows.map((row) => Number(row.recipe?.level || 1)))].sort((a, b) => a - b)
    for (const level of levels) {
      const cap = stacks.filter((entry) => entry.level >= level).reduce((sum, entry) => sum + entry.count, 0)
      const used = facilityRows
        .filter((row) => Number(row.recipe?.level || 1) >= level)
        .reduce((sum, row) => sum + Number(row.units || 0), 0)
      if (used > cap + EPS) errors.push(`${facility} Lv.${level}+ uses ${used}, cap ${cap}`)
    }
  }

  const produced = globallyProducedItems(data)
  const consumed = new Set(rows.flatMap((row) => (row.recipe?.inputs || []).map((item) => Number(item.item))))
  for (const item of consumed) {
    if (!produced.has(item)) continue
    const net = rows.reduce(
      (sum, row) => sum + recipeNetItem(row.recipe, item) * Number(row.batchesPerHour || 0),
      0,
    )
    if (net < -EPS) errors.push(`Material ${item} balance is negative: ${net}`)
  }

  for (const guarantee of state.guarantees || []) {
    if (!isGuaranteeEnabled(guarantee) || guarantee.maximize) continue
    const minimum = Math.max(0, Number(guarantee.perHour || 0))
    if (minimum <= 0) continue
    const rate = rows.reduce(
      (sum, row) => sum + recipeNetItem(row.recipe, Number(guarantee.item)) * Number(row.batchesPerHour || 0),
      0,
    )
    if (rate + EPS < minimum) errors.push(`Guarantee ${guarantee.item}: ${rate} < ${minimum}`)
  }

  const scenario = plan.scenario || {}

  const electricRows = rows.filter((row) => row.recipe?.electric && Number(row.units || 0) > EPS)
  const powerDemand = electricRows.reduce(
    (sum, row) => sum + recipeElectricDemand(state, data, row.recipe) * Math.round(Math.max(0, Number(row.units || 0))),
    0,
  )
  const generatorCount = Math.max(0, Math.round(Number(scenario.generatorCount ?? (scenario.generator ? 1 : 0)) || 0))
  const powerSupply = totalGeneratorPower(generatorCount, Number(state.generatorLevel || 1))
  const powerEfficiency = powerDemand > 0 ? gridPowerEfficiency(powerSupply, powerDemand) : 0

  if (powerDemand > 0 && generatorCount <= 0) errors.push('Electric recipes are active without a Crackle Generator.')
  if (Math.abs(Number(scenario.powerDemand || 0) - powerDemand) > 1e-6) {
    errors.push(`Power demand mismatch: scenario=${scenario.powerDemand || 0}, rows=${powerDemand}`)
  }
  if (Math.abs(Number(scenario.powerSupply || 0) - powerSupply) > 1e-6) {
    errors.push(`Power supply mismatch: scenario=${scenario.powerSupply || 0}, expected=${powerSupply}`)
  }
  if (powerDemand > 0 && Math.abs(Number(scenario.powerEfficiency || 0) - powerEfficiency) > 1e-7) {
    errors.push(`Power efficiency mismatch: scenario=${scenario.powerEfficiency || 0}, expected=${powerEfficiency}`)
  }
  for (const row of electricRows) {
    const baseSeconds = Number(row.recipe?.growSeconds || 0)
    const expectedCycle = powerEfficiency > 1e-9 ? baseSeconds / powerEfficiency : Infinity
    if (Number.isFinite(expectedCycle) && Math.abs(Number(row.cycleSeconds || 0) - expectedCycle) > Math.max(1, expectedCycle) * 1e-6) {
      errors.push(`Electric cycle mismatch for recipe ${row.recipe?.id}: ${row.cycleSeconds} vs ${expectedCycle}`)
    }
  }

  let laborHours = 0
  if (plan.roster?.aware) {
    const rosterValidation = validateRosterPlan(plan, state, data)
    errors.push(...rosterValidation.errors)
    laborHours = Number(rosterValidation.laborHours || 0)
  } else {
    const workerRaw = state.workerSlots ?? state.teamSlots
    const workerLimit = Math.max(0, Number(workerRaw) || 0)
    laborHours = rows.reduce((sum, row) => {
      const seconds = laborSeconds(row.recipe, state, scenario, Number(row.cycleSeconds || 0))
      return sum + Number(row.batchesPerHour || 0) * seconds / 3600
    }, 0) + utilityWorkerCount(scenario)
    if (workerRaw != null && laborHours > workerLimit + EPS) {
      errors.push(`Worker capacity ${laborHours} > ${workerLimit}`)
    }
  }

  const climate = evaluateClimateLayout(plan, state, data, { maxOffset: 9 })
  if (!climate.feasible) errors.push(`Climate layout: ${climate.message || climate.status}`)

  const coin = rows.reduce(
    (sum, row) => sum + recipeNetValue(row.recipe, data) * Number(row.batchesPerHour || 0),
    0,
  )
  if (Math.abs(coin - Number(plan.ratePerHour || 0)) > Math.max(1, Math.abs(coin)) * 1e-6) {
    errors.push(`Coin rate mismatch: rows=${coin}, plan=${plan.ratePerHour}`)
  }

  return {
    ok: errors.length === 0,
    errors,
    climate,
    laborHours,
    power: {
      demand: powerDemand,
      supply: powerSupply,
      efficiency: powerEfficiency,
      generators: generatorCount,
    },
  }
}
