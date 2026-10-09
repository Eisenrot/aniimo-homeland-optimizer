import { gridPowerEfficiency, totalGeneratorPower } from '../utility-system.js'
import {
  objectiveCoefficient,
  recipeNetItem,
  recipeNetValue,
  scenarioLabel,
  utilityWorkerCount,
} from './domain.js'
import { buildNextModel } from './model.js'
import { createClimateCutManager } from './climate-cuts.js'
import { entries } from './sparse.js'
import { validateNextPlan } from './validate.js'

const EPS = 1e-8
const PLAN_EPS = 1e-5
const ASSIGNMENT_EPS = 1e-4

function modelStatusName(highs, status) {
  const table = highs.constants?.modelStatus || {}
  for (const [key, value] of Object.entries(table)) {
    if (value === status) return key
  }
  return String(status)
}

function hasUsableSolution(highs, model, status) {
  try {
    const primal = Number(model.info.get('primal_solution_status'))
    if (primal !== highs.constants.solutionStatus.feasible) return false
    const solution = model.getSolution()
    return Boolean(solution?.colValue?.length)
  } catch {
    // If HiGHS cannot even tell us a primal exists, the zero-vector souvenir
    // it sometimes hands back does not get to cosplay as a real solution.
    const bad = new Set([
      highs.constants.modelStatus.infeasible,
      highs.constants.modelStatus.unboundedOrInfeasible,
      highs.constants.modelStatus.unbounded,
      highs.constants.modelStatus.loadError,
      highs.constants.modelStatus.modelError,
      highs.constants.modelStatus.presolveError,
      highs.constants.modelStatus.solveError,
      highs.constants.modelStatus.postsolveError,
      highs.constants.modelStatus.unknown,
    ])
    if (bad.has(status)) return false
    try {
      const solution = model.getSolution()
      return Boolean(solution?.colValue?.length)
    } catch {
      return false
    }
  }
}

function setObjective(model, vector, colCount) {
  for (let col = 0; col < colCount; col++) {
    model.changeColCost(col, Number(vector[col] || 0))
  }
}

function extendVector(vector, length) {
  if (vector.length >= length) return vector
  const next = new Float64Array(length)
  next.set(vector)
  return next
}

function vectorValue(vector, values) {
  let total = 0
  const limit = Math.min(vector.length, values.length)
  for (let col = 0; col < limit; col++) {
    total += Number(vector[col] || 0) * Number(values[col] || 0)
  }
  return total
}

function addObjectiveFloor(highs, model, vector, achieved, retention = 1) {
  const terms = []
  const extended = extendVector(vector, model.getDimensions().numCols)
  for (let col = 0; col < extended.length; col++) {
    const value = Number(extended[col] || 0)
    if (Math.abs(value) > 1e-14) terms.push([col, value])
  }
  const keep = Math.max(0, Math.min(1, Number(retention) || 0))
  const numeric = Number(achieved) || 0
  const protectedValue = numeric >= 0 ? numeric * keep : numeric / Math.max(keep, 1e-9)
  const tolerance = Math.max(1e-8, Math.abs(protectedValue) * 1e-7)
  model.addRow(
    protectedValue - tolerance,
    highs.infinity,
    entries(terms),
  )
}

function electricalAutomationObjective(built, colCount) {
  const objective = new Float64Array(colCount)
  for (const entry of built.recipeVars) {
    if (entry.electric) {
      // Reward actual E-mode throughput as base machine occupancy. This cannot
      // be gamed by switching on an idle electric facility with zero batches.
      objective[entry.rateCol] += Math.max(0, Number(entry.cycle || 0)) / 3600
    } else if (entry.labor > EPS) {
      // Equivalent economic plans should prefer requiring less Aniimo labor.
      objective[entry.rateCol] -= Math.max(0, Number(entry.labor || 0)) / 3600
    }
  }
  return objective
}

