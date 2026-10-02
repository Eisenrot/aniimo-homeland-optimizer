import { performance } from 'node:perf_hooks'
import loadHighs from 'highs'
import { GAME_DATA as DATA } from '../src/data.js'
import { DEFAULT_STATE } from '../src/defaults.js'
import {
  optimizePlan,
  planItemRates,
  resetLpSolver,
  setLpSolver,
} from '../src/optimizer.js'
import { createHighsLpSolver } from './highs-lp.mjs'

const clone = (value) => structuredClone(value)

function populatedBase() {
  const state = clone(DEFAULT_STATE)
  state.owned = {}
  for (const pal of DATA.pals) {
    state.owned[String(pal.id)] = {
      enabled: !pal.unavailable,
      count: 1,
    }
  }
  return state
}

const scenarios = [
  {
    name: 'default-coin',
    state: populatedBase(),
  },
  {
    name: 'all-climate',
    state: (() => {
      const state = populatedBase()
      state.climateOptions = { cooling: true, heat: true, sunlamp: true }
      return state
    })(),
  },
  {
    name: 'material-target',
    state: (() => {
      const state = populatedBase()
      state.target = '4010174'
      state.guarantees = []
      return state
    })(),
  },
  {
    name: 'joint-max',
    state: (() => {
      const state = populatedBase()
      state.guarantees = [
        { item: '4010169', perHour: 0, maximize: true, enabled: true },
      ]
      return state
    })(),
  },
]

function summarize(plan) {
  const items = new Map(planItemRates(plan, DATA).map((entry) => [String(entry.item), Number(entry.rate || 0)]))
  return {
    coin: Number(plan.ratePerHour || 0),
    target: Number(plan.targetRate || 0),
    objective: Number(plan.objectiveRate || 0),
    infeasible: Boolean(plan.infeasible),
    scenario: plan.scenarioLabel || '',
    rows: plan.rows?.length || 0,
    roughLumber: items.get('4010169') || 0,
    coarseOre: items.get('4010174') || 0,
  }
}

function closeEnough(a, b) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b))
  return Math.abs(a - b) <= scale * 1e-6
}

function assertParity(name, js, highs) {
  for (const key of ['coin', 'target', 'objective', 'roughLumber', 'coarseOre']) {
    if (!closeEnough(js[key], highs[key])) {
      throw new Error(`${name}: ${key} drifted: JS=${js[key]} HiGHS=${highs[key]}`)
    }
  }
  if (js.infeasible !== highs.infeasible) {
    throw new Error(`${name}: infeasibility disagrees`)
  }
}

function runScenario(state) {
  const started = performance.now()
  const plan = optimizePlan(clone(state), DATA)
  return {
    ms: performance.now() - started,
    summary: summarize(plan),
  }
}

console.log('Loading HiGHS WASM…')
const loadStarted = performance.now()
const highs = await loadHighs()
const loadMs = performance.now() - loadStarted
const highsSolver = createHighsLpSolver(highs)

console.log(`HiGHS loaded in ${loadMs.toFixed(1)}ms`)
console.log('scenario | JS ms | HiGHS ms | ratio | parity')

for (const scenario of scenarios) {
  resetLpSolver()
  const js = runScenario(scenario.state)

  setLpSolver(highsSolver)
  const wasm = runScenario(scenario.state)
  resetLpSolver()

  assertParity(scenario.name, js.summary, wasm.summary)
  const ratio = wasm.ms / Math.max(0.001, js.ms)
  console.log(
    `${scenario.name} | ${js.ms.toFixed(1)} | ${wasm.ms.toFixed(1)} | ${ratio.toFixed(2)}x | OK`,
  )
}

console.log('LP backend parity benchmark passed')
