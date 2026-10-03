import { recipeNetItem } from './optimizer.js'

const EPS = 1e-8

function itemLabel(item, data) {
  return item === 'coin' ? 'Home Coin' : (data.items?.[String(item)]?.name || String(item))
}

export function planItemRate(plan, item) {
  if (!plan || plan.infeasible) return null
  if (String(item) === 'coin') return Number(plan.ratePerHour || 0)
  return (plan.rows || []).reduce(
    (sum, row) => sum + recipeNetItem(row.recipe, Number(item)) * Number(row.batchesPerHour || 0),
    0,
  )
}

function configuredMaxObjectives(state, data) {
  const primary = state.target && state.target !== 'coin' ? String(state.target) : 'coin'
  const seen = new Set([primary])
  const objectives = [{
    key: 'primary',
    item: primary,
    label: itemLabel(primary, data),
    source: 'primary',
  }]

  for (const guarantee of state.guarantees || []) {
    const item = String(guarantee.item || '')
    if (guarantee.enabled === false || !guarantee.maximize || !item || seen.has(item)) continue
    seen.add(item)
    objectives.push({
      key: `co:${item}`,
      item,
      label: itemLabel(item, data),
      source: 'additional',
    })
  }

  return objectives
}

export function explainPlanObjectives(plan, state, data) {
  const solved = Boolean(plan && !plan.infeasible)
  const weights = new Map(
    (plan?.objectiveWeights || []).map((weight) => [String(weight.key || ''), weight]),
  )
  const maxObjectives = configuredMaxObjectives(state, data).map((configured) => {
    const weight = weights.get(configured.key)
      || [...weights.values()].find((candidate) => String(candidate.item) === configured.item)
      || null
    const achieved = planItemRate(plan, configured.item)
    const soloMax = weight?.max == null ? null : Math.max(0, Number(weight.max || 0))
    const active = solved
      ? Boolean(weight) && Number(soloMax || 0) > EPS
      : true
    const share = solved && active && soloMax != null && soloMax > EPS && achieved != null
      ? Math.max(0, achieved / soloMax)
      : null

    return {
      ...configured,
      achieved,
      soloMax,
      share,
      active,
      status: solved ? (active ? 'active' : 'inactive') : 'pending',
    }
  })

  const minimums = (state.guarantees || [])
    .filter((guarantee) =>
      guarantee.enabled !== false
      && !guarantee.maximize
      && String(guarantee.item || '')
      && Number(guarantee.perHour || 0) > 0)
    .map((guarantee, index) => {
      const item = String(guarantee.item)
      const minimum = Math.max(0, Number(guarantee.perHour || 0))
      const achieved = planItemRate(plan, item)
      return {
        key: `minimum:${index}:${item}`,
        item,
        label: itemLabel(item, data),
        minimum,
        achieved,
        satisfied: achieved == null ? null : achieved + Math.max(1e-7, minimum * 1e-7) >= minimum,
      }
    })

  const activeMax = maxObjectives.filter((objective) => objective.active)
  const fairnessCount = solved ? activeMax.length : maxObjectives.length
  const fairnessFloor = solved && activeMax.length > 1 && plan?.jointMinShare != null
    ? Math.max(0, Number(plan.jointMinShare || 0))
    : null

  return {
    solved,
    mode: fairnessCount > 1 ? 'fairness' : 'single',
    configuredMaxCount: maxObjectives.length,
    activeMaxCount: activeMax.length,
    fairnessFloor,
    maxObjectives,
    minimums,
  }
}
