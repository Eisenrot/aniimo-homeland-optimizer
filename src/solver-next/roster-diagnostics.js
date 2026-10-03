import { productionPlacementCounts } from '../climate.js'
import { familyId } from '../optimizer.js'
import {
  ROSTER_RESIDENT_FACILITIES,
  ownedWorkerCopies,
  recipeRosterTasks,
  rosterWorkerCanDo,
  utilityRosterSpecs,
} from './roster.js'

const EPS = 1e-8

function facilityName(data, slug) {
  return data.facilities?.find((facility) => facility.slug === slug)?.name || slug
}

function itemName(data, row) {
  const item = row?.recipe?.outputs?.[0]?.item
  return data.items?.[String(item)]?.name || String(item || row?.recipe?.id || 'production')
}

function utilityFacility(spec) {
  if (spec.utility === 'cooling') return 'cooling-unit'
  if (spec.utility === 'heat') return 'heat-furnace'
  if (spec.utility === 'sunlamp') return 'sunlamp'
  return 'crackle-generator'
}

function utilityCounts(plan) {
  const scenario = plan?.scenario || {}
  const cooling = Array.isArray(scenario.coolingUnits)
    ? scenario.coolingUnits.map(String)
    : scenario.cooling ? [String(scenario.cooling)] : []
  const heat = Array.isArray(scenario.heatUnits)
    ? scenario.heatUnits.map(String)
    : scenario.heat ? [String(scenario.heat)] : []

  return new Map([
    ['cooling:cool', cooling.filter((mode) => mode === 'Cool').length],
    ['cooling:freeze', cooling.filter((mode) => mode === 'Freeze').length],
    ['heat:warm', heat.filter((mode) => mode === 'Warm').length],
    ['heat:scorching', heat.filter((mode) => mode === 'Scorching').length],
    ['sunlamp', Math.max(0, Math.round(Number(scenario.sunlampCount ?? (scenario.sunlamp ? 1 : 0)) || 0))],
    ['generator', Math.max(0, Math.round(Number(scenario.generatorCount ?? (scenario.generator ? 1 : 0)) || 0))],
  ])
}

function residentJobs(plan, state, data) {
  const rows = (plan?.rows || []).filter((row) =>
    Number(row.batchesPerHour || 0) > EPS
    && !row.recipe?.electric
    && ROSTER_RESIDENT_FACILITIES.has(row.facility))

  const byFacility = new Map()
  for (const row of rows) {
    const list = byFacility.get(row.facility) || []
    list.push(row)
    byFacility.set(row.facility, list)
  }

  const jobs = []
  for (const [facility, facilityRows] of byFacility) {
    const placements = productionPlacementCounts(facility, facilityRows, state, data)
    for (const row of facilityRows) {
      const entry = {
        recipe: row.recipe,
        electric: false,
        labor: Number(row.baselineManualSeconds ?? row.manualSeconds ?? 0),
        cycle: Number(row.baselineCycleSeconds ?? row.cycleSeconds ?? 0),
      }
      const task = recipeRosterTasks(entry)[0]
      if (!task) continue
      const count = Math.max(0, Math.round(Number(placements.get(row) || 0)))
      for (let copy = 1; copy <= count; copy++) {
        jobs.push({
          key: `resident:${row.recipe.id}:${copy}`,
          kind: 'resident',
          facility,
          facilityName: facilityName(data, facility),
          output: itemName(data, row),
          recipeId: row.recipe.id,
          task,
          familyName: row.recipe.petName || null,
        })
      }
    }
  }
  return jobs
}

function utilityJobs(plan, state, data) {
  const counts = utilityCounts(plan)
  const jobs = []
  for (const spec of utilityRosterSpecs(state)) {
    const count = Math.max(0, Number(counts.get(spec.key) || 0))
    for (let copy = 1; copy <= count; copy++) {
      const facility = utilityFacility(spec)
      jobs.push({
        key: `utility:${spec.key}:${copy}`,
        kind: 'utility',
        facility,
        facilityName: facilityName(data, facility),
        output: null,
        recipeId: null,
        task: { ...spec, family: null },
        familyName: null,
      })
    }
  }
  return jobs
}

function candidatesFor(job, workers) {
  return workers.filter((worker) => rosterWorkerCanDo(worker, job.task))
}

