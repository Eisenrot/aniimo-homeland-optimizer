/// <reference lib="webworker" />

import { GAME_DATA } from '../../src/data.js'
import { productionPlacementCounts } from '../../src/climate.js'
import {
  FACILITY_PERSONALITY,
  PERSONALITY_PAIRS,
  PERSONALITY_PROFILES,
  planItemRates,
  requiredAbilities,
} from '../../src/optimizer.js'
import { loadNextHighs, solveNextWithHighs } from '../../src/solver-next/index.js'
import { ROSTER_RESIDENT_FACILITIES } from '../../src/solver-next/roster.js'
import { diagnoseFixedPlanRoster } from '../../src/solver-next/roster-diagnostics.js'
import { findSingleCopyRescue } from '../../src/solver-next/roster-rescue.js'
import type {
  OptimizerPlan,
  OptimizerState,
  SolverProgress,
  TeamAnalysisResult,
  TeamWorkerMessage,
} from '../types'

type AnalyzeRequest = {
  id: number
  state: OptimizerState
  plan: OptimizerPlan
}

function compactMember(member: any) {
  const pal = member?.pal || member || {}
  return {
    id: String(pal.id ?? ''),
    name: String(pal.name || pal.speciesName || 'Aniimo'),
    speciesName: String(pal.speciesName || pal.name || 'Aniimo'),
    form: pal.form ? String(pal.form) : undefined,
    isForm: Boolean(pal.isForm),
    abilities: { ...(pal.abilities || {}) },
    copy: Number(member?.copy ?? member?.copyIndex ?? 1),
  }
}

function utilitySignature(plan: OptimizerPlan) {
  const scenario = plan.scenario || {}
  const list = (key: string) => {
    const modes = scenario[`${key}Units`]
    if (Array.isArray(modes)) return modes.map(String).sort()
    return scenario[key] ? [String(scenario[key])] : []
  }
  return JSON.stringify({
    cooling: list('cooling'),
    heat: list('heat'),
    sunlamp: Math.max(0, Math.round(Number(scenario.sunlampCount ?? (scenario.sunlamp ? 1 : 0)) || 0)),
    generator: Math.max(0, Math.round(Number(scenario.generatorCount ?? (scenario.generator ? 1 : 0)) || 0)),
    pairCold: Math.max(0, Math.round(Number(scenario.overlapColdCount || 0))),
    pairWarm: Math.max(0, Math.round(Number(scenario.overlapWarmCount || 0))),
  })
}

function expectedPlanUnits(plan: OptimizerPlan, state: OptimizerState) {
  const rows = (plan.rows || []).filter((row) => Number(row.batchesPerHour || 0) > 1e-8)
  const byFacility = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byFacility.get(row.facility) || []
    list.push(row)
    byFacility.set(row.facility, list)
  }

  const units = new Map<string, number>()
  for (const [facility, facilityRows] of byFacility) {
    const placements = productionPlacementCounts(facility, facilityRows, state, GAME_DATA)
    for (const row of facilityRows) {
      const value = ROSTER_RESIDENT_FACILITIES.has(facility) && !row.recipe.electric
        ? Number(placements.get(row) || 0)
        : Number(row.units || 0)
      units.set(String(row.recipe.id), Math.max(0, value))
    }
  }
  return units
}

