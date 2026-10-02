import { evaluateClimateLayout } from '../climate.js'
import {
  facilityStacks,
  globallyProducedItems,
  laborSeconds,
  recipeNetItem,
  recipeNetValue,
  recipeElectricDemand,
  utilityWorkerCount,
} from './domain.js'
import { gridPowerEfficiency, totalGeneratorPower } from '../utility-system.js'

const EPS = 1e-5

export function validateNextPlan(plan, state, data) {
  const errors = []
  if (!plan || plan.infeasible) return { ok: false, errors: ['Plan is infeasible or missing.'] }

  const rows = plan.rows || []
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
    if (guarantee.enabled === false || guarantee.maximize) continue
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

  const workerRaw = state.workerSlots ?? state.teamSlots
  const workerLimit = Math.max(0, Number(workerRaw) || 0)
  const laborHours = rows.reduce((sum, row) => {
    const seconds = laborSeconds(row.recipe, state, scenario, Number(row.cycleSeconds || 0))
    return sum + Number(row.batchesPerHour || 0) * seconds / 3600
  }, 0) + utilityWorkerCount(scenario)
  if (workerRaw != null && laborHours > workerLimit + EPS) {
    errors.push(`Worker capacity ${laborHours} > ${workerLimit}`)
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