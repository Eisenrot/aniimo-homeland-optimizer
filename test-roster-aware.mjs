import { DEFAULT_STATE } from './src/defaults.js'
import { GAME_DATA } from './src/data.js'
import { fillHomelandForRV } from './src/progression.js'
import { buildTeamModel, recommendPersonalityRoles } from './src/optimizer.js'
import { loadNextHighs, solveNextWithHighs, validateNextPlan } from './src/solver-next/index.js'

const highs = await loadNextHighs()

const facility = (slug, extra = {}) => ({
  slug,
  name: slug,
  kind: 'production',
  maxLevel: 1,
  outputLimit: { 1: 999 },
  homeLevel: { 1: 1 },
  footprint: { w: 1, h: 1 },
  ...extra,
})

const pal = (id, name, abilities) => ({
  id,
  name,
  abilities,
  unavailable: false,
})

function baseState(data, overrides = {}) {
  const state = {
    ...structuredClone(DEFAULT_STATE),
    homelandLevel: 20,
    abilityLevel: 'auto',
    teamSlots: 1,
    workerSlots: 1,
    collectHours: 0,
    oneRecipePerFacility: true,
    target: 'coin',
    guarantees: [],
    facilities: {},
    modules: {},
    recipeNotes: {},
    utilityCounts: { cooling: 0, heat: 0, sunlamp: 0, generator: 0, powerPole: 0 },
    climateOptions: { cooling: false, heat: false, sunlamp: false },
    generatorAvailable: false,
    generatorLevel: 1,
    owned: {},
    ...overrides,
  }
  for (const candidate of data.pals) {
    state.owned[String(candidate.id)] = { enabled: true, count: 1 }
  }
  return state
}

async function solveRoster(state, data) {
  const theoretical = await solveNextWithHighs(highs, state, data, {
    timeLimitSeconds: 2,
    maxClimateCuts: 4,
    mipRelativeGap: 0,
  })
  const roster = await solveNextWithHighs(highs, state, data, {
    rosterAware: true,
    objectiveWeights: theoretical.objectiveWeights,
    timeLimitSeconds: 2,
    maxClimateCuts: 4,
    mipRelativeGap: 0,
  })
  const validation = validateNextPlan(roster, state, data)
  if (!validation.ok) throw new Error('Roster validation failed: ' + validation.errors.join(' | '))
  return { theoretical, roster }
}

function activeRecipeIds(plan, facilitySlug) {
  return new Set(
    (plan.rows || [])
      .filter((row) => row.facility === facilitySlug && Number(row.batchesPerHour || 0) > 1e-5)
      .map((row) => String(row.recipe?.baseRecipeId ?? row.recipe?.id)),
  )
}

// One physical machine means one recipe identity. Also: "up to 2 workers"
// does not mean hiring a ceremonial second employee to watch the first one work.
{
  const data = {
    version: 'roster-test-one-recipe',
    facilities: [facility('crafting-table')],
    items: {
      '1': { name: 'Better Thing', value: 10 },
      '2': { name: 'Worse Thing', value: 9 },
    },
    recipes: [
      {
        id: 1,
        facility: 'crafting-table',
        level: 1,
        outputs: [{ item: 1, qty: 1 }],
        workload: 3600,
        steps: [{ name: 'Crafting', ability: 'Artisanship', level: 1, workload: 0 }],
      },
      {
        id: 2,
        facility: 'crafting-table',
        level: 1,
        outputs: [{ item: 2, qty: 1 }],
        workload: 3600,
        steps: [{ name: 'Crafting', ability: 'Artisanship', level: 1, workload: 0 }],
      },
    ],
    pals: [
      pal(9001001, 'Fast', { Artisanship: 4 }),
      pal(9001002, 'Slow', { Artisanship: 1 }),
    ],
  }
  const state = baseState(data, {
    teamSlots: 2,
    workerSlots: 2,
    facilities: { 'crafting-table': { count: 1, level: 1 } },
  })
  const two = await solveRoster(state, data)
  if (activeRecipeIds(two.roster, 'crafting-table').size > 1) {
    throw new Error('one-recipe mode time-shared a single Crafting Table')
  }
  if (two.roster.roster?.selectedCount !== 1) {
    throw new Error('two-slot cap should compact to the one useful worker')
  }

  const oneState = structuredClone(state)
  oneState.teamSlots = 1
  oneState.workerSlots = 1
  const one = await solveRoster(oneState, data)
  if (two.roster.ratePerHour + 1e-6 < one.roster.ratePerHour) {
    throw new Error('more available workers made the optimum worse')
  }
  if (Math.abs(two.roster.ratePerHour - one.roster.ratePerHour) > 1e-5) {
    throw new Error('second worker changed a one-machine optimum that was already capped')
  }
  if (!(one.roster.ratePerHour > one.theoretical.ratePerHour + 1e-6)) {
    throw new Error('real Artisanship level did not improve throughput over the theoretical baseline')
  }
}