function selectedScenario(values, built) {
  const coolCount = Math.max(0, Math.round(Number(values[built.utilityCols.cooling.cool] || 0)))
  const freezeCount = Math.max(0, Math.round(Number(values[built.utilityCols.cooling.freeze] || 0)))
  const warmCount = Math.max(0, Math.round(Number(values[built.utilityCols.heat.warm] || 0)))
  const scorchingCount = Math.max(0, Math.round(Number(values[built.utilityCols.heat.scorching] || 0)))
  const sunlampCount = Math.max(0, Math.round(Number(values[built.utilityCols.sunlamp] || 0)))
  const generatorCount = Math.max(0, Math.round(Number(values[built.utilityCols.generator] || 0)))
  const coolingUnits = [
    ...Array(coolCount).fill('Cool'),
    ...Array(freezeCount).fill('Freeze'),
  ]
  const heatUnits = [
    ...Array(warmCount).fill('Warm'),
    ...Array(scorchingCount).fill('Scorching'),
  ]

  const powerDemand = built.recipeVars.reduce((sum, entry) => {
    if (!entry.electric || !entry.powerDemand) return sum
    return sum + Math.max(0, Math.round(Number(values[entry.unitCol] || 0))) * entry.powerDemand
  }, 0)
  const powerSupply = totalGeneratorPower(generatorCount, Number(built.state.generatorLevel || 1))
  const powerEfficiency = powerDemand > 0 ? gridPowerEfficiency(powerSupply, powerDemand) : 0

  return {
    cooling: coolingUnits[0] || null,
    heat: heatUnits[0] || null,
    coolingUnits,
    heatUnits,
    coolingCount: coolingUnits.length,
    heatCount: heatUnits.length,
    sunlamp: sunlampCount > 0,
    sunlampCount,
    generator: generatorCount > 0,
    generatorCount,
    generatorLevel: Number(built.state.generatorLevel || 1),
    overlapColdCount: Math.max(0, Math.round(Number(values[built.utilityCols.pairCold] || 0))),
    overlapWarmCount: Math.max(0, Math.round(Number(values[built.utilityCols.pairWarm] || 0))),
    powerDemand,
    powerSupply,
    powerEfficiency,
    modelPowerEfficiency: Math.max(0, Number(values[built.powerEtaCol] || 0)),
  }
}

function resolveRosterSolution(values, built) {
  if (!built.rosterAware || !built.roster) return null

  const assignments = []
  const flexSecondsByEntry = new Map()
  const selected = []
  const buckets = new Map()

  for (const item of built.roster.selectVars || []) {
    const count = Math.max(0, Math.round(Number(values[item.selectCol] || 0)))
    if (!count) continue
    const members = (item.archetype.workers || []).slice(0, count).map((worker) => ({
      worker,
      usedSeconds: 0,
    }))
    buckets.set(item.archetype.key, members)
  }

  const claimFullTime = (archetypeKey) => {
    const members = buckets.get(archetypeKey) || []
    const member = members.find((candidate) => candidate.usedSeconds <= ASSIGNMENT_EPS)
    if (!member) return null
    member.usedSeconds = 3600
    return member.worker
  }

  for (const item of built.roster.residentVars || []) {
    const count = Math.max(0, Math.round(Number(values[item.assignCol] || 0)))
    for (let copy = 0; copy < count; copy++) {
      const worker = claimFullTime(item.archetype.key)
      if (!worker) continue
      assignments.push({
        workerKey: worker.key,
        kind: 'permanent',
        facility: item.entry.recipe.facility,
        recipeId: item.entry.recipe.id,
        task: {
          key: item.task.key,
          ability: item.task.ability,
          level: item.task.level,
          family: item.task.family,
        },
        seconds: 3600,
        cycle: item.cycle,
      })
    }
  }

  for (const item of built.roster.utilityVars || []) {
    const count = Math.max(0, Math.round(Number(values[item.assignCol] || 0)))
    for (let copy = 0; copy < count; copy++) {
      const worker = claimFullTime(item.archetype.key)
      if (!worker) continue
      assignments.push({
        workerKey: worker.key,
        kind: 'utility',
        facility: item.spec.utility === 'cooling' ? 'cooling-unit'
          : item.spec.utility === 'heat' ? 'heat-furnace'
            : item.spec.utility === 'sunlamp' ? 'sunlamp'
              : 'crackle-generator',
        utilityKey: item.spec.key,
        task: {
          key: item.spec.key,
          ability: item.spec.ability,
          level: item.spec.level,
          family: null,
        },
        seconds: 3600,
      })
    }
  }

  for (const item of built.roster.flexVars || []) {
    let seconds = Math.max(0, Number(values[item.timeCol] || 0))
    if (seconds <= ASSIGNMENT_EPS) continue
    flexSecondsByEntry.set(item.entry, (flexSecondsByEntry.get(item.entry) || 0) + seconds)

    const members = buckets.get(item.archetype.key) || []
    for (const member of members) {
      if (seconds <= ASSIGNMENT_EPS) break
      const spare = Math.max(0, 3600 - member.usedSeconds)
      if (spare <= ASSIGNMENT_EPS) continue
      const used = Math.min(spare, seconds)
      member.usedSeconds += used
      seconds -= used
      assignments.push({
        workerKey: member.worker.key,
        kind: 'flex',
        facility: item.entry.recipe.facility,
        recipeId: item.entry.recipe.id,
        task: {
          key: item.task.key,
          ability: item.task.ability,
          level: item.task.level,
          family: item.task.family,
          baselineSeconds: item.task.baselineSeconds,
        },
        seconds: used,
        speed: item.speed,
      })
    }
  }

  for (const members of buckets.values()) {
    for (const member of members) {
      if (member.usedSeconds <= ASSIGNMENT_EPS) continue
      selected.push({
        key: member.worker.key,
        copy: member.worker.copy,
        pal: member.worker.pal,
      })
    }
  }

  return {
    flexSecondsByEntry,
    public: {
      aware: true,
      cap: built.roster.cap,
      selectedCount: selected.length,
      selected,
      assignments,
    },
  }
}
function solutionToPlan(model, built, solution, stage, climateLayout = null) {
  const values = solution.colValue
  const scenario = selectedScenario(values, built)
  const roster = resolveRosterSolution(values, built)
  const rows = []
  let coin = 0
  let target = 0
  let objective = 0

  for (const entry of built.recipeVars) {
    const batches = Math.max(0, Number(values[entry.rateCol] || 0))
    if (batches <= PLAN_EPS) continue

    const units = Math.max(0, Number(values[entry.unitCol] || 0))
    const coinPart = recipeNetValue(entry.recipe, built.data) * batches
    const targetPart = built.state.target && built.state.target !== 'coin'
      ? recipeNetItem(entry.recipe, built.state.target) * batches
      : coinPart
    coin += coinPart
    target += targetPart

    for (const weight of stage.weights || []) {
      objective += objectiveCoefficient(entry.recipe, weight.spec, built.data)
        * Number(weight.scale || 0)
        * batches
    }

    const assignedSeconds = roster?.flexSecondsByEntry.get(entry) || 0
    const rosterManual = roster && batches > EPS ? assignedSeconds / batches : entry.labor
    const fixedSeconds = Math.max(0, Number(entry.cycle || 0) - Number(entry.labor || 0))
    const rosterCycle = roster && !entry.electric && assignedSeconds > EPS
      ? (entry.recipe.facility === 'farmland' || entry.recipe.facility === 'woodland'
          ? entry.cycle
          : fixedSeconds + rosterManual)
      : entry.cycle

    rows.push({
      facility: entry.recipe.facility,
      recipe: entry.recipe,
      batchesPerHour: batches,
      units,
      perHour: coinPart,
      targetPerHour: targetPart,
      cycleSeconds: entry.electric && scenario.powerEfficiency > 1e-9
        ? entry.cycle / scenario.powerEfficiency
        : rosterCycle,
      manualSeconds: rosterManual,
      baselineCycleSeconds: entry.cycle,
      baselineManualSeconds: entry.labor,
      effectiveEnv: entry.env,
      executionMode: entry.recipe.executionMode || 'normal',
      netValue: recipeNetValue(entry.recipe, built.data),
    })
  }

  return {
    ratePerHour: coin,
    targetRate: target,
    objectiveRate: objective,
    rows,
    runnableRecipes: built.recipeVars.map((entry) => entry.recipe),
    scenario,
    scenarioLabel: scenarioLabel(scenario),
    utilityWorkers: utilityWorkerCount(scenario),
    infeasible: false,
    climateLayout,
    roster: roster?.public || null,
    jointMinShare: stage.jointMinShare ?? null,
    objectiveWeights: (stage.weights || []).map((weight) => ({
      ...weight.spec,
      scale: weight.scale,
      normalizer: weight.normalizer,
      max: weight.max,
    })),
  }
}

function capabilityCost(values) {
  const capabilities = values || []
  const breadth = capabilities.filter((value) => Number(value || 0) > 1e-9).length
  const strength = capabilities.reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0)
  return strength + breadth * 0.05
}

function rosterCapabilityCost(archetype) {
  return capabilityCost(archetype?.capabilities)
}

function rosterProductionOpportunityCost(archetype) {
  return capabilityCost(archetype?.productionCapabilities)
}

function utilityAssignmentCost(item) {
  const pal = item.archetype?.representative?.pal || item.archetype?.representative || {}
  const required = Math.max(0, Number(item.spec?.level || 0))
  const actual = Math.max(0, Number(pal.abilities?.[item.spec?.ability] || 0))
  const overqualified = Math.max(0, actual - required)
  const productionOpportunity = rosterProductionOpportunityCost(item.archetype)
  const abilityValues = Object.values(pal.abilities || {}).map((value) => Math.max(0, Number(value || 0)))
  const generalStrength = abilityValues.reduce((sum, value) => sum + value, 0)
  const generalBreadth = abilityValues.filter((value) => value > 0).length

  // Utilities are static jobs. Fire 4 does not warm harder than Fire 1.
  // Spend the cheapest qualified worker first and keep the shiny murder-goblin
  // available for jobs where those extra levels can actually do something.
  return overqualified * 1_000_000
    + productionOpportunity * 1_000
    + generalStrength * 0.1
    + generalBreadth * 0.01
}

function rosterSelectionObjective(built, length, mode) {
  const objective = new Float64Array(length)
  for (const item of built.roster?.selectVars || []) {
    objective[item.selectCol] = mode === 'shape'
      ? -rosterCapabilityCost(item.archetype)
      : -1
  }
  if (mode === 'shape') {
    for (const item of built.roster?.utilityVars || []) {
      objective[item.assignCol] = -utilityAssignmentCost(item)
    }
  }
  return objective
}

function lockCurrentRecipeRates(highs, model, built, values) {
  for (const entry of built.recipeVars || []) {
    const value = Math.max(0, Number(values[entry.rateCol] || 0))
    const tolerance = Math.max(1e-8, Math.abs(value) * 1e-9)
    model.addRow(
      Math.max(0, value - tolerance),
      value + tolerance,
      entries([[entry.rateCol, 1]]),
    )
  }
}

function addFairnessRows(highs, model, built, weights) {
  const fairnessCol = built.fairnessCol
  for (const weight of weights) {
    const vector = extendVector(
      built.objectiveVectors.get(weight.spec.key),
      model.getDimensions().numCols,
    )
    const terms = [[fairnessCol, -weight.normalizer]]
    for (let col = 0; col < vector.length; col++) {
      const value = Number(vector[col] || 0)
      if (Math.abs(value) > 1e-14) terms.push([col, value])
    }
    model.addRow(0, highs.infinity, entries(terms))
  }
}

async function solveStage({
  highs,
  model,
  built,
  climate,
  objective,
  stage,
  maxClimateCuts,
  onProgress,
}) {
  let cuts = 0
  let lastSolution = null
  let lastStatus = null
  let lastPlan = null
  let lastLayout = null

  while (cuts <= maxClimateCuts) {
    const colCount = model.getDimensions().numCols
    const costs = extendVector(objective, colCount)
    setObjective(model, costs, colCount)

    if (lastSolution?.colValue?.length === colCount) {
      try {
        model.setSolution({ colValue: lastSolution.colValue })
      } catch {
        // MIP starts are opportunistic.
      }
    }

    onProgress?.({
      phase: stage.name,
      climateCuts: climate.count,
      detail: cuts ? `Re-solving after climate cut ${cuts}` : 'Solving MIP',
    })

    model.run()
    lastStatus = model.getModelStatus()
    if (!hasUsableSolution(highs, model, lastStatus)) {
      return {
        feasible: false,
        status: modelStatusName(highs, lastStatus),
        plan: null,
        solution: null,
        climate: null,
      }
    }

    lastSolution = model.getSolution()
    lastPlan = solutionToPlan(model, built, lastSolution, stage)
    lastLayout = climate.validate(lastPlan)
    lastPlan.climateLayout = lastLayout

    if (lastLayout.feasible) {
      return {
        feasible: true,
        status: modelStatusName(highs, lastStatus),
        plan: lastPlan,
        solution: lastSolution,
        climate: lastLayout,
      }
    }

    const added = climate.addDisjunctiveCut(lastPlan, lastLayout)
    if (!added.added) {
      return {
        feasible: false,
        status: `climate-${added.reason}`,
        plan: lastPlan,
        solution: lastSolution,
        climate: lastLayout,
      }
    }
    cuts++
  }

  return {
    feasible: false,
    status: 'climate-cut-limit',
    plan: lastPlan,
    solution: lastSolution,
    climate: lastLayout,
  }
}

export async function solveNextWithHighs(highs, state, data, options = {}) {
  const started = performance.now()
  const built = buildNextModel(highs, state, data, options)
  const buildMs = performance.now() - started
  const model = highs.createModel(built.modelData)
  const maxClimateCuts = Math.max(0, Number(options.maxClimateCuts ?? 24))
  const timeLimit = Math.max(0.1, Number(options.timeLimitSeconds ?? 4))
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null

  try {
    model.options.set({
      output_flag: Boolean(options.solverOutput),
      presolve: 'on',
      solver: 'choose',
      mip_rel_gap: Number(options.mipRelativeGap ?? 0),
      mip_abs_gap: Number(options.mipAbsoluteGap ?? 1e-7),
      time_limit: timeLimit,
    })

    const climate = createClimateCutManager(highs, model, built)
    const suppliedWeights = Array.isArray(options.objectiveWeights) ? options.objectiveWeights : []
    const suppliedByKey = new Map(suppliedWeights.map((weight) => [String(weight.key || ''), weight]))
    const maxima = new Map()
    let latest = null
    let activeWeights = []

    if (suppliedByKey.size) {
      activeWeights = built.specs
        .map((spec) => {
          const supplied = suppliedByKey.get(spec.key)
          if (!supplied) return spec.key === 'primary' ? { spec, max: 0, normalizer: 1, scale: 1 } : null
          const max = Math.max(0, Number(supplied.max || 0))
          if (spec.key !== 'primary' && max <= EPS) return null
          const normalizer = Math.max(EPS, Number(supplied.normalizer || Math.abs(max) || 1))
          return {
            spec,
            max,
            normalizer,
            scale: Number(supplied.scale || 1 / normalizer),
          }
        })
        .filter(Boolean)
    } else {
      for (let i = 0; i < built.specs.length; i++) {
        const spec = built.specs[i]
        const vector = built.objectiveVectors.get(spec.key)
        const result = await solveStage({
          highs,
          model,
          built,
          climate,
          objective: vector,
          stage: {
            name: 'calibrate:' + spec.key,
            weights: [{ spec, scale: 1, normalizer: 1, max: null }],
          },
          maxClimateCuts,
          onProgress,
        })

        if (!result.feasible || !result.plan) {
          return {
            ratePerHour: 0,
            targetRate: 0,
            objectiveRate: 0,
            rows: [],
            runnableRecipes: [],
            scenario: {},
            scenarioLabel: 'No feasible plan',
            utilityWorkers: 0,
            infeasible: true,
            searchExhausted: String(result.status || '').startsWith('climate-'),
            climateLayout: result.climate || {
              feasible: false,
              status: result.status,
              message: 'The MIP or climate layer found no feasible plan.',
            },
            objectiveWeights: [],
            optimizerStats: {
              engine: 'highs-mip-next',
              elapsedMs: performance.now() - started,
              buildMs,
              climateCuts: climate.count,
              modelStatus: result.status,
            },
          }
        }

        latest = result
        const vectorNow = built.objectiveVectors.get(spec.key)
        const values = result.solution.colValue
        let maximum = 0
        for (let col = 0; col < Math.min(vectorNow.length, values.length); col++) {
          maximum += Number(vectorNow[col] || 0) * Number(values[col] || 0)
        }
        maxima.set(spec.key, Math.max(0, maximum))
      }

      activeWeights = built.specs
        .map((spec) => {
          const max = Number(maxima.get(spec.key) || 0)
          if (spec.key !== 'primary' && max <= EPS) return null
          const normalizer = Math.max(EPS, Math.abs(max))
          return {
            spec,
            max,
            normalizer,
            scale: 1 / normalizer,
          }
        })
        .filter(Boolean)
    }
    let finalResult = latest
    let jointMinShare = null
    let economicObjective = null

    if (activeWeights.length > 1) {
      addFairnessRows(highs, model, built, activeWeights)

      const fairObjective = new Float64Array(model.getDimensions().numCols)
      fairObjective[built.fairnessCol] = 1
      const fair = await solveStage({
        highs,
        model,
        built,
        climate,
        objective: fairObjective,
        stage: {
          name: 'joint-fairness',
          weights: activeWeights,
        },
        maxClimateCuts,
        onProgress,
      })

      if (!fair.feasible || !fair.plan) {
        return fair.plan || {
          infeasible: true,
          rows: [],
          climateLayout: fair.climate,
        }
      }

      jointMinShare = Math.max(
        0,
        Number(fair.solution.colValue[built.fairnessCol] || 0),
      )
      model.addRow(
        Math.max(0, jointMinShare - 1e-7),
        highs.infinity,
        entries([[built.fairnessCol, 1]]),
      )

      const sumObjective = new Float64Array(model.getDimensions().numCols)
      for (const weight of activeWeights) {
        const vector = built.objectiveVectors.get(weight.spec.key)
        for (let col = 0; col < vector.length; col++) {
          sumObjective[col] += Number(vector[col] || 0) * weight.scale
        }
      }

      economicObjective = sumObjective
      finalResult = await solveStage({
        highs,
        model,
        built,
        climate,
        objective: sumObjective,
        stage: {
          name: 'joint-sum',
          weights: activeWeights,
          jointMinShare,
        },
        maxClimateCuts,
        onProgress,
      })
    } else {
      const weight = activeWeights[0] || {
        spec: built.specs[0],
        max: Number(maxima.get(built.specs[0].key) || 0),
        normalizer: 1,
        scale: 1,
      }
      economicObjective = built.objectiveVectors.get(weight.spec.key)
      finalResult = await solveStage({
        highs,
        model,
        built,
        climate,
        objective: economicObjective,
        stage: {
          name: 'final',
          weights: [weight],
        },
        maxClimateCuts,
        onProgress,
      })
    }

    if (
      state.preferElectricalAutomation
      && finalResult?.feasible
      && finalResult.plan
      && finalResult.solution
      && economicObjective
    ) {
      // Automation is a preference, never an on/off gate for Crackle.
      // Base automation is a strict economic tie-break. Max electrical coverage
      // may spend at most 3% of each active objective to push E-mode farther and
      // reduce staffed-machine demand. Hard minimum guarantees stay exact.
      const automationRetention = state.maximizeElectricalCoverage ? 0.97 : 1
      for (const weight of activeWeights) {
        const vector = built.objectiveVectors.get(weight.spec.key)
        if (!vector) continue
        const achieved = vectorValue(vector, finalResult.solution.colValue)
        addObjectiveFloor(highs, model, vector, achieved, automationRetention)
      }
      const automationObjective = electricalAutomationObjective(
        built,
        model.getDimensions().numCols,
      )
      const automated = await solveStage({
        highs,
        model,
        built,
        climate,
        objective: automationObjective,
        stage: {
          name: state.maximizeElectricalCoverage ? 'automation-max-coverage' : 'automation-tiebreak',
          weights: activeWeights,
          jointMinShare,
        },
        maxClimateCuts,
        onProgress,
      })
      if (automated?.feasible && automated.plan) finalResult = automated
    }

    if (
      built.fixedPlan
      && built.rosterAware
      && finalResult?.feasible
      && finalResult.plan
      && finalResult.solution
      && built.roster?.selectVars?.length
    ) {
      // Production is frozen before cast cleanup. These passes can choose a
      // smaller / less wasteful team; they do not get one crumb of recipe freedom.
      lockCurrentRecipeRates(highs, model, built, finalResult.solution.colValue)

      const compacted = await solveStage({
        highs,
        model,
        built,
        climate,
        objective: rosterSelectionObjective(built, model.getDimensions().numCols, 'count'),
        stage: {
          name: 'roster-compact',
          weights: activeWeights,
          jointMinShare,
        },
        maxClimateCuts,
        onProgress,
      })

      if (compacted?.feasible && compacted.plan && compacted.solution) {
        finalResult = compacted
        const selectedCount = Math.max(0, Math.round(
          built.roster.selectVars.reduce(
            (sum, item) => sum + Number(compacted.solution.colValue[item.selectCol] || 0),
            0,
          ),
        ))
        model.addRow(
          selectedCount,
          selectedCount,
          entries(built.roster.selectVars.map((item) => [item.selectCol, 1])),
        )

        const shaped = await solveStage({
          highs,
          model,
          built,
          climate,
          objective: rosterSelectionObjective(built, model.getDimensions().numCols, 'shape'),
          stage: {
            name: 'roster-shape',
            weights: activeWeights,
            jointMinShare,
          },
          maxClimateCuts,
          onProgress,
        })
        if (shaped?.feasible && shaped.plan) finalResult = shaped
      }
    }

    if (!finalResult?.feasible || !finalResult.plan) {
      return {
        ratePerHour: 0,
        targetRate: 0,
        objectiveRate: 0,
        rows: [],
        runnableRecipes: [],
        scenario: {},
        scenarioLabel: 'No feasible plan',
        utilityWorkers: 0,
        infeasible: true,
        searchExhausted: String(finalResult?.status || '').startsWith('climate-'),
        climateLayout: finalResult?.climate || null,
        objectiveWeights: activeWeights.map((weight) => ({
          ...weight.spec,
          scale: weight.scale,
          normalizer: weight.normalizer,
          max: weight.max,
        })),
        optimizerStats: {
          engine: 'highs-mip-next',
          elapsedMs: performance.now() - started,
          buildMs,
          climateCuts: climate.count,
          modelStatus: finalResult?.status || 'unknown',
        },
      }
    }

    finalResult.plan.jointMinShare = jointMinShare
    finalResult.plan.objectiveWeights = activeWeights.map((weight) => ({
      ...weight.spec,
      scale: weight.scale,
      normalizer: weight.normalizer,
      max: weight.max,
    }))

    const validation = validateNextPlan(finalResult.plan, state, data)
    finalResult.plan.optimizerStats = {
      engine: 'highs-mip-next',
      elapsedMs: performance.now() - started,
      buildMs,
      solveMs: performance.now() - started - buildMs,
      climateCuts: climate.count,
      scenarioTotal: built.scenarioTotal,
      modelCols: model.getDimensions().numCols,
      modelRows: model.getDimensions().numRows,
      mipNodes: String(model.info.get('mip_node_count') ?? ''),
      mipGap: Number(model.info.get('mip_gap') ?? 0),
      modelStatus: finalResult.status,
      validationOk: validation.ok,
      validationErrors: validation.errors,
    }

    return finalResult.plan
  } finally {
    model.dispose()
  }
}