function groupJobs(jobs) {
  const groups = new Map()
  for (const job of jobs) {
    const key = [
      job.kind,
      job.facility,
      job.recipeId || '',
      job.task.ability,
      job.task.level,
      job.task.family || '',
    ].join('|')
    const group = groups.get(key) || { ...job, jobs: [] }
    group.jobs.push(job)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function requirementLabel(group) {
  const family = group.task.family
    ? `${group.familyName || 'required resident'} family / `
    : ''
  return `${family}${group.task.ability} Lv.${group.task.level}`
}

function formatShortage(group, need, have) {
  const subject = group.output
    ? `${group.facilityName} for ${group.output}`
    : group.facilityName
  return `${subject} needs ${need} x ${requirementLabel(group)}, but Owned Aniimo has ${have} eligible cop${have === 1 ? 'y' : 'ies'}.`
}

function maximumMandatoryMatching(jobs, workers) {
  const candidates = jobs.map((job) => candidatesFor(job, workers).map((worker) => worker.key))
  const workerToJob = new Map()

  const visit = (jobIndex, seen) => {
    for (const workerKey of candidates[jobIndex]) {
      if (seen.has(workerKey)) continue
      seen.add(workerKey)
      const previous = workerToJob.get(workerKey)
      if (previous == null || visit(previous, seen)) {
        workerToJob.set(workerKey, jobIndex)
        return true
      }
    }
    return false
  }

  let matched = 0
  for (let jobIndex = 0; jobIndex < jobs.length; jobIndex++) {
    if (visit(jobIndex, new Set())) matched++
  }

  const matchedJobs = new Set(workerToJob.values())
  return {
    matched,
    unmatched: jobs.filter((_, index) => !matchedJobs.has(index)),
  }
}

function flexibleHardBlockers(plan, state, data, workers) {
  const blockers = []
  for (const row of plan?.rows || []) {
    if (
      Number(row.batchesPerHour || 0) <= EPS
      || row.recipe?.electric
      || ROSTER_RESIDENT_FACILITIES.has(row.facility)
    ) continue

    const entry = {
      recipe: row.recipe,
      electric: false,
      labor: Number(row.baselineManualSeconds ?? row.manualSeconds ?? 0),
      cycle: Number(row.baselineCycleSeconds ?? row.cycleSeconds ?? 0),
    }
    for (const task of recipeRosterTasks(entry)) {
      const requiredSeconds = Number(task.baselineSeconds || 0) * Number(row.batchesPerHour || 0)
      if (requiredSeconds <= EPS) continue
      if (workers.some((worker) => rosterWorkerCanDo(worker, task))) continue
      blockers.push({
        row,
        task,
        requiredSeconds,
      })
    }
  }
  return blockers
}

export function diagnoseFixedPlanRoster(plan, state, data) {
  if (!plan || plan.infeasible) {
    return {
      kind: 'missing-plan',
      message: 'There is no valid Plan to staff yet.',
    }
  }

  const workers = ownedWorkerCopies(state, data)
  const cap = Math.max(0, Math.floor(Number(state.workerSlots ?? state.teamSlots ?? 0) || 0))
  const residents = residentJobs(plan, state, data)
  const utilities = utilityJobs(plan, state, data)
  const mandatory = [...residents, ...utilities]

  if (cap < mandatory.length) {
    return {
      kind: 'cap',
      message: `The Plan already needs ${mandatory.length} full-time resident / utility workers before normal crafting starts, but the Aniimo cap is ${cap}. Raise the cap to at least ${mandatory.length}.`,
      mandatoryJobs: mandatory.length,
      cap,
    }
  }

  for (const group of groupJobs(mandatory)) {
    const eligible = new Set()
    for (const job of group.jobs) {
      for (const worker of candidatesFor(job, workers)) eligible.add(worker.key)
    }
    if (eligible.size < group.jobs.length) {
      const familyCopies = group.task.family
        ? workers.filter((worker) => familyId(worker.pal?.id) === Number(group.task.family)).length
        : null
      const detail = group.task.family && familyCopies > 0 && eligible.size === 0
        ? ` You have ${familyCopies} enabled cop${familyCopies === 1 ? 'y' : 'ies'} from that family, but none reach ${group.task.ability} Lv.${group.task.level}.`
        : ''

      return {
        kind: group.kind === 'resident' ? 'resident-shortage' : 'utility-shortage',
        message: `${formatShortage(group, group.jobs.length, eligible.size)}${detail} More team slots will not help until that Owned Aniimo requirement is covered.`,
        requirement: {
          facility: group.facility,
          recipeId: group.recipeId,
          ability: group.task.ability,
          level: group.task.level,
          family: group.task.family || null,
          familyName: group.familyName,
          familyCopies,
          need: group.jobs.length,
          eligible: eligible.size,
        },
      }
    }
  }

  const matching = maximumMandatoryMatching(mandatory, workers)
  if (matching.matched < mandatory.length) {
    const example = matching.unmatched[0]
    return {
      kind: 'mandatory-conflict',
      message: `Owned Aniimo can individually qualify for the Plan's resident / utility jobs, but the same small worker pool is being reused by competing full-time jobs. Only ${matching.matched} of ${mandatory.length} mandatory chairs can be filled at once. Example conflict: ${example.facilityName} needs ${requirementLabel(example)}. More team slots alone will not help.`,
      mandatoryJobs: mandatory.length,
      matched: matching.matched,
    }
  }

  const flexibleBlockers = flexibleHardBlockers(plan, state, data, workers)
  if (flexibleBlockers.length) {
    const blocker = flexibleBlockers[0]
    return {
      kind: 'ability-shortage',
      message: `${facilityName(data, blocker.row.facility)} for ${itemName(data, blocker.row)} needs ${blocker.task.ability} Lv.${blocker.task.level}, but no enabled Owned Aniimo can perform it. More team slots will not help until that ability is enabled.`,
      requirement: {
        facility: blocker.row.facility,
        recipeId: blocker.row.recipe?.id,
        ability: blocker.task.ability,
        level: blocker.task.level,
        family: blocker.task.family || null,
      },
    }
  }

  const remaining = Math.max(0, cap - mandatory.length)
  return {
    kind: 'workload',
    message: `The mandatory resident and utility jobs are coverable, but the enabled roster still cannot supply enough compatible production time to run this exact Plan inside the ${cap}-Aniimo cap. ${mandatory.length} slots are already reserved full-time, leaving at most ${remaining} for the remaining crafting work.`,
    mandatoryJobs: mandatory.length,
    cap,
    remaining,
  }
}
