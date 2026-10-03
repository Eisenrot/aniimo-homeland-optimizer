import { DEFAULT_STATE } from './src/defaults.js'
import { loadNextHighs, solveNextWithHighs } from './src/solver-next/index.js'
import { findSingleCopyRescue } from './src/solver-next/roster-rescue.js'

const data = {
  version: 'copy-rescue-test',
  abilities: {},
  facilities: [
    {
      slug: 'dewy-house',
      name: 'Dewy House',
      kind: 'production',
      maxLevel: 1,
      outputLimit: { 1: 999 },
      homeLevel: { 1: 1 },
      footprint: { w: 1, h: 1 },
    },
    {
      slug: 'crafting-table',
      name: 'Crafting Table',
      kind: 'production',
      maxLevel: 1,
      outputLimit: { 1: 999 },
      homeLevel: { 1: 1 },
      footprint: { w: 1, h: 1 },
    },
  ],
  items: {
    '1': { name: 'Resident Dust', value: 0 },
    '2': { name: 'Flexible Thing', value: 10 },
  },
  recipes: [
    {
      id: 1,
      facility: 'dewy-house',
      level: 1,
      pet: 9001000,
      petName: 'Specialist',
      outputs: [{ item: 1, qty: 1 }],
      workload: 3600,
      steps: [{ name: 'Resident duty', ability: 'Leisure', level: 1, workload: 0 }],
    },
    {
      id: 2,
      facility: 'crafting-table',
      level: 1,
      outputs: [{ item: 2, qty: 1 }],
      workload: 1800,
      steps: [{ name: 'Dark duty', ability: 'Dark', level: 3, workload: 0 }],
    },
  ],
  pals: [{
    id: 9001000,
    name: 'Fragrancier-ish',
    speciesName: 'Fragrancier-ish',
    form: 'Basic',
    isForm: false,
    unavailable: false,
    abilities: { Leisure: 1, Dark: 3, Perfumery: 2 },
  }],
}

const state = {
  ...structuredClone(DEFAULT_STATE),
  homelandLevel: 20,
  teamSlots: 2,
  workerSlots: 2,
  abilityLevel: 3,
  manualSpeeds: true,
  target: 'coin',
  oneRecipePerFacility: true,
  owned: {
    '9001000': { enabled: true, count: 1 },
  },
  facilities: {
    'dewy-house': { count: 1, level: 1 },
    'crafting-table': { count: 1, level: 1 },
  },
  utilityCounts: { cooling: 0, heat: 0, sunlamp: 0, generator: 0, powerPole: 0 },
  climateOptions: { cooling: false, heat: false, sunlamp: false },
  generatorAvailable: false,
  guarantees: [],
}

const plan = {
  ratePerHour: 10,
  targetRate: 0,
  objectiveRate: 10,
  objectiveWeights: [],
  scenario: {},
  rows: [
    {
      facility: 'dewy-house',
      recipe: data.recipes[0],
      batchesPerHour: 1,
      units: 1,
      perHour: 1,
      cycleSeconds: 3600,
      manualSeconds: 3600,
      baselineCycleSeconds: 3600,
      baselineManualSeconds: 3600,
      effectiveEnv: null,
    },
    {
      facility: 'crafting-table',
      recipe: data.recipes[1],
      batchesPerHour: 1,
      units: 1,
      perHour: 1,
      cycleSeconds: 1800,
      manualSeconds: 1800,
      baselineCycleSeconds: 1800,
      baselineManualSeconds: 1800,
      effectiveEnv: null,
    },
  ],
}

const highs = await loadNextHighs()
const blocked = await solveNextWithHighs(highs, state, data, {
  rosterAware: true,
  fixedPlan: plan,
  objectiveWeights: [],
  timeLimitSeconds: 2,
  maxClimateCuts: 4,
  mipRelativeGap: 0,
})
if (!blocked.infeasible) {
  throw new Error('one physical specialist should not staff a full-time resident chair and flexible production simultaneously')
}

const rescue = await findSingleCopyRescue(highs, plan, state, data, {
  timeLimitSeconds: 2,
})
if (!rescue) throw new Error('single-copy rescue was not discovered')
if (rescue.palId !== '9001000' || rescue.fromCount !== 1 || rescue.toCount !== 2) {
  throw new Error('rescue identified the wrong copy change')
}
if (!/2 owned copies/i.test(rescue.message) || !/Dewy House/i.test(rescue.message) || !/Dark/i.test(rescue.message)) {
  throw new Error('rescue message does not explain the resident/flexible collision')
}

const rescuedState = structuredClone(state)
rescuedState.owned['9001000'].count = 2
const rescued = await solveNextWithHighs(highs, rescuedState, data, {
  rosterAware: true,
  fixedPlan: plan,
  objectiveWeights: [],
  timeLimitSeconds: 2,
  maxClimateCuts: 4,
  mipRelativeGap: 0,
})
if (rescued.infeasible) throw new Error('second specialist copy should make the fixed plan feasible')

console.log('single-copy roster rescue OK', {
  rescue: rescue.message,
  selected: rescued.roster?.selectedCount,
})
