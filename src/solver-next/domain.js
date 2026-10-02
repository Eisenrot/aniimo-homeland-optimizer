import {
  configuredFacilityLevel,
  electricDemandForFacility,
  generatorPowerAtLevel,
  gridPowerEfficiency,
} from '../utility-system.js'
import {
  baseWorkRateForRecipe,
  cycleSeconds,
  defaultRecipeEfficiencyPct,
  manualWorkload,
  recipeExecutionVariants,
  recipeNetItem,
  recipeNetValue,
  recipeRunnable,
} from '../optimizer.js'

export function facilityStacks(state, slug) {
  const cfg = state.facilities?.[slug]
  if (!cfg) return []
  if (Array.isArray(cfg.stacks)) {
    return cfg.stacks
      .filter((entry) => Number(entry.count || 0) > 0)
      .map((entry) => ({
        count: Math.max(0, Number(entry.count || 0)),
        level: Math.max(1, Number(entry.level || 1)),
      }))
  }
  const count = Math.max(0, Number(cfg.count || 0))
  return count > 0 ? [{ count, level: Math.max(1, Number(cfg.level || 1)) }] : []
}

export function facilityCount(state, slug) {
  return facilityStacks(state, slug).reduce((sum, entry) => sum + entry.count, 0)
}

export function facilityOutputLimit(data, slug, level) {
  const facility = data.facilities.find((entry) => entry.slug === slug)
  return Number(facility?.outputLimit?.[String(level)] ?? facility?.outputLimit?.[level] ?? 0) || 0
}

export function recipeEffectiveEnv(recipe) {
  return recipe?.executionMode === 'uncovered'
    ? null
    : (recipe?.effectiveEnv ?? recipe?.env ?? null)
}

export function manualSeconds(recipe, state) {
  if (recipe?.electric) return 0
  const speedId = String(recipe?.baseRecipeId ?? recipe?.id)
  const recipePct = state.realRecipeSpeeds?.[speedId] ?? state.realRecipeSpeeds?.[recipe?.id]
  const fallbackPct = state.manualSpeeds
    ? state.speeds?.[recipe?.facility]
    : defaultRecipeEfficiencyPct(recipe)
  const pct = Math.max(1, Number(recipePct ?? fallbackPct ?? 100))
  const baseRate = baseWorkRateForRecipe(recipe)
  const speed = (pct / 100) * baseRate
  return manualWorkload(recipe) > 0 ? manualWorkload(recipe) / speed : 0
}

export function laborSeconds(recipe, state, scenario, cycle = null) {
  if (recipe?.electric) return 0
  const manual = manualSeconds(recipe, state)
  const totalCycle = cycle ?? cycleSeconds(recipe, state, scenario)
  return recipe?.pet ? Math.max(totalCycle, manual) : manual
}


function permissiveScenarioForRecipe(recipe) {
  const scenario = {
    cooling: null,
    heat: null,
    sunlamp: false,
    generator: Boolean(recipe?.electric),
  }
  if (recipe?.env === 'Freeze') scenario.cooling = 'Freeze'
  else if (recipe?.env === 'Cool') scenario.cooling = 'Cool'
  else if (recipe?.env === 'Warm') scenario.heat = 'Warm'
  else if (recipe?.env === 'Scorching') scenario.heat = 'Scorching'
  else if (recipe?.env === 'Adequate') scenario.sunlamp = true
  return scenario
}

export function staticRecipeVariants(state, data) {
  const out = []
  for (const recipe of data.recipes) {
    const scenario = permissiveScenarioForRecipe(recipe)
    if (!recipeRunnable(recipe, state, data, scenario)) continue
    for (const variant of recipeExecutionVariants(recipe, scenario)) {
      const cycle = cycleSeconds(variant, state, scenario)
      if (!Number.isFinite(cycle) || cycle <= 0) continue
      out.push({
        recipe: variant,
        cycle,
        labor: laborSeconds(variant, state, scenario, cycle),
        env: recipeEffectiveEnv(variant),
      })
    }
  }
  return out
}

export function scenarioRecipes(state, data, scenario) {
  const out = []
  for (const recipe of data.recipes) {
    if (!recipeRunnable(recipe, state, data, scenario)) continue
    for (const variant of recipeExecutionVariants(recipe, scenario)) {
      const cycle = cycleSeconds(variant, state, scenario)
      if (!Number.isFinite(cycle) || cycle <= 0) continue
      out.push({
        recipe: variant,
        cycle,
        labor: laborSeconds(variant, state, scenario, cycle),
        env: recipeEffectiveEnv(variant),
      })
    }
  }
  return out
}


export function recipeElectricDemand(state, data, recipe) {
  if (!recipe?.electric) return 0
  const facility = data.facilities.find((entry) => entry.slug === recipe.facility)
  return electricDemandForFacility(
    facility,
    configuredFacilityLevel(state, recipe.facility, Number(recipe.level || 1)),
  )
}