function assertPlanFidelity(source: OptimizerPlan, staffed: OptimizerPlan, state: OptimizerState) {
  const sourceRows = (source.rows || []).filter((row) => Number(row.batchesPerHour || 0) > 1e-8)
  const staffedRows = (staffed.rows || []).filter((row) => Number(row.batchesPerHour || 0) > 1e-8)
  const sourceById = new Map(sourceRows.map((row) => [String(row.recipe.id), row]))
  const staffedById = new Map(staffedRows.map((row) => [String(row.recipe.id), row]))
  const expectedUnits = expectedPlanUnits(source, state)

  const added = [...staffedById.keys()].filter((id) => !sourceById.has(id))
  const dropped = [...sourceById.keys()].filter((id) => !staffedById.has(id))
  if (added.length || dropped.length) {
    throw new Error(
      `Team changed the Plan recipe set. Added: ${added.join(', ') || 'none'} · dropped: ${dropped.join(', ') || 'none'}`,
    )
  }

  for (const [id, sourceRow] of sourceById) {
    const staffedRow = staffedById.get(id)!
    const expected = Number(expectedUnits.get(id) ?? sourceRow.units ?? 0)
    const actual = Number(staffedRow.units || 0)
    if (Math.abs(actual - expected) > 1e-5) {
      throw new Error(`Team changed recipe ${id} from ${expected} physical units to ${actual}.`)
    }
    const baseline = Number(sourceRow.batchesPerHour || 0)
    if (Number(staffedRow.batchesPerHour || 0) + 1e-5 < baseline) {
      throw new Error(`Team under-ran recipe ${id}: ${staffedRow.batchesPerHour}/h < Plan ${baseline}/h.`)
    }
  }

  if (utilitySignature(source) !== utilitySignature(staffed)) {
    throw new Error('Team changed the Plan utility/electrical setup.')
  }
}

function personalityFromAssignments(
  assignments: Array<Array<{ facility: string; mode: 'permanent' | 'utility' | 'flex'; seconds: number }>>,
) {
  return {
    hints: assignments.map((workerAssignments) => {
      const weights = new Map<string, number>()
      const facilities = new Map<string, Set<string>>()

      for (const assignment of workerAssignments) {
        const letter = (FACILITY_PERSONALITY as Record<string, string>)[assignment.facility]
        if (!letter) continue
        const weight = Math.max(1e-9, Number(assignment.seconds || 0))
        weights.set(letter, (weights.get(letter) || 0) + weight)
        const set = facilities.get(letter) || new Set<string>()
        set.add(assignment.facility)
        facilities.set(letter, set)
      }

      const chosen: string[] = []
      const display = PERSONALITY_PAIRS.map((pair) => {
        const relevant = pair.filter((letter) => weights.has(letter))
        if (!relevant.length) return { char: '-', status: 'none', facilities: [] }
        const char = relevant.sort((a, b) =>
          Number(weights.get(b) || 0) - Number(weights.get(a) || 0)
          || a.localeCompare(b))[0]
        chosen.push(char)
        return {
          char,
          status: 'must',
          facilities: [...(facilities.get(char) || [])].sort(),
        }
      })

      const profile = PERSONALITY_PROFILES.find((candidate) =>
        chosen.every((letter) => candidate.includes(letter))) || PERSONALITY_PROFILES[0] || ''

      return { profile, display }
    }),
  }
}

function friendlyPhase(progress: SolverProgress) {
  const raw = String(progress.phase || '')
  if (raw === 'joint-fairness') return 'Balancing the current plan around the roster'
  if (raw === 'joint-sum') return 'Staffing the current production plan'
  if (raw === 'final') return 'Staffing the current production plan'
  if (raw === 'automation-tiebreak') return 'Checking electrical automation'
  if (raw === 'automation-max-coverage') return 'Pushing electrical coverage'
  if (raw === 'roster-compact') return 'Sending decorative employees home'
  if (raw === 'roster-shape') return 'Keeping the useful specialists out of boring chairs'
  if (raw.startsWith('calibrate:')) return 'Calibrating roster objective'
  return progress.detail || raw || 'Solving real roster'
}

