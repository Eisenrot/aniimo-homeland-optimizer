import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DEFAULT_STATE } from './src/defaults.js'
import { GAME_DATA as data } from './src/data.js'
import { loadNextHighs, solveNextWithHighs, validateNextPlan } from './src/solver-next/index.js'
import { isClimateSearchExhausted, solveWithClimateRetry } from './src/solver-next/climate-retry.js'
import { planItemRates } from './src/optimizer.js'

const exhausted = {
  infeasible: true,
  searchExhausted: true,
  optimizerStats: { modelStatus: 'climate-cut-limit' },
}
const valid = { infeasible: false, optimizerStats: { modelStatus: 'optimal' } }
const retryCalls = []
let retries = 0

const retried = await solveWithClimateRetry(async (cuts) => {
  retryCalls.push(cuts)
  return cuts === 48 ? exhausted : valid
}, { onRetry: () => retries++ })

assert.deepEqual(retryCalls, [48, 96])
assert.equal(retries, 1)
assert.equal(retried, valid)
assert.equal(isClimateSearchExhausted(exhausted), true)
assert.equal(isClimateSearchExhausted({ optimizerStats: { modelStatus: 'climate-duplicate-cut' } }), true)
assert.equal(isClimateSearchExhausted(valid), false)

let calls = 0
const immediate = await solveWithClimateRetry(async () => { calls++; return valid })
assert.equal(immediate, valid)
assert.equal(calls, 1, 'a valid plan should not pay for another whole solve')

const stillExhausted = await solveWithClimateRetry(async () => { calls++; return exhausted })
assert.equal(isClimateSearchExhausted(stillExhausted), true)
assert.equal(calls, 3, 'the wider retry must be bounded, even when it still cannot find a layout')

const fixture = JSON.parse(fs.readFileSync(new URL('./test-fixtures/rv14-climate-objectives.json', import.meta.url), 'utf8'))
assert.deepEqual(fixture.guarantees.map((g) => g.item), ['4010175', '4010170', '4010148', '150003', '110007'])

const state = {
  ...structuredClone(DEFAULT_STATE),
  ...fixture,
  abilityLevel: 4,
  owned: { '1017100': { enabled: true, count: 1 } },
}
const highs = await loadNextHighs()
const attempted = []
const recovered = await solveWithClimateRetry(
  async (maxClimateCuts) => {
    attempted.push(maxClimateCuts)
    return solveNextWithHighs(highs, state, data, {
      timeLimitSeconds: 8,
      maxClimateCuts,
      mipRelativeGap: 0,
      mipAbsoluteGap: 1e-7,
    })
  },
  { initialCuts: 24, retryCuts: 48 },
)

assert.equal(recovered.infeasible, false, 'old RV14 co-MAX materials should not make the whole plan impossible')
assert.equal(isClimateSearchExhausted(recovered), false)
const checked = validateNextPlan(recovered, state, data)
assert.equal(checked.ok, true, checked.errors.join('; '))
const rates = new Map(planItemRates(recovered, data).map(({ item, rate }) => [String(item), rate]))
assert.ok((rates.get('4010148') || 0) >= 3.5, 'Harvest Platter vanished with older material objectives')
for (const item of ['4010175', '4010170', '150003', '110007']) {
  assert.ok((rates.get(item) || 0) > 0, `co-MAX item ${item} was starved`)
}
assert.ok(recovered.objectiveWeights.some((w) => w.item === '4010148'), 'Platter disappeared from the fairness solve')

console.log('RV14 climate objective search OK', {
  attemptedCuts: attempted,
  totalClimateCuts: recovered.optimizerStats?.climateCuts,
  platterPerHour: rates.get('4010148'),
  oldOrePerHour: rates.get('4010175'),
  oldWoodPerHour: rates.get('4010170'),
  validated: checked.ok,
})
