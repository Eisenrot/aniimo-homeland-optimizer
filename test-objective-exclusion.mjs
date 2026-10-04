import { DEFAULT_STATE } from './src/defaults.js'
import { GAME_DATA } from './src/data.js'
import { fillHomelandForRV } from './src/progression.js'
import {
  guaranteeStatus,
  isGuaranteeEnabled,
  isGuaranteeExcluded,
  nextGuaranteeStatus,
} from './src/objective-status.js'
import { staticRecipeVariants, objectiveSpecs } from './src/solver-next/domain.js'
import { loadNextHighs, solveNextWithHighs } from './src/solver-next/index.js'
import { validateNextPlan } from './src/solver-next/validate.js'
import { explainPlanObjectives } from './src/plan-explanation.js'

const ITEM = '4010000' // Wheat Tea: normal + electric recipe variants.

function recipesProducing(entries, item) {
  return entries.filter((entry) =>
    (entry.recipe?.outputs || []).some((output) => String(output.item) === String(item)))
}

const state = fillHomelandForRV({
  ...structuredClone(DEFAULT_STATE),
  homelandLevel: 20,
  abilityLevel: 4,
  workerSlots: 45,
  teamSlots: 45,
}, GAME_DATA)

const baseline = recipesProducing(staticRecipeVariants(state, GAME_DATA), ITEM)
if (baseline.length < 2) {
  throw new Error(`Wheat Tea fixture expected normal + electric recipes, got ${baseline.length}`)
}

const legacyDisabled = structuredClone(state)
legacyDisabled.guarantees = [{
  item: ITEM,
  perHour: 1,
  maximize: true,
  enabled: false,
}]
if (guaranteeStatus(legacyDisabled.guarantees[0]) !== 'disabled') {
  throw new Error('legacy enabled:false row should normalize semantically as disabled')
}
if (recipesProducing(staticRecipeVariants(legacyDisabled, GAME_DATA), ITEM).length !== baseline.length) {
  throw new Error('disabled row should not ban recipes')
}

const excluded = structuredClone(state)
excluded.guarantees = [{
  item: ITEM,
  perHour: 999,
  maximize: true,
  enabled: false,
  status: 'excluded',
}]

const row = excluded.guarantees[0]
if (!isGuaranteeExcluded(row) || isGuaranteeEnabled(row)) {
  throw new Error('excluded row status helpers disagree')
}
if (nextGuaranteeStatus({ ...row, status: 'enabled', enabled: true }) !== 'disabled'
  || nextGuaranteeStatus({ ...row, status: 'disabled', enabled: false }) !== 'excluded'
  || nextGuaranteeStatus(row) !== 'enabled') {
  throw new Error('objective tri-state cycle is wrong')
}

const remaining = recipesProducing(staticRecipeVariants(excluded, GAME_DATA), ITEM)
if (remaining.length !== 0) {
  throw new Error(`excluded Wheat Tea still has ${remaining.length} runnable producing recipes`)
}

const specs = objectiveSpecs(excluded, GAME_DATA)
if (specs.some((spec) => String(spec.item) === ITEM)) {
  throw new Error('excluded row leaked into MAX objective specs')
}

const explanation = explainPlanObjectives(null, excluded, GAME_DATA)
if (explanation.minimums.length !== 0) {
  throw new Error('excluded row leaked into hard minimums')
}
if (explanation.exclusions.length !== 1 || explanation.exclusions[0].item !== ITEM) {
  throw new Error('excluded row is missing from objective explanation')
}

const highs = await loadNextHighs()
const plan = await solveNextWithHighs(highs, excluded, GAME_DATA, {
  timeLimitSeconds: 4,
  maxClimateCuts: 12,
  mipRelativeGap: 0,
})
if (plan.infeasible) throw new Error('coin plan became infeasible after excluding Wheat Tea')
if (recipesProducing((plan.rows || []).map((row) => ({ recipe: row.recipe })), ITEM).length) {
  throw new Error('solved plan still contains an excluded Wheat Tea recipe')
}
const validation = validateNextPlan(plan, excluded, GAME_DATA)
if (!validation.ok) {
  throw new Error(`excluded plan failed validation: ${validation.errors.join('; ')}`)
}

console.log('objective exclusion tri-state OK', {
  baselineRecipes: baseline.map((entry) => entry.recipe.id),
  excludedRecipes: remaining.length,
  label: explanation.exclusions[0].label,
})