// Two different jobs, two different specialists. One slot cannot magically
// merge them into a single extremely employable trench coat.
{
  const data = {
    version: 'roster-test-task-matching',
    facilities: [facility('crafting-table')],
    items: { '3': { name: 'Split Job', value: 10 } },
    recipes: [{
      id: 3,
      facility: 'crafting-table',
      level: 1,
      outputs: [{ item: 3, qty: 1 }],
      steps: [
        { name: 'Green bit', ability: 'Grass', level: 1, workload: 1800 },
        { name: 'Spooky bit', ability: 'Dark', level: 1, workload: 1800 },
      ],
    }],
    pals: [
      pal(9002001, 'Grass Only', { Grass: 1 }),
      pal(9002002, 'Dark Only', { Dark: 1 }),
    ],
  }
  const state = baseState(data, {
    facilities: { 'crafting-table': { count: 1, level: 1 } },
  })
  const one = await solveRoster(state, data)
  if (one.roster.ratePerHour > 1e-6) {
    throw new Error('one worker somehow performed two incompatible specialist jobs')
  }

  state.teamSlots = 2
  state.workerSlots = 2
  const two = await solveRoster(state, data)
  if (!(two.roster.ratePerHour > 1e-6)) {
    throw new Error('two valid specialists could not run the split job')
  }
  if (two.roster.roster?.selectedCount !== 2) {
    throw new Error('split job should require both specialists')
  }
}

// Resident recipes are not generic Leisure jobs. Susuta means Susuta-family,
// not "someone else also enjoys sitting down".
{
  const data = {
    version: 'roster-test-resident',
    facilities: [facility('tidewhisper-sandcastle')],
    items: { '4': { name: 'Sea Salt', value: 100 } },
    recipes: [{
      id: 4,
      facility: 'tidewhisper-sandcastle',
      level: 1,
      pet: 1017100,
      petName: 'Susuta',
      outputs: [{ item: 4, qty: 1 }],
      workload: 1800,
      steps: [{ name: 'Beach duty', ability: 'Leisure', level: 1, workload: 0 }],
    }],
    pals: [
      pal(1017100, 'Susuta', { Leisure: 1 }),
      pal(9003001, 'Definitely Not Susuta', { Leisure: 4 }),
    ],
  }
  const state = baseState(data, {
    target: '4',
    facilities: { 'tidewhisper-sandcastle': { count: 1, level: 1 } },
  })
  const withSusuta = await solveRoster(state, data)
  if (!(withSusuta.roster.targetRate > 1e-6)) throw new Error('Susuta could not run Susuta resident production')
  const picked = withSusuta.roster.roster?.selected?.map((worker) => Number(worker.pal?.id)) || []
  if (!picked.includes(1017100)) throw new Error('resident solve did not select the required family')

  state.owned['1017100'].enabled = false
  const withoutSusuta = await solveRoster(state, data)
  if (withoutSusuta.roster.targetRate > 1e-6) {
    throw new Error('wrong-family Leisure worker replaced a required resident')
  }
}

