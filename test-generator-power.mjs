import { loadNextHighs, solveNextWithHighs } from './src/solver-next/index.js'
import { validateNextPlan } from './src/solver-next/validate.js'
import { totalGeneratorPower } from './src/utility-system.js'

const data = {
  version: 'generator-level-power-test',
  facilities: [
    {
      slug: 'test-machine',
      name: 'Test Machine',
      kind: 'production',
      maxLevel: 1,
      homeLevel: { 1: 1 },
      outputLimit: { 1: 999 },
      electricHomeLevel: 1,
      electricPower: { 1: 200 },
      footprint: { w: 1, h: 1 },
      canRotate: true,
    },
    {
      slug: 'crackle-generator',
      name: 'Crackle Generator',
      kind: 'utility',
      maxLevel: 5,
      homeLevel: { 1: 12, 2: 14, 3: 16, 4: 18, 5: 20 },
      outputLimit: {},
      footprint: { w: 2, h: 2 },
      influence: { w: 11, h: 11 },
      canRotate: true,
    },
  ],
  items: {
    '1': { name: 'Electric Output', value: 100 },
  },
  recipes: [
    {
      id: 1001,
      facility: 'test-machine',
      level: 1,
      outputs: [{ item: 1, qty: 1 }],
      growSeconds: 3600,
      electric: true,
    },
  ],
  pals: [],
  abilities: {},
}

function stateAtLevel(generatorLevel) {
  return {
    homelandLevel: 14,
    workerSlots: 10,
    teamSlots: 10,
    abilityLevel: 4,
    collectHours: 0,
    oneRecipePerFacility: true,
    preferElectricalAutomation: true,
    maximizeElectricalCoverage: true,
    generatorAvailable: true,
    generatorLevel,
    utilityCounts: {
      cooling: 0,
      heat: 0,
      sunlamp: 0,
      generator: 1,
      powerPole: 0,
    },
    manualSpeeds: false,
    climateOptions: { cooling: false, heat: false, sunlamp: false },
    target: 'coin',
    guarantees: [],
    goal: '',
    facilities: {
      'test-machine': { count: 4, level: 1 },
    },
    modules: {},
    speeds: {},
    recipeNotes: {},
    owned: {},
  }
}

const highs = await loadNextHighs()

async function solve(generatorLevel) {
  const state = stateAtLevel(generatorLevel)
  const plan = await solveNextWithHighs(highs, state, data, {
    timeLimitSeconds: 3,
    maxClimateCuts: 4,
    mipRelativeGap: 0,
    mipAbsoluteGap: 1e-7,
  })
  if (plan.infeasible) throw new Error(`generator Lv.${generatorLevel} test plan is infeasible`)
  const validation = validateNextPlan(plan, state, data)
  if (!validation.ok) {
    throw new Error(`generator Lv.${generatorLevel} validation failed: ${validation.errors.join('; ')}`)
  }
  return plan
}

const lv1 = await solve(1)
const lv2 = await solve(2)

if (totalGeneratorPower(1, 1) !== 600) throw new Error('Lv.1 generator power should be 600W')
if (totalGeneratorPower(1, 2) !== 800) throw new Error('Lv.2 generator power should be 800W')

if (lv1.scenario.powerSupply !== 600) {
  throw new Error(`Lv.1 planner supply should be 600W, got ${lv1.scenario.powerSupply}`)
}
if (lv2.scenario.powerSupply !== 800) {
  throw new Error(`Lv.2 planner supply should be 800W, got ${lv2.scenario.powerSupply}`)
}

const lv1Row = lv1.rows.find((row) => row.recipe?.electric)
const lv2Row = lv2.rows.find((row) => row.recipe?.electric)
if (!lv1Row || !lv2Row) throw new Error('electric recipe vanished from generator level test')
if (!(lv2Row.batchesPerHour > lv1Row.batchesPerHour + 0.5)) {
  throw new Error(`Lv.2 should power materially more electric throughput: ${lv1Row.batchesPerHour} -> ${lv2Row.batchesPerHour}`)
}

console.log('generator level power reaches planner OK', {
  lv1: {
    supply: lv1.scenario.powerSupply,
    demand: lv1.scenario.powerDemand,
    efficiency: lv1.scenario.powerEfficiency,
    units: lv1Row.units,
    batchesPerHour: lv1Row.batchesPerHour,
  },
  lv2: {
    supply: lv2.scenario.powerSupply,
    demand: lv2.scenario.powerDemand,
    efficiency: lv2.scenario.powerEfficiency,
    units: lv2Row.units,
    batchesPerHour: lv2Row.batchesPerHour,
  },
})
