import { performance } from 'node:perf_hooks'
import loadHighs from 'highs'
import { GAME_DATA as DATA } from '../src/data.js'
import { DEFAULT_STATE } from '../src/defaults.js'
import { fillHomelandForRV } from '../src/progression.js'
import {
  cycleSeconds,
  optimizePlan,
  recipeExecutionVariants,
  recipeNetItem,
  recipeNetValue,
  recipeRunnable,
} from '../src/optimizer.js'

const clone = (value) => structuredClone(value)

function populated(rv) {
  const state = fillHomelandForRV({ ...clone(DEFAULT_STATE), homelandLevel: rv }, DATA)
  state.oneRecipePerFacility = true
  state.workerSlots = 999
  state.teamSlots = 999
  state.collectHours = 0
  state.climateOptions = { cooling: false, heat: false, sunlamp: false }
  state.generatorAvailable = false
  state.target = 'coin'
  state.guarantees = []
  state.owned = {}
  for (const pal of DATA.pals) {
    state.owned[String(pal.id)] = { enabled: !pal.unavailable, count: 99 }
  }
  return state
}

function stacks(state, slug) {
  const cfg = state.facilities?.[slug]
  if (!cfg) return []
  if (Array.isArray(cfg.stacks)) {
    return cfg.stacks
      .filter((entry) => Number(entry.count || 0) > 0)
      .map((entry) => ({ count: Number(entry.count || 0), level: Number(entry.level || 1) }))
  }
  return Number(cfg.count || 0) > 0
    ? [{ count: Number(cfg.count || 0), level: Number(cfg.level || 1) }]
    : []
}

function exactRecipes(state) {
  const scenario = { cooling: null, heat: null, sunlamp: false, generator: false }
  const out = []
  for (const recipe of DATA.recipes) {
    if (!recipeRunnable(recipe, state, DATA, scenario)) continue
    for (const variant of recipeExecutionVariants(recipe, scenario)) {
      const cycle = cycleSeconds(variant, state, scenario)
      if (!Number.isFinite(cycle) || cycle <= 0) continue
      out.push({ recipe: variant, cycle })
    }
  }
  return out
}

function csr(rows, cols) {
  const starts = [0]
  const indices = []
  const values = []
  for (const row of rows) {
    for (const [col, value] of row) {
      if (Math.abs(value) <= 1e-14) continue
      indices.push(col)
      values.push(value)
    }
    starts.push(indices.length)
  }
  return {
    format: 'csr',
    numRows: rows.length,
    numCols: cols,
    starts,
    indices,
    values,
  }
}