function gcd(a, b) {
  let x = Math.abs(Math.round(a)), y = Math.abs(Math.round(b))
  while (y) [x, y] = [y, x % y]
  return x || 1
}

export function powerDemandStates(state, data, recipeVars) {
  const electric = recipeVars.filter((entry) => entry.recipe?.electric && entry.powerDemand > 0)
  if (!electric.length) return [{ generators: 0, demand: 0, efficiency: 0, supply: 0 }]

  const byFacility = new Map()
  for (const entry of electric) {
    const slug = entry.recipe.facility
    const demand = Number(entry.powerDemand || 0)
    const current = byFacility.get(slug) || { demand: 0, count: facilityCount(state, slug) }
    current.demand = Math.max(current.demand, demand)
    byFacility.set(slug, current)
  }

  const maxDemand = [...byFacility.values()]
    .reduce((sum, entry) => sum + entry.demand * entry.count, 0)
  const quantum = electric.reduce((value, entry) => gcd(value, entry.powerDemand), 0) || 1
  const generatorCap = Math.max(0, Number(state.utilityCounts?.generator ?? (state.generatorAvailable ? 1 : 0)) || 0)
  const generatorLevel = Math.max(1, Number(state.generatorLevel || 1))
  const states = [{ generators: 0, demand: 0, efficiency: 0, supply: 0 }]

  for (let generators = 1; generators <= generatorCap; generators++) {
    const supply = generators * generatorPowerAtLevel(generatorLevel)
    for (let demand = quantum; demand <= maxDemand + 1e-9; demand += quantum) {
      states.push({
        generators,
        demand,
        supply,
        efficiency: gridPowerEfficiency(supply, demand),
      })
    }
  }
  return states
}

export function globallyProducedItems(data) {
  return new Set(
    data.recipes.flatMap((recipe) => (recipe.outputs || []).map((entry) => Number(entry.item))),
  )
}

export function objectiveSpecs(state, data) {
  const primary = state.target && state.target !== 'coin' ? String(state.target) : 'coin'
  const seen = new Set([primary])
  const specs = [{
    key: 'primary',
    item: primary,
    label: primary === 'coin' ? 'Home Coin' : (data.items?.[primary]?.name || primary),
  }]

  for (const guarantee of state.guarantees || []) {
    const item = String(guarantee.item || '')
    if (guarantee.enabled === false || !guarantee.maximize || !item || seen.has(item)) continue
    seen.add(item)
    specs.push({
      key: `co:${item}`,
      item,
      label: data.items?.[item]?.name || item,
    })
  }

  return specs
}

export function objectiveCoefficient(recipe, spec, data) {
  return spec.item === 'coin'
    ? recipeNetValue(recipe, data)
    : recipeNetItem(recipe, spec.item)
}

function scenarioUtilityCount(scenario, key) {
  const units = scenario?.[`${key}Units`]
  if (Array.isArray(units)) return units.length
  const explicit = Number(scenario?.[`${key}Count`])
  if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit)
  return Number(Boolean(scenario?.[key]))
}

export function utilityWorkerCount(scenario) {
  return scenarioUtilityCount(scenario, 'cooling')
    + scenarioUtilityCount(scenario, 'heat')
    + scenarioUtilityCount(scenario, 'sunlamp')
    + scenarioUtilityCount(scenario, 'generator')
}

export function scenarioLabel(scenario) {
  const parts = []
  const cooling = (scenario.coolingUnits || [scenario.cooling]).filter(Boolean)
  const heat = (scenario.heatUnits || [scenario.heat]).filter(Boolean)
  const sunlamp = scenarioUtilityCount(scenario, 'sunlamp')
  const generator = scenarioUtilityCount(scenario, 'generator')
  if (cooling.length) parts.push(`Cooling: ${cooling.join(' + ')}`)
  if (heat.length) parts.push(`Heat: ${heat.join(' + ')}`)
  if (sunlamp) parts.push(`Sunlamp: ${sunlamp}x Adequate`)
  if (generator) parts.push(`Crackle Generator: ${generator}x`)
  return parts.length ? parts.join(' · ') : 'No utility building used'
}

export function enumerateScenarios(state) {
  const cooling = state.climateOptions?.cooling ? [null, 'Cool', 'Freeze'] : [null]
  const heat = state.climateOptions?.heat ? [null, 'Warm', 'Scorching'] : [null]
  const sunlamp = state.climateOptions?.sunlamp ? [false, true] : [false]
  const generator = state.generatorAvailable ? [false, true] : [false]
  const out = []
  for (const c of cooling) {
    for (const h of heat) {
      for (const s of sunlamp) {
        for (const g of generator) {
          out.push({ cooling: c, heat: h, sunlamp: s, generator: g })
        }
      }
    }
  }
  return out
}

export { recipeNetItem, recipeNetValue }