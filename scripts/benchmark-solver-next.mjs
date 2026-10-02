import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { GAME_DATA } from '../src/data.js'
import { DEFAULT_STATE } from '../src/defaults.js'
import { optimizePlan } from '../src/optimizer.js'
import { loadNextHighs, solveNextWithHighs, validateNextPlan } from '../src/solver-next/index.js'

function arg(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

function has(name) {
  return process.argv.includes(name)
}

const statePath = arg('--state')
let state
if (statePath) {
  state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''))
} else {
  state = structuredClone(DEFAULT_STATE)
}

console.log('Solver Next benchmark')
console.log(`state: ${statePath || 'DEFAULT_STATE'}`)
console.log(`RV: ${state.homelandLevel} · one-recipe: ${Boolean(state.oneRecipePerFacility)} · target: ${state.target || 'coin'}`)

const loadStarted = performance.now()
const highs = await loadNextHighs()
const loadMs = performance.now() - loadStarted
console.log(`HiGHS WASM loaded in ${loadMs.toFixed(1)} ms`)

const progress = has('--progress')
  ? (value) => console.log(`  [${value.phase}] cuts=${value.climateCuts ?? 0} ${value.detail || ''}`)
  : undefined

const started = performance.now()
const plan = await solveNextWithHighs(highs, structuredClone(state), GAME_DATA, {
  timeLimitSeconds: Number(arg('--time-limit') || 8),
  maxClimateCuts: Number(arg('--climate-cuts') || 24),
  onProgress: progress,
})
const elapsed = performance.now() - started
const validation = validateNextPlan(plan, state, GAME_DATA)

console.log('')
console.log('NEXT')
console.log(`  elapsed: ${elapsed.toFixed(1)} ms`)
console.log(`  coin/h: ${Number(plan.ratePerHour || 0).toFixed(3)}`)
console.log(`  target/h: ${Number(plan.targetRate || 0).toFixed(3)}`)
console.log(`  scenario: ${plan.scenarioLabel || 'n/a'}`)
if (Number(plan.scenario?.powerDemand || 0) > 0) {
  console.log(`  power: ${Number(plan.scenario.powerSupply || 0).toFixed(0)} / ${Number(plan.scenario.powerDemand || 0).toFixed(0)} = ${(Number(plan.scenario.powerEfficiency || 0) * 100).toFixed(2)}%`)
}
console.log(`  rows: ${plan.rows?.length || 0}`)
console.log(`  climate cuts: ${plan.optimizerStats?.climateCuts ?? 0}`)
console.log(`  MIP nodes: ${plan.optimizerStats?.mipNodes ?? ''}`)
console.log(`  MIP gap: ${plan.optimizerStats?.mipGap ?? ''}`)
console.log(`  model: ${plan.optimizerStats?.modelCols ?? 0} cols × ${plan.optimizerStats?.modelRows ?? 0} rows`)
console.log(`  validation: ${validation.ok ? 'OK' : 'FAILED'}`)
if (!validation.ok) {
  for (const error of validation.errors) console.log(`    - ${error}`)
}

if (has('--old')) {
  console.log('')
  console.log('LEGACY')
  const oldStarted = performance.now()
  const old = optimizePlan(structuredClone(state), GAME_DATA)
  const oldElapsed = performance.now() - oldStarted
  console.log(`  elapsed: ${oldElapsed.toFixed(1)} ms`)
  console.log(`  coin/h: ${Number(old.ratePerHour || 0).toFixed(3)}`)
  console.log(`  scenario: ${old.scenarioLabel || 'n/a'}`)
  console.log(`  candidates: ${old.optimizerStats?.candidatePlans ?? 0}`)
  console.log(`  climate offsets: ${old.optimizerStats?.climateOffsets ?? 0}`)
  console.log(`  next/legacy coin ratio: ${(Number(plan.ratePerHour || 0) / Math.max(1e-9, Number(old.ratePerHour || 0))).toFixed(6)}`)
  console.log(`  legacy/next time ratio: ${(oldElapsed / Math.max(0.1, elapsed)).toFixed(2)}x`)
}