self.onmessage = async (event: MessageEvent<AnalyzeRequest>) => {
  const { id, state, plan } = event.data
  const progress = (detail: string) => {
    const message: TeamWorkerMessage = { type: 'progress', id, detail }
    self.postMessage(message)
  }

  try {
    const preflight = diagnoseFixedPlanRoster(plan, state, GAME_DATA)
    if (['cap', 'resident-shortage', 'utility-shortage', 'mandatory-conflict', 'ability-shortage'].includes(preflight.kind)) {
      throw new Error(preflight.message)
    }

    progress('Loading roster solver')
    const highs = await loadNextHighs()

    progress('Staffing the current Plan with Owned Aniimo')
    const rosterPlan = await solveNextWithHighs(highs, state, GAME_DATA, {
      rosterAware: true,
      fixedPlan: plan,
      objectiveWeights: plan.objectiveWeights,
      timeLimitSeconds: 10,
      maxClimateCuts: 24,
      mipRelativeGap: 0,
      mipAbsoluteGap: 1e-7,
      onProgress(value: SolverProgress) {
        progress(friendlyPhase(value))
      },
    }) as OptimizerPlan

    if (rosterPlan.infeasible) {
      const diagnosis = diagnoseFixedPlanRoster(plan, state, GAME_DATA)
      if (diagnosis?.kind === 'workload') {
        const rescue = await findSingleCopyRescue(highs, plan, state, GAME_DATA, {
          timeLimitSeconds: 8,
          onProgress: progress,
        })
        if (rescue?.message) throw new Error(rescue.message)
      }
      throw new Error(
        diagnosis?.message
        || 'The enabled roster cannot fully staff the current Plan within the configured Aniimo cap. Team will not rewrite the Plan to fake a fit.',
      )
    }
    if (rosterPlan.optimizerStats?.validationOk === false) {
      const errors = rosterPlan.optimizerStats.validationErrors || []
      throw new Error(
        errors.length
          ? `Roster validation failed: ${errors.join(' · ')}`
          : 'Roster validation failed.',
      )
    }

    assertPlanFidelity(plan, rosterPlan, state)

    const selected = [...(rosterPlan.roster?.selected || [])]
    if (!selected.length) {
      const result: TeamAnalysisResult = {
        best: null,
        itemRates: [],
        assignments: [],
        requiredAbilities: [],
        personality: null,
      }
      self.postMessage({ type: 'result', id, result } satisfies TeamWorkerMessage)
      return
    }

    const workerIndex = new Map(selected.map((member, index) => [member.key, index]))
    const assignmentMaps = Array.from(
      { length: selected.length },
      () => new Map<string, { facility: string; mode: 'permanent' | 'utility' | 'flex'; seconds: number }>(),
    )
    const priority = { permanent: 3, utility: 2, flex: 1 }

    for (const assignment of rosterPlan.roster?.assignments || []) {
      const index = workerIndex.get(assignment.workerKey)
      if (index == null || !assignment.facility) continue
      const mode = assignment.kind === 'permanent'
        ? 'permanent'
        : assignment.kind === 'utility'
          ? 'utility'
          : 'flex'
      const map = assignmentMaps[index]
      const previous = map.get(assignment.facility)
      if (previous) {
        previous.seconds += Math.max(0, Number(assignment.seconds || 0))
        if (priority[mode] > priority[previous.mode]) previous.mode = mode
      } else {
        map.set(assignment.facility, {
          facility: assignment.facility,
          mode,
          seconds: Math.max(0, Number(assignment.seconds || 0)),
        })
      }
    }

    const assignments = assignmentMaps.map((map) => [...map.values()].sort((a, b) =>
      priority[b.mode] - priority[a.mode]
      || b.seconds - a.seconds
      || a.facility.localeCompare(b.facility)))

    progress('Assigning personality roles')
    // Personality follows the cast we actually solved. Running a second staffing
    // matcher here used to let the badge say Mine while the personality hint had
    // quietly reassigned the same Aniimo somewhere else. Tiny identity crisis.
    const personality = personalityFromAssignments(assignments)

    const result: TeamAnalysisResult = {
      best: {
        team: selected.map(compactMember),
        rate: Number(rosterPlan.ratePerHour || 0),
      },
      itemRates: planItemRates(rosterPlan, GAME_DATA)
        .filter((item: any) => Number(item.rate || 0) > 1e-8)
        .map((item: any) => ({
          item: String(item.item),
          rate: Number(item.rate || 0),
        })),
      assignments,
      requiredAbilities: requiredAbilities(rosterPlan),
      personality: {
        hints: (personality?.hints || []).map((hint: any) => ({
          profile: String(hint.profile || ''),
          display: [...(hint.display || [])].map((part: any) => ({
            char: String(part.char || ''),
            status: String(part.status || 'none'),
            facilities: [...(part.facilities || [])],
          })),
        })),
      },
    }

    self.postMessage({ type: 'result', id, result } satisfies TeamWorkerMessage)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    self.postMessage({ type: 'error', id, message: err.message } satisfies TeamWorkerMessage)
  }
}
