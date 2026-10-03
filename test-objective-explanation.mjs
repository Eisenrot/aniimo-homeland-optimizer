import { explainPlanObjectives, planItemRate } from './src/plan-explanation.js'

const data = {
  items: {
    '1': { name: 'Festival Plate' },
    '2': { name: 'Ore Brick' },
    '3': { name: 'Impossible Souvenir' },
  },
}

const state = {
  target: 'coin',
  guarantees: [
    { item: '1', perHour: 1, maximize: true, enabled: true },
    { item: '2', perHour: 10, maximize: false, enabled: true },
    { item: '3', perHour: 1, maximize: true, enabled: true },
  ],
}

const plan = {
  ratePerHour: 60,
  jointMinShare: 0.5,
  objectiveWeights: [
    { key: 'primary', item: 'coin', label: 'Home Coin', max: 100, normalizer: 100, scale: 0.01 },
    { key: 'co:1', item: '1', label: 'Festival Plate', max: 100, normalizer: 100, scale: 0.01 },
  ],
  rows: [{
    batchesPerHour: 10,
    recipe: {
      outputs: [
        { item: 1, qty: 5 },
        { item: 2, qty: 2 },
      ],
      inputs: [],
    },
  }],
}

const explanation = explainPlanObjectives(plan, state, data)
if (explanation.mode !== 'fairness') throw new Error('multi-MAX plan did not enter fairness explanation mode')
if (Math.abs(explanation.fairnessFloor - 0.5) > 1e-9) throw new Error('fairness floor was not preserved')

const coin = explanation.maxObjectives.find((objective) => objective.item === 'coin')
const plate = explanation.maxObjectives.find((objective) => objective.item === '1')
const impossible = explanation.maxObjectives.find((objective) => objective.item === '3')

if (!coin || Math.abs(coin.achieved - 60) > 1e-9 || Math.abs(coin.share - 0.6) > 1e-9) {
  throw new Error('Home Coin achieved/solo-max share is wrong')
}
if (!plate || Math.abs(plate.achieved - 50) > 1e-9 || Math.abs(plate.share - 0.5) > 1e-9) {
  throw new Error('item achieved/solo-max share is wrong')
}
if (!impossible || impossible.status !== 'inactive' || impossible.share != null) {
  throw new Error('zero/unavailable MAX objective should be explicitly inactive')
}

const minimum = explanation.minimums[0]
if (!minimum || minimum.label !== 'Ore Brick' || minimum.minimum !== 10 || minimum.achieved !== 20 || minimum.satisfied !== true) {
  throw new Error('hard minimum explanation is wrong')
}
if (planItemRate(plan, '2') !== 20) throw new Error('planItemRate did not compute net item output')

const pending = explainPlanObjectives(null, state, data)
if (pending.mode !== 'fairness') throw new Error('pending multi-MAX state lost configured fairness intent')
if (pending.maxObjectives.some((objective) => objective.status !== 'pending')) {
  throw new Error('unsolved objectives should say pending, not inactive')
}

const single = explainPlanObjectives({
  ratePerHour: 123,
  objectiveWeights: [
    { key: 'primary', item: 'coin', label: 'Home Coin', max: 123, normalizer: 123, scale: 1 / 123 },
  ],
  rows: [],
}, { target: 'coin', guarantees: [] }, data)
if (single.mode !== 'single' || single.fairnessFloor != null) {
  throw new Error('single MAX objective should not expose a fairness floor')
}

const zeroPrimary = explainPlanObjectives({
  ratePerHour: 0,
  objectiveWeights: [
    { key: 'primary', item: 'coin', label: 'Home Coin', max: 0, normalizer: 1, scale: 1 },
  ],
  rows: [],
}, { target: 'coin', guarantees: [] }, data)
if (zeroPrimary.maxObjectives[0]?.status !== 'inactive') {
  throw new Error('zero-max primary objective should be diagnosed inactive')
}

const infeasibleMinimum = explainPlanObjectives({
  infeasible: true,
  ratePerHour: 0,
  objectiveWeights: [],
  rows: [],
}, {
  target: 'coin',
  guarantees: [{ item: '2', perHour: 10, maximize: false, enabled: true }],
}, data)
if (infeasibleMinimum.minimums[0]?.achieved != null || infeasibleMinimum.minimums[0]?.satisfied != null) {
  throw new Error('infeasible plan should not pretend a hard minimum achieved zero')
}

console.log('objective explanation model OK', {
  floor: explanation.fairnessFloor,
  coinShare: coin.share,
  plateShare: plate.share,
  hardMinimum: minimum.satisfied,
})