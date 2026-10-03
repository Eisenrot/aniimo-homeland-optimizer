import { generatorPowerAtLevel } from '../utility-system.js'
import { productionPlacementCounts } from '../climate.js'
import { isGrowerRecipe } from '../optimizer.js'
import {
  ROSTER_RESIDENT_FACILITIES,
  rosterWorkerArchetypes,
  recipeRosterTasks,
  rosterWorkerCanDo,
  utilityRosterSpecs,
  workerAdjustedCycle,
  workerTaskSpeed,
} from './roster.js'
import {
  enumerateScenarios,
  facilityCount,
  facilityOutputLimit,
  facilityStacks,
  globallyProducedItems,
  objectiveCoefficient,
  objectiveSpecs,
  recipeElectricDemand,
  staticRecipeVariants,
} from './domain.js'
import { csr } from './sparse.js'

export function buildNextModel(highs, state, data, options = {}) {
  const rosterAware = Boolean(options.rosterAware)
  const fixedPlan = rosterAware && options.fixedPlan ? options.fixedPlan : null
  const fixedRows = fixedPlan
    ? [...(fixedPlan.rows || [])].filter((row) => Number(row.batchesPerHour || 0) > 1e-8)
    : []
  const fixedRowsByRecipe = new Map(fixedRows.map((row) => [String(row.recipe?.id), row]))
  const fixedUnitsByRecipe = new Map()

  if (fixedPlan) {
    const byFacility = new Map()
    for (const row of fixedRows) {
      const list = byFacility.get(row.facility) || []
      list.push(row)
      byFacility.set(row.facility, list)
    }
    for (const [facility, rows] of byFacility) {
      const placements = productionPlacementCounts(facility, rows, state, data)
      for (const row of rows) {
        const rawUnits = Math.max(0, Number(row.units || 0))
        const targetUnits = ROSTER_RESIDENT_FACILITIES.has(facility) && !row.recipe?.electric
          ? Math.max(0, Number(placements.get(row) || 0))
          : rawUnits
        fixedUnitsByRecipe.set(String(row.recipe?.id), targetUnits)
      }
    }
  }

  const recipeState = rosterAware ? { ...state, abilityLevel: 'auto' } : state
  const specs = objectiveSpecs(state, data)
  const columns = []
  const colCost = []
  const colLower = []
  const colUpper = []
  const integrality = []

  const addColumn = (meta, lower = 0, upper = highs.infinity, integer = false) => {
    const index = columns.length
    columns.push({ ...meta, index })
    colCost.push(0)
    colLower.push(lower)
    colUpper.push(upper)
    integrality.push(integer
      ? highs.constants.variableType.integer
      : highs.constants.variableType.continuous)
    return index
  }

  const available = {
    cooling: Math.max(0, Number(state.utilityCounts?.cooling ?? (state.climateOptions?.cooling ? 1 : 0)) || 0),
    heat: Math.max(0, Number(state.utilityCounts?.heat ?? (state.climateOptions?.heat ? 1 : 0)) || 0),
    sunlamp: Math.max(0, Number(state.utilityCounts?.sunlamp ?? (state.climateOptions?.sunlamp ? 1 : 0)) || 0),
    generator: Math.max(0, Number(state.utilityCounts?.generator ?? (state.generatorAvailable ? 1 : 0)) || 0),
    powerPole: Math.max(0, Number(state.utilityCounts?.powerPole || 0) || 0),
  }

  const utilityCols = {
    cooling: {
      cool: addColumn({ kind: 'utility-count', utility: 'cooling', mode: 'Cool' }, 0, available.cooling, true),
      freeze: addColumn({ kind: 'utility-count', utility: 'cooling', mode: 'Freeze' }, 0, available.cooling, true),
    },
    heat: {
      warm: addColumn({ kind: 'utility-count', utility: 'heat', mode: 'Warm' }, 0, available.heat, true),
      scorching: addColumn({ kind: 'utility-count', utility: 'heat', mode: 'Scorching' }, 0, available.heat, true),
    },
    sunlamp: addColumn({ kind: 'utility-count', utility: 'sunlamp' }, 0, available.sunlamp, true),
    generator: addColumn({ kind: 'utility-count', utility: 'generator' }, 0, available.generator, true),
    pairCold: addColumn(
      { kind: 'utility-overlap-count', pair: 'freeze+warm=>cool' },
      0,
      Math.min(available.cooling, available.heat),
      true,
    ),
    pairWarm: addColumn(
      { kind: 'utility-overlap-count', pair: 'cool+scorching=>warm' },
      0,
      Math.min(available.cooling, available.heat),
      true,
    ),
  }

  const allActive = staticRecipeVariants(recipeState, data)
  const active = fixedPlan
    ? allActive.filter((entry) => fixedRowsByRecipe.has(String(entry.recipe.id)))
    : allActive

  if (fixedPlan) {
    const availableIds = new Set(active.map((entry) => String(entry.recipe.id)))
    const missing = [...fixedRowsByRecipe.keys()].filter((id) => !availableIds.has(id))
    if (missing.length) {
      throw new Error('Team plan references recipe rows that are no longer runnable: ' + missing.join(', '))
    }
  }

  const recipeVars = []

  for (let recipeIndex = 0; recipeIndex < active.length; recipeIndex++) {
    const entry = active[recipeIndex]
    const count = facilityCount(state, entry.recipe.facility)
    if (count <= 0) continue
    const rateCol = addColumn({
      kind: 'rate',
      recipeIndex,
      recipe: entry.recipe,
      cycle: entry.cycle,
      labor: entry.labor,
      env: entry.env,
    })
    const electric = Boolean(entry.recipe.electric)
    const powerDemand = electric ? recipeElectricDemand(state, data, entry.recipe) : 0
    const unitCol = addColumn({
      kind: 'unit',
      recipeIndex,
      recipe: entry.recipe,
      cycle: entry.cycle,
      env: entry.env,
      electric,
      powerDemand,
    }, 0, count, Boolean(state.oneRecipePerFacility || electric || (rosterAware && ROSTER_RESIDENT_FACILITIES.has(entry.recipe.facility))))

    recipeVars.push({
      recipeIndex,
      recipe: entry.recipe,
      cycle: entry.cycle,
      labor: entry.labor,
      env: entry.env,
      electric,
      powerDemand,
      rateCol,
      unitCol,
    })
  }

  const fairnessCol = addColumn({ kind: 'fairness', name: 'joint-min-share' }, 0, 1, false)
  const powerEtaCol = addColumn({ kind: 'power-efficiency', name: 'grid-efficiency' }, 0, 1.2, false)
  const powerBitVars = []

  // Binary expansion of each electric recipe's whole active-facility count.
  // productCol linearizes eta * bit, so shared grid efficiency remains linear.
  for (const entry of recipeVars) {
    if (!entry.electric) continue
    const cap = Math.max(1, facilityCount(state, entry.recipe.facility))
    const bits = Math.max(1, Math.ceil(Math.log2(cap + 1)))
    for (let bit = 0; bit < bits; bit++) {
      const value = 2 ** bit
      const bitCol = addColumn({
        kind: 'power-unit-bit',
        recipeId: entry.recipe.id,
        bit,
        value,
      }, 0, 1, true)
      const productCol = addColumn({
        kind: 'power-eta-bit-product',
        recipeId: entry.recipe.id,
        bit,
        value,
      }, 0, 1.2, false)
      powerBitVars.push({ entry, bit, value, bitCol, productCol })
    }
  }

  const rosterArchetypes = rosterAware ? rosterWorkerArchetypes(state, data, recipeVars, { pruneDominated: !fixedPlan }) : []
  const rosterWorkerCount = rosterArchetypes.reduce((sum, archetype) => sum + archetype.count, 0)
  const rosterCap = rosterAware
    ? Math.max(0, Math.min(rosterWorkerCount, Math.floor(Number(state.workerSlots ?? state.teamSlots ?? 0) || 0)))
    : 0
  const rosterSelectVars = []
  const rosterFlexVars = []
  const rosterResidentVars = []
  const rosterUtilityVars = []
  const rosterTasksByEntry = new Map()

  if (rosterAware) {
    for (const archetype of rosterArchetypes) {
      const cap = Math.min(archetype.count, rosterCap)
      if (cap <= 0) continue
      rosterSelectVars.push({
        archetype,
        selectCol: addColumn({ kind: 'roster-worker-selected', archetypeKey: archetype.key }, 0, cap, true),
      })
    }

    for (const entry of recipeVars) {
      if (entry.electric) continue
      const tasks = recipeRosterTasks(entry)
      rosterTasksByEntry.set(entry, tasks)
      const resident = ROSTER_RESIDENT_FACILITIES.has(entry.recipe.facility)

      if (resident) {
        const task = tasks[0]
        if (!task) continue
        for (const archetype of rosterArchetypes) {
          const worker = archetype.representative
          if (!rosterWorkerCanDo(worker, task)) continue
          const cycle = workerAdjustedCycle(entry, worker, task, state)
          if (!Number.isFinite(cycle) || cycle <= 1e-12) continue
          const cap = Math.min(archetype.count, rosterCap)
          if (cap <= 0) continue
          rosterResidentVars.push({
            entry, task, archetype, cycle,
            assignCol: addColumn({
              kind: 'roster-resident-assignment',
              archetypeKey: archetype.key,
              recipeId: entry.recipe.id,
            }, 0, cap, true),
          })
        }
        continue
      }

      for (const task of tasks) {
        for (const archetype of rosterArchetypes) {
          const worker = archetype.representative
          const speed = workerTaskSpeed(entry, worker, task, state)
          if (speed <= 1e-12) continue
          const cap = Math.min(archetype.count, rosterCap)
          if (cap <= 0) continue
          rosterFlexVars.push({
            entry, task, archetype, speed,
            timeCol: addColumn({
              kind: 'roster-flex-time',
              archetypeKey: archetype.key,
              recipeId: entry.recipe.id,
              taskKey: task.key,
            }, 0, 3600 * cap, false),
          })
        }
      }
    }

    for (const spec of utilityRosterSpecs(state)) {
      for (const archetype of rosterArchetypes) {
        if (!rosterWorkerCanDo(archetype.representative, spec)) continue
        const cap = Math.min(archetype.count, rosterCap)
        if (cap <= 0) continue
        rosterUtilityVars.push({
          spec, archetype,
          assignCol: addColumn({
            kind: 'roster-utility-assignment',
            archetypeKey: archetype.key,
            utility: spec.utility,
            mode: spec.mode,
          }, 0, cap, true),
        })
      }
    }
  }
  const rows = []
  const rowLower = []
  const rowUpper = []
  const rowMeta = []
  const addRow = (terms, lower, upper, meta) => {
    rows.push(terms)
    rowLower.push(lower)
    rowUpper.push(upper)
    rowMeta.push(meta)
  }

  if (fixedPlan) {
    const scenario = fixedPlan.scenario || {}
    const modes = (key) => {
      const list = scenario[key + 'Units']
      if (Array.isArray(list)) return list.map(String)
      const value = scenario[key]
      return value ? [String(value)] : []
    }
    const cooling = modes('cooling')
    const heat = modes('heat')
    const fixedUtilities = [
      [utilityCols.cooling.cool, cooling.filter((mode) => mode === 'Cool').length, 'cooling:cool'],
      [utilityCols.cooling.freeze, cooling.filter((mode) => mode === 'Freeze').length, 'cooling:freeze'],
      [utilityCols.heat.warm, heat.filter((mode) => mode === 'Warm').length, 'heat:warm'],
      [utilityCols.heat.scorching, heat.filter((mode) => mode === 'Scorching').length, 'heat:scorching'],
      [utilityCols.sunlamp, Math.max(0, Math.round(Number(scenario.sunlampCount ?? (scenario.sunlamp ? 1 : 0)) || 0)), 'sunlamp'],
      [utilityCols.generator, Math.max(0, Math.round(Number(scenario.generatorCount ?? (scenario.generator ? 1 : 0)) || 0)), 'generator'],
      [utilityCols.pairCold, Math.max(0, Math.round(Number(scenario.overlapColdCount || 0))), 'overlap:cold'],
      [utilityCols.pairWarm, Math.max(0, Math.round(Number(scenario.overlapWarmCount || 0))), 'overlap:warm'],
    ]
    for (const [col, value, key] of fixedUtilities) {
      addRow([[col, 1]], value, value, { kind: 'team-plan-utility-lock', key, value })
    }

    for (const entry of recipeVars) {
      const row = fixedRowsByRecipe.get(String(entry.recipe.id))
      if (!row) continue
      const units = Math.max(0, Number(fixedUnitsByRecipe.get(String(entry.recipe.id)) ?? row.units ?? 0))
      const baselineRate = Math.max(0, Number(row.batchesPerHour || 0))
      addRow([[entry.unitCol, 1]], units, units, {
        kind: 'team-plan-unit-lock',
        recipeId: entry.recipe.id,
        units,
      })
      addRow([[entry.rateCol, 1]], baselineRate, highs.infinity, {
        kind: 'team-plan-rate-floor',
        recipeId: entry.recipe.id,
        baselineRate,
      })
    }
  }

  // Utility copy availability. A selected count is a maximum the solver may use.
  addRow([
    [utilityCols.cooling.cool, 1],
    [utilityCols.cooling.freeze, 1],
  ], -highs.infinity, available.cooling, { kind: 'utility-cap', utility: 'cooling' })
  addRow([
    [utilityCols.heat.warm, 1],
    [utilityCols.heat.scorching, 1],
  ], -highs.infinity, available.heat, { kind: 'utility-cap', utility: 'heat' })

  // Each overlap consumes one field of each stated mode. The field itself can
  // still serve its direct temperature outside the intersection.
  addRow([[utilityCols.pairCold, 1], [utilityCols.cooling.freeze, -1]], -highs.infinity, 0, { kind: 'overlap-cap', pair: 'cold', side: 'cooling' })
  addRow([[utilityCols.pairCold, 1], [utilityCols.heat.warm, -1]], -highs.infinity, 0, { kind: 'overlap-cap', pair: 'cold', side: 'heat' })
  addRow([[utilityCols.pairWarm, 1], [utilityCols.cooling.cool, -1]], -highs.infinity, 0, { kind: 'overlap-cap', pair: 'warm', side: 'cooling' })
  addRow([[utilityCols.pairWarm, 1], [utilityCols.heat.scorching, -1]], -highs.infinity, 0, { kind: 'overlap-cap', pair: 'warm', side: 'heat' })

  const climateService = (env) => {
    if (env === 'Freeze') return [[utilityCols.cooling.freeze, 1]]
    if (env === 'Cool') return [[utilityCols.cooling.cool, 1], [utilityCols.pairCold, 1]]
    if (env === 'Warm') return [[utilityCols.heat.warm, 1], [utilityCols.pairWarm, 1]]
    if (env === 'Scorching') return [[utilityCols.heat.scorching, 1]]
    if (env === 'Adequate') return [[utilityCols.sunlamp, 1]]
    return null
  }

  for (const entry of recipeVars) {
    const cap = facilityCount(state, entry.recipe.facility)

    // The theoretical sheet gets the simple cycle link. The roster solve is
    // fussier: growers still sit on the plot for the full grow cycle, while
    // staffed machines use the real worker seconds we assign further down.
    if (!entry.electric && (!rosterAware || isGrowerRecipe(entry.recipe))) {
      addRow([
        [entry.rateCol, entry.cycle / 3600],
        [entry.unitCol, -1],
      ], -highs.infinity, 0, {
        kind: 'rate-unit-link',
        recipeId: entry.recipe.id,
      })
    }

    const service = climateService(entry.env)
    if (service) {
      addRow([
        [entry.unitCol, 1],
        ...service.map(([col, coefficient]) => [col, -cap * coefficient]),
      ], -highs.infinity, 0, {
        kind: 'climate-gate',
        recipeId: entry.recipe.id,
        env: entry.env,
      })
    }
  }

  const facilities = [...new Set(recipeVars.map((entry) => entry.recipe.facility))]
  for (const slug of facilities) {
    const stacks = facilityStacks(state, slug)
    const thresholds = [...new Set(
      recipeVars
        .filter((entry) => entry.recipe.facility === slug)
        .map((entry) => Number(entry.recipe.level || 1)),
    )].sort((a, b) => a - b)

    for (const level of thresholds) {
      const cap = stacks
        .filter((entry) => entry.level >= level)
        .reduce((sum, entry) => sum + entry.count, 0)
      if (cap <= 0) continue

      const terms = []
      for (const entry of recipeVars) {
        if (entry.recipe.facility === slug && Number(entry.recipe.level || 1) >= level) {
          terms.push([entry.unitCol, 1])
        }
      }
      if (terms.length) {
        addRow(terms, -highs.infinity, cap, {
          kind: 'facility-capacity',
          facility: slug,
          level,
        })
      }

      const collect = Math.max(0, Number(state.collectHours || 0))
      if (collect > 0) {
        const batchCap = stacks
          .filter((entry) => entry.level >= level)
          .reduce((sum, entry) => sum + entry.count * facilityOutputLimit(data, slug, entry.level), 0)
        if (batchCap > 0) {
          const collectTerms = []
          for (const entry of recipeVars) {
            if (entry.recipe.facility === slug && Number(entry.recipe.level || 1) >= level) {
              collectTerms.push([entry.rateCol, collect])
            }
          }
          if (collectTerms.length) {
            addRow(collectTerms, -highs.infinity, batchCap, {
              kind: 'collection-capacity',
              facility: slug,
              level,
            })
          }
        }
      }
    }
  }

  const produced = globallyProducedItems(data)
  const consumed = new Set(
    recipeVars.flatMap((entry) => (entry.recipe.inputs || []).map((item) => Number(item.item))),
  )
  for (const item of consumed) {
    if (!produced.has(item)) continue
    const terms = []
    for (const entry of recipeVars) {
      let net = 0
      for (const output of entry.recipe.outputs || []) {
        if (Number(output.item) === item) net += Number(output.qty || 0)
      }
      for (const input of entry.recipe.inputs || []) {
        if (Number(input.item) === item) net -= Number(input.qty || 0)
      }
      if (Math.abs(net) > 1e-14) terms.push([entry.rateCol, net])
    }
    if (terms.length) addRow(terms, 0, highs.infinity, { kind: 'material-balance', item })
  }

  for (const guarantee of state.guarantees || []) {
    if (guarantee.enabled === false || guarantee.maximize) continue
    const item = Number(guarantee.item)
    const minimum = Math.max(0, Number(guarantee.perHour || 0))
    if (!item || minimum <= 0) continue
    const terms = []
    for (const entry of recipeVars) {
      let net = 0
      for (const output of entry.recipe.outputs || []) {
        if (Number(output.item) === item) net += Number(output.qty || 0)
      }
      for (const input of entry.recipe.inputs || []) {
        if (Number(input.item) === item) net -= Number(input.qty || 0)
      }
      if (Math.abs(net) > 1e-14) terms.push([entry.rateCol, net])
    }
    addRow(terms, minimum, highs.infinity, {
      kind: 'guarantee-floor',
      item,
      minimum,
    })
  }

  if (!rosterAware) {
    const workerRaw = state.workerSlots ?? state.teamSlots
    if (workerRaw != null) {
      const workerLimit = Math.max(0, Number(workerRaw) || 0)
      const terms = []
      const residentFacilities = new Set([
        'mine', 'well', 'dewy-house', 'tidewhisper-sandcastle',
        'nimbus-bed', 'starfall-hammock', 'floral-windmill',
      ])
      for (const entry of recipeVars) {
        if (entry.electric) continue
        // Resident facilities consume one physical Aniimo for every active
        // manual facility unit, even when its measured work time is short.
        // They cannot lend the idle-looking remainder of the hour elsewhere.
        if (residentFacilities.has(entry.recipe.facility)) {
          terms.push([entry.unitCol, 1])
        } else if (entry.labor > 1e-14) {
          terms.push([entry.rateCol, entry.labor / 3600])
        }
      }
      terms.push([utilityCols.cooling.cool, 1])
      terms.push([utilityCols.cooling.freeze, 1])
      terms.push([utilityCols.heat.warm, 1])
      terms.push([utilityCols.heat.scorching, 1])
      terms.push([utilityCols.sunlamp, 1])
      terms.push([utilityCols.generator, 1])
      addRow(terms, -highs.infinity, workerLimit, {
        kind: 'worker-capacity',
        workerLimit,
        residentsAreDedicated: true,
      })
    }

  }

  if (rosterAware) {
    const selectByArchetype = new Map(rosterSelectVars.map((item) => [item.archetype.key, item.selectCol]))
    const flexByArchetype = new Map()
    const residentByArchetype = new Map()
    const utilityByArchetype = new Map()
    const flexByEntry = new Map()
    const residentByEntry = new Map()

    for (const item of rosterFlexVars) {
      const byType = flexByArchetype.get(item.archetype.key) || []
      byType.push(item)
      flexByArchetype.set(item.archetype.key, byType)
      const byEntry = flexByEntry.get(item.entry) || []
      byEntry.push(item)
      flexByEntry.set(item.entry, byEntry)
    }
    for (const item of rosterResidentVars) {
      const byType = residentByArchetype.get(item.archetype.key) || []
      byType.push(item)
      residentByArchetype.set(item.archetype.key, byType)
      const byEntry = residentByEntry.get(item.entry) || []
      byEntry.push(item)
      residentByEntry.set(item.entry, byEntry)
    }
    for (const item of rosterUtilityVars) {
      const byType = utilityByArchetype.get(item.archetype.key) || []
      byType.push(item)
      utilityByArchetype.set(item.archetype.key, byType)
    }

    // Free Team solves fill the cap because HiGHS behaves better with less fog.
    // A plan-locked Team solve keeps this as a real "up to N" cap so the final
    // compacting pass can stop hiring decorative employees for emotional support.
    addRow(
      rosterSelectVars.map((item) => [item.selectCol, 1]),
      fixedPlan ? -highs.infinity : rosterCap,
      rosterCap,
      { kind: 'roster-worker-cap', workerLimit: rosterCap, fixedPlan: Boolean(fixedPlan) },
    )

    for (const archetype of rosterArchetypes) {
      const selectCol = selectByArchetype.get(archetype.key)
      if (selectCol == null) continue
      const terms = [[selectCol, -1]]
      for (const item of flexByArchetype.get(archetype.key) || []) terms.push([item.timeCol, 1 / 3600])
      for (const item of residentByArchetype.get(archetype.key) || []) terms.push([item.assignCol, 1])
      for (const item of utilityByArchetype.get(archetype.key) || []) terms.push([item.assignCol, 1])
      addRow(terms, -highs.infinity, 0, {
        kind: 'roster-worker-time',
        archetypeKey: archetype.key,
      })
    }

    const utilityColFor = (spec) => {
      if (spec.key === 'cooling:cool') return utilityCols.cooling.cool
      if (spec.key === 'cooling:freeze') return utilityCols.cooling.freeze
      if (spec.key === 'heat:warm') return utilityCols.heat.warm
      if (spec.key === 'heat:scorching') return utilityCols.heat.scorching
      if (spec.key === 'sunlamp') return utilityCols.sunlamp
      if (spec.key === 'generator') return utilityCols.generator
      return null
    }

    for (const spec of utilityRosterSpecs(state)) {
      const utilityCol = utilityColFor(spec)
      if (utilityCol == null) continue
      const terms = rosterUtilityVars
        .filter((item) => item.spec.key === spec.key)
        .map((item) => [item.assignCol, 1])
      terms.push([utilityCol, -1])
      addRow(terms, 0, 0, {
        kind: 'roster-utility-cover',
        utility: spec.utility,
        mode: spec.mode,
      })
    }

    for (const entry of recipeVars) {
      if (entry.electric) continue
      const resident = ROSTER_RESIDENT_FACILITIES.has(entry.recipe.facility)
      const tasks = rosterTasksByEntry.get(entry) || []

      if (resident) {
        const candidates = residentByEntry.get(entry) || []
        addRow([
          ...candidates.map((item) => [item.assignCol, 1]),
          [entry.unitCol, -1],
        ], 0, 0, { kind: 'roster-resident-cover', recipeId: entry.recipe.id })
        addRow([
          [entry.rateCol, 1],
          ...candidates.map((item) => [item.assignCol, -3600 / item.cycle]),
        ], -highs.infinity, 0, { kind: 'roster-resident-throughput', recipeId: entry.recipe.id })
        continue
      }

      const flex = flexByEntry.get(entry) || []
      for (const task of tasks) {
        addRow([
          [entry.rateCol, task.baselineSeconds],
          ...flex.filter((item) => item.task.key === task.key).map((item) => [item.timeCol, -item.speed]),
        ], -highs.infinity, 0, {
          kind: 'roster-task-demand',
          recipeId: entry.recipe.id,
          taskKey: task.key,
        })
      }

      if (!isGrowerRecipe(entry.recipe)) {
        const fixedSeconds = Math.max(0, Number(entry.cycle || 0) - Number(entry.labor || 0))
        addRow([
          [entry.rateCol, fixedSeconds / 3600],
          ...flex.map((item) => [item.timeCol, 1 / 3600]),
          [entry.unitCol, -1],
        ], -highs.infinity, 0, { kind: 'roster-rate-unit-link', recipeId: entry.recipe.id })
      }
    }
  }
  // Shared Crackle grid efficiency without power-state enumeration.
  const powerBitsByEntry = new Map()
  for (const bit of powerBitVars) {
    const list = powerBitsByEntry.get(bit.entry) || []
    list.push(bit)
    powerBitsByEntry.set(bit.entry, list)
  }

  for (const entry of recipeVars) {
    if (!entry.electric) continue
    const bits = powerBitsByEntry.get(entry) || []
    addRow([
      [entry.unitCol, 1],
      ...bits.map((bit) => [bit.bitCol, -bit.value]),
    ], 0, 0, {
      kind: 'power-unit-binary-expansion',
      recipeId: entry.recipe.id,
    })

    for (const bit of bits) {
      // y = eta * b, with 0 <= eta <= 1.2 and b binary.
      addRow([
        [bit.productCol, 1],
        [bit.bitCol, -1.2],
      ], -highs.infinity, 0, {
        kind: 'power-product-upper-bit',
        recipeId: entry.recipe.id,
        bit: bit.bit,
      })
      addRow([
        [bit.productCol, 1],
        [powerEtaCol, -1],
      ], -highs.infinity, 0, {
        kind: 'power-product-upper-eta',
        recipeId: entry.recipe.id,
        bit: bit.bit,
      })
      addRow([
        [bit.productCol, 1],
        [powerEtaCol, -1],
        [bit.bitCol, -1.2],
      ], -1.2, highs.infinity, {
        kind: 'power-product-lower',
        recipeId: entry.recipe.id,
        bit: bit.bit,
      })
    }

    addRow([
      [entry.rateCol, entry.cycle / 3600],
      ...bits.map((bit) => [bit.productCol, -bit.value]),
    ], -highs.infinity, 0, {
      kind: 'electric-rate-cap',
      recipeId: entry.recipe.id,
    })
  }

  const generatorPower = generatorPowerAtLevel(Number(state.generatorLevel || 1))
  addRow([
    ...powerBitVars.map((bit) => [bit.productCol, bit.entry.powerDemand * bit.value]),
    [utilityCols.generator, -generatorPower],
  ], -highs.infinity, 0, {
    kind: 'power-grid-balance',
    generatorPower,
  })

  const objectiveVectors = new Map()
  for (const spec of specs) {
    const vector = new Float64Array(columns.length)
    for (const entry of recipeVars) {
      vector[entry.rateCol] = objectiveCoefficient(entry.recipe, spec, data)
    }
    objectiveVectors.set(spec.key, vector)
  }

  const modelData = {
    modelName: 'aniimo-solver-next-utility-grid',
    numCols: columns.length,
    numRows: rows.length,
    sense: highs.constants.objectiveSense.maximize,
    colCost,
    colLower,
    colUpper,
    integrality,
    rowLower,
    rowUpper,
    matrix: csr(rows, columns.length),
  }

  return {
    state,
    data,
    specs,
    columns,
    fairnessCol,
    recipeVars,
    objectiveVectors,
    rowMeta,
    utilityCols,
    powerEtaCol,
    powerBitVars,
    availableUtilities: available,
    rosterAware,
    fixedPlan: Boolean(fixedPlan),
    fixedRows,
    fixedUnitsByRecipe,
    roster: rosterAware ? {
      cap: rosterCap,
      archetypes: rosterArchetypes,
      selectVars: rosterSelectVars,
      flexVars: rosterFlexVars,
      residentVars: rosterResidentVars,
      utilityVars: rosterUtilityVars,
      tasksByEntry: rosterTasksByEntry,
    } : null,
    scenarioTotal: enumerateScenarios(state).length,
    modelData,
  }
}