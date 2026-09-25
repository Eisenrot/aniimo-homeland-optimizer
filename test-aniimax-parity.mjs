import assert from 'node:assert/strict'
import { GAME_DATA as DATA } from './src/data.js'
import { DEFAULT_STATE } from './src/defaults.js'
import {
  PERSONALITY_PAIRS,
  cycleSeconds,
  manualWorkload,
  recipeExecutionVariants,
  recipeWorkSteps,
  uncoveredClimateEfficiency,
  wateredGrowSeconds,
} from './src/optimizer.js'
import { planPhysicalItems } from './src/full-layout.js'

const state = structuredClone(DEFAULT_STATE)
const recipeFor = (name) => DATA.recipes.find((recipe) =>
  DATA.items[String(recipe.outputs?.[0]?.item)]?.name === name && !recipe.electric
)

const wheat = recipeFor('Wheat')
const rose = recipeFor('Rose')
const cranberry = recipeFor('Cranberry')
assert(wheat && rose && cranberry, 'expected grower fixtures')

assert.deepEqual(PERSONALITY_PAIRS, [['I','E'],['N','S'],['F','T'],['P','J']], 'personality axis order changed')

assert.equal(uncoveredClimateEfficiency('Cool'), .8)
assert.equal(uncoveredClimateEfficiency('Warm'), .8)
assert.equal(uncoveredClimateEfficiency('Freeze'), .5)
assert.equal(uncoveredClimateEfficiency('Scorching'), .5)
assert.equal(uncoveredClimateEfficiency('Adequate'), null)

assert.equal(wateredGrowSeconds(wheat, 1), 180, '4 minute Wheat should become 3 minutes after two waterings')
assert.equal(wateredGrowSeconds(rose, 1), 1800, '40 minute Rose should become 30 minutes after two waterings')
assert.equal(wateredGrowSeconds(rose, .8), 2400, 'uncovered Cool crop should keep full-speed watering savings')
assert.equal(wateredGrowSeconds(cranberry, .5), 4200, 'uncovered Freeze crop should use 50% climate speed before fixed watering savings')

assert.equal(recipeWorkSteps(wheat).filter((step) => step.name === 'Watering').length, 2, 'growers need two Water jobs')
assert.equal(manualWorkload(wheat), 12, 'Wheat should include two 3-workload Water jobs')
assert.equal(cycleSeconds(wheat, state, {}), 180, 'worker jobs must not extend grower facility occupancy')

const coolScenario = { cooling: 'Cool', heat: null, sunlamp: false, generator: false }
const coolVariants = recipeExecutionVariants(rose, coolScenario)
assert.equal(coolVariants.length, 2, 'covered climate should still expose an uncovered execution alternative')
const covered = coolVariants.find((recipe) => recipe.executionMode === 'covered')
const uncovered = coolVariants.find((recipe) => recipe.executionMode === 'uncovered')
assert(covered && uncovered)
assert.equal(cycleSeconds(covered, state, coolScenario), 1800)
assert.equal(cycleSeconds(uncovered, state, coolScenario), 2400)

const neutralVariants = recipeExecutionVariants(rose, {})
assert.equal(neutralVariants.length, 1)
assert.equal(neutralVariants[0].executionMode, 'uncovered')
assert.equal(cycleSeconds(neutralVariants[0], state, {}), 2400)

const layoutState = structuredClone(DEFAULT_STATE)
layoutState.homelandLevel = 20
layoutState.facilities = { ...(layoutState.facilities || {}), farmland: { count: 1, level: 7 } }
const physical = planPhysicalItems({
  rows: [{
    facility: 'farmland',
    recipe: uncovered,
    batchesPerHour: 1,
    units: .5,
    perHour: 0,
    targetPerHour: 0,
    cycleSeconds: 2400,
    manualSeconds: 17,
    effectiveEnv: null,
    executionMode: 'uncovered',
  }],
  scenario: {},
}, layoutState, DATA, { storageUnits: 0 })
const item = physical.find((entry) => entry.kind === 'plan')
assert(item, 'expected uncovered physical plan item')
assert.equal(item.env, null)
assert.equal(item.avoidClimate, true, 'uncovered crop must be kept outside climate fields')

console.log('Aniimax parity mechanics regression passed')
