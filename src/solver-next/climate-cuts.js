import { evaluateClimateLayout } from '../climate.js'
import { entries } from './sparse.js'

function modeCount(list, mode) {
  return Array.isArray(list) ? list.filter((value) => value === mode).length : 0
}

function currentUtilityVector(plan) {
  const scenario = plan?.scenario || {}
  return {
    cool: modeCount(scenario.coolingUnits, 'Cool'),
    freeze: modeCount(scenario.coolingUnits, 'Freeze'),
    warm: modeCount(scenario.heatUnits, 'Warm'),
    scorching: modeCount(scenario.heatUnits, 'Scorching'),
    sunlamp: Math.max(0, Number(scenario.sunlampCount ?? (scenario.sunlamp ? 1 : 0)) || 0),
    pairCold: Math.max(0, Number(scenario.overlapColdCount || 0) || 0),
    pairWarm: Math.max(0, Number(scenario.overlapWarmCount || 0) || 0),
  }
}

function climateCutSignature(plan, demands) {
  const utility = currentUtilityVector(plan)
  const demand = [...demands]
    .map((entry) => [entry.facility, entry.env, Math.ceil(Number(entry.count || 0) - 1e-9)].join(':'))
    .sort()
    .join(';')
  return JSON.stringify({ utility, demand })
}

export function createClimateCutManager(highs, model, built) {
  const seen = new Set()
  let serial = 0

  function unitColumnsFor(facility, env) {
    return built.recipeVars
      .filter((entry) => entry.recipe.facility === facility && entry.env === env)
      .map((entry) => entry.unitCol)
  }

  function validate(plan) {
    return evaluateClimateLayout(plan, built.state, built.data, {
      maxOffset: 9,
    })
  }

  function addScalarDifferenceSelectors(selectors, col, current, lower, upper, label) {
    const lo = Number(lower || 0)
    const hi = Number(upper || 0)
    const span = Math.max(1, hi - lo + 1)

    if (current > lo) {
      const selector = model.getDimensions().numCols
      model.addVar(0, 1)
      model.changeColIntegrality(selector, highs.constants.variableType.integer)
      model.changeColName?.(selector, `climate_nogood_${serial}_${label}_down`)
      model.addRow(
        -highs.infinity,
        current - 1 + span,
        entries([
          [col, 1],
          [selector, span],
        ]),
      )
      selectors.push(selector)
    }

    if (current < hi) {
      const selector = model.getDimensions().numCols
      model.addVar(0, 1)
      model.changeColIntegrality(selector, highs.constants.variableType.integer)
      model.changeColName?.(selector, `climate_nogood_${serial}_${label}_up`)
      model.addRow(
        current + 1 - span,
        highs.infinity,
        entries([
          [col, 1],
          [selector, -span],
        ]),
      )
      selectors.push(selector)
    }
  }

  function addAggregateDifferenceSelectors(selectors, cols, current, maximum, label) {
    if (!cols.length) return
    const span = Math.max(1, maximum + 1)

    if (current > 0) {
      const selector = model.getDimensions().numCols
      model.addVar(0, 1)
      model.changeColIntegrality(selector, highs.constants.variableType.integer)
      model.changeColName?.(selector, `climate_nogood_${serial}_${label}_down`)
      model.addRow(
        -highs.infinity,
        current - 1 + span,
        entries([
          ...cols.map((col) => [col, 1]),
          [selector, span],
        ]),
      )
      selectors.push(selector)
    }

    if (current < maximum) {
      const selector = model.getDimensions().numCols
      model.addVar(0, 1)
      model.changeColIntegrality(selector, highs.constants.variableType.integer)
      model.changeColName?.(selector, `climate_nogood_${serial}_${label}_up`)
      model.addRow(
        current + 1 - span,
        highs.infinity,
        entries([
          ...cols.map((col) => [col, 1]),
          [selector, -span],
        ]),
      )
      selectors.push(selector)
    }
  }

  function addDisjunctiveCut(plan, layout) {
    const demands = [...(layout.demands || layout.branchDemands || [])]
      .filter((demand) => Number(demand.count || 0) > 0)

    if (!demands.length) return { added: false, reason: 'no-climate-demands' }

    const signature = climateCutSignature(plan, demands)
    if (seen.has(signature)) return { added: false, reason: 'duplicate-cut' }
    seen.add(signature)

    const utility = currentUtilityVector(plan)
    const selectors = []

    addScalarDifferenceSelectors(
      selectors,
      built.utilityCols.cooling.cool,
      utility.cool,
      0,
      built.availableUtilities.cooling,
      'cool',
    )
    addScalarDifferenceSelectors(
      selectors,
      built.utilityCols.cooling.freeze,
      utility.freeze,
      0,
      built.availableUtilities.cooling,
      'freeze',
    )
    addScalarDifferenceSelectors(
      selectors,
      built.utilityCols.heat.warm,
      utility.warm,
      0,
      built.availableUtilities.heat,
      'warm',
    )
    addScalarDifferenceSelectors(
      selectors,
      built.utilityCols.heat.scorching,
      utility.scorching,
      0,
      built.availableUtilities.heat,
      'scorching',
    )
    addScalarDifferenceSelectors(
      selectors,
      built.utilityCols.sunlamp,
      utility.sunlamp,
      0,
      built.availableUtilities.sunlamp,
      'sunlamp',
    )
    addScalarDifferenceSelectors(
      selectors,
      built.utilityCols.pairCold,
      utility.pairCold,
      0,
      Math.min(built.availableUtilities.cooling, built.availableUtilities.heat),
      'pair-cold',
    )
    addScalarDifferenceSelectors(
      selectors,
      built.utilityCols.pairWarm,
      utility.pairWarm,
      0,
      Math.min(built.availableUtilities.cooling, built.availableUtilities.heat),
      'pair-warm',
    )

    for (const demand of demands) {
      const cols = unitColumnsFor(demand.facility, demand.env)
      const current = Math.max(0, Math.ceil(Number(demand.count || 0) - 1e-9))
      const maximum = Math.max(
        current,
        Number(built.state.facilities?.[demand.facility]?.count || current || 0),
      )
      addAggregateDifferenceSelectors(
        selectors,
        cols,
        current,
        maximum,
        `${demand.facility}-${demand.env}`,
      )
    }

    if (!selectors.length) return { added: false, reason: 'no-difference-selectors' }

    // At least one utility count/mode or climate demand-group count must differ
    // from the exact geometry configuration that just failed.
    model.addRow(
      1,
      highs.infinity,
      entries(selectors.map((col) => [col, 1])),
    )

    serial++
    return {
      added: true,
      signature,
      selectorCount: selectors.length,
    }
  }

  return {
    validate,
    addDisjunctiveCut,
    get count() {
      return seen.size
    },
  }
}