function solveExactUnits(highs, state) {
  const active = exactRecipes(state)
  const n = active.length
  const cols = n * 2
  const rateCol = (index) => index
  const unitCol = (index) => n + index
  const rows = []
  const lower = []
  const upper = []

  // rate * cycleHours <= assigned whole facility units
  for (let i = 0; i < n; i++) {
    rows.push([
      [rateCol(i), active[i].cycle / 3600],
      [unitCol(i), -1],
    ])
    lower.push(-highs.infinity)
    upper.push(0)
  }

  // Exact per-level facility capacity.
  const facilities = [...new Set(active.map(({ recipe }) => recipe.facility))]
  for (const slug of facilities) {
    const owned = stacks(state, slug)
    const thresholds = [...new Set(
      active
        .filter(({ recipe }) => recipe.facility === slug)
        .map(({ recipe }) => Number(recipe.level || 1)),
    )].sort((a, b) => a - b)

    for (const level of thresholds) {
      const cap = owned.filter((entry) => entry.level >= level).reduce((sum, entry) => sum + entry.count, 0)
      if (cap <= 0) continue
      const terms = []
      for (let i = 0; i < n; i++) {
        const recipe = active[i].recipe
        if (recipe.facility === slug && Number(recipe.level || 1) >= level) terms.push([unitCol(i), 1])
      }
      if (terms.length) {
        rows.push(terms)
        lower.push(-highs.infinity)
        upper.push(cap)
      }
    }
  }

  // Internal material balance: made >= consumed.
  const globallyProduced = new Set(DATA.recipes.flatMap((recipe) => (recipe.outputs || []).map((item) => Number(item.item))))
  const consumed = new Set(active.flatMap(({ recipe }) => (recipe.inputs || []).map((item) => Number(item.item))))
  for (const item of consumed) {
    if (!globallyProduced.has(item)) continue
    const terms = []
    for (let i = 0; i < n; i++) {
      const net = recipeNetItem(active[i].recipe, item)
      if (Math.abs(net) > 1e-14) terms.push([rateCol(i), -net])
    }
    if (terms.length) {
      rows.push(terms)
      lower.push(-highs.infinity)
      upper.push(0)
    }
  }

  const facilityCaps = active.map(({ recipe }) => stacks(state, recipe.facility).reduce((sum, entry) => sum + entry.count, 0))
  const model = highs.createModel({
    modelName: 'aniimo-exact-units',
    numCols: cols,
    numRows: rows.length,
    sense: highs.constants.objectiveSense.maximize,
    colCost: [
      ...active.map(({ recipe }) => recipeNetValue(recipe, DATA)),
      ...Array(n).fill(0),
    ],
    colLower: Array(cols).fill(0),
    colUpper: [
      ...Array(n).fill(highs.infinity),
      ...facilityCaps,
    ],
    integrality: [
      ...Array(n).fill(highs.constants.variableType.continuous),
      ...Array(n).fill(highs.constants.variableType.integer),
    ],
    rowLower: lower,
    rowUpper: upper,
    matrix: csr(rows, cols),
  })

  try {
    model.options.set({
      output_flag: false,
      presolve: 'on',
      solver: 'choose',
      mip_rel_gap: 0,
      mip_abs_gap: 1e-7,
      time_limit: 30,
    })
    const started = performance.now()
    model.run()
    const ms = performance.now() - started
    const status = model.getModelStatus()
    if (status !== highs.constants.modelStatus.optimal) {
      throw new Error(`HiGHS MIP ended with model status ${status}`)
    }
    const solution = model.getSolution()
    const rate = Array.from(solution.colValue.slice(0, n), Number)
    const units = Array.from(solution.colValue.slice(n), Number)
    const coin = active.reduce((sum, entry, i) => sum + Math.max(0, rate[i]) * recipeNetValue(entry.recipe, DATA), 0)
    return {
      coin,
      ms,
      rows: rate.filter((value) => value > 1e-8).length,
      units: units.reduce((sum, value) => sum + Math.round(Math.max(0, value)), 0),
      nodes: String(model.info.get('mip_node_count') ?? ''),
    }
  } finally {
    model.dispose()
  }
}

console.log('Loading HiGHS MIP…')
const highs = await loadHighs()
console.log('RV | heuristic coin/h | exact coin/h | gap | heuristic ms | MIP ms | MIP nodes')

for (const rv of [8, 10, 12, 15, 20]) {
  const state = populated(rv)

  const started = performance.now()
  const heuristic = optimizePlan(clone(state), DATA)
  const heuristicMs = performance.now() - started

  const exact = solveExactUnits(highs, state)
  const gap = (exact.coin - heuristic.ratePerHour) / Math.max(1, exact.coin)

  if (heuristic.ratePerHour > exact.coin * (1 + 1e-6)) {
    throw new Error(`RV${rv}: heuristic exceeded integer optimum: ${heuristic.ratePerHour} > ${exact.coin}`)
  }

  console.log(
    `RV${rv} | ${heuristic.ratePerHour.toFixed(2)} | ${exact.coin.toFixed(2)} | ${(gap * 100).toFixed(4)}% | ${heuristicMs.toFixed(1)} | ${exact.ms.toFixed(1)} | ${exact.nodes}`,
  )
}

console.log('Exact unit MIP benchmark passed')