// Electricity is not free labour. A generator needs an actual qualified
// Lightning worker before an E-mode machine gets to wake up.
{
  const data = {
    version: 'roster-test-generator',
    facilities: [
      facility('aniipod-maker', {
        electricHomeLevel: 12,
        electricPower: { 1: 100 },
      }),
      facility('crackle-generator', { kind: 'utility' }),
    ],
    items: { '5': { name: 'Electric Thing', value: 100 } },
    recipes: [{
      id: 5,
      facility: 'aniipod-maker',
      level: 1,
      outputs: [{ item: 5, qty: 1 }],
      growSeconds: 3600,
      electric: true,
    }],
    pals: [
      pal(1022100, 'Bolty', { Lightning: 1 }),
      pal(9004001, 'No Lightning Here', { Artisanship: 4 }),
    ],
  }
  const state = baseState(data, {
    homelandLevel: 12,
    target: '5',
    generatorAvailable: true,
    utilityCounts: { cooling: 0, heat: 0, sunlamp: 0, generator: 1, powerPole: 0 },
    facilities: { 'aniipod-maker': { count: 1, level: 1 } },
  })
  const powered = await solveRoster(state, data)
  if (!(powered.roster.targetRate > 1e-6)) throw new Error('qualified Lightning worker could not staff the generator')
  const utility = powered.roster.roster?.assignments?.find((assignment) => assignment.kind === 'utility')
  if (!utility || utility.workerKey !== '1022100#1') {
    throw new Error('generator was not staffed by the qualified Lightning worker')
  }

  state.owned['1022100'].enabled = false
  const unpowered = await solveRoster(state, data)
  if (unpowered.roster.targetRate > 1e-6) {
    throw new Error('electric production ran without a qualified generator worker')
  }
}

// Fresh RV1 / zero roster should be boring, not haunted. Zero means zero.
{
  const data = { version: 'roster-test-empty', facilities: [], items: {}, recipes: [], pals: [] }
  const state = structuredClone(DEFAULT_STATE)
  const plan = await solveNextWithHighs(highs, state, data, {
    rosterAware: true,
    timeLimitSeconds: 1,
    maxClimateCuts: 1,
  })
  const validation = validateNextPlan(plan, state, data)
  if (plan.infeasible || Number(plan.ratePerHour || 0) !== 0 || Number(plan.roster?.selectedCount || 0) !== 0) {
    throw new Error('zero-roster state managed to invent workers or production')
  }
  if (!validation.ok) throw new Error('zero-roster validation failed: ' + validation.errors.join(' | '))
}
// Real-data smoke: the tiny fixtures above catch rules, this catches us
// accidentally writing a beautiful theorem that the actual 221-Aniimo dataset hates.
{
  const makeRealState = (slots) => {
    const state = fillHomelandForRV({
      ...structuredClone(DEFAULT_STATE),
      homelandLevel: 20,
      teamSlots: slots,
      workerSlots: slots,
      abilityLevel: 'auto',
    }, GAME_DATA)
    state.target = 'coin'
    state.owned = {}
    for (const candidate of GAME_DATA.pals) {
      state.owned[String(candidate.id)] = { enabled: !candidate.unavailable, count: 1 }
    }
    return state
  }

  const rates = []
  for (const slots of [14, 20, 45]) {
    const state = makeRealState(slots)
    const solved = await solveRoster(state, GAME_DATA)
    const roster = solved.roster

    if ((roster.roster?.selectedCount || 0) > slots) {
      throw new Error(`real-data roster selected ${roster.roster?.selectedCount} workers over cap ${slots}`)
    }

    const activeByFacility = new Map()
    for (const row of roster.rows || []) {
      if (Number(row.batchesPerHour || 0) <= 1e-5) continue
      const set = activeByFacility.get(row.facility) || new Set()
      set.add(String(row.recipe?.baseRecipeId ?? row.recipe?.id))
      activeByFacility.set(row.facility, set)
    }
    for (const [facilitySlug, identities] of activeByFacility) {
      const cap = Number(state.facilities?.[facilitySlug]?.count || 0)
      if (state.oneRecipePerFacility && identities.size > cap) {
        throw new Error(`${facilitySlug} runs ${identities.size} recipes on ${cap} physical copies`)
      }
    }

    const team = roster.roster?.selected || []
    const personality = recommendPersonalityRoles(
      buildTeamModel(roster, state, GAME_DATA),
      team,
      roster.rows,
    )
    if ((personality?.hints || []).length !== team.length) {
      throw new Error('personality recommendation lost a roster-selected worker')
    }

    rates.push({
      slots,
      rate: Number(roster.ratePerHour || 0),
      selected: Number(roster.roster?.selectedCount || 0),
    })
  }

  for (let index = 1; index < rates.length; index++) {
    if (rates[index].rate + 1e-6 < rates[index - 1].rate) {
      throw new Error(
        `real-data worker monotonicity failed: ${rates[index - 1].slots} => ${rates[index - 1].rate}, `
        + `${rates[index].slots} => ${rates[index].rate}`,
      )
    }
  }

  console.log('real-data roster smoke OK', rates)
}

console.log('roster-aware Solver Next constraints OK')