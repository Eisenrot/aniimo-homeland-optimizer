/// <reference lib="webworker" />

import { GAME_DATA } from '../../src/data.js'
import {
  buildTeamModel,
  planItemRates,
  recommendPersonalityRoles,
  requiredAbilities,
} from '../../src/optimizer.js'
import { loadNextHighs, solveNextWithHighs } from '../../src/solver-next/index.js'
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

function friendlyPhase(progress: SolverProgress) {
  const raw = String(progress.phase || '')
  if (raw === 'joint-fairness') return 'Balancing the real roster'
  if (raw === 'joint-sum') return 'Rebuilding production around the team'
  if (raw === 'final') return 'Rebuilding production around the team'
  if (raw === 'automation-tiebreak') return 'Checking electrical automation'
  if (raw === 'automation-max-coverage') return 'Pushing electrical coverage'
  if (raw === 'roster-compact') return 'Sending decorative employees home'
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
    progress('Loading roster solver')
    const highs = await loadNextHighs()

    progress('Rebuilding production around Owned Aniimo')
    const rosterPlan = await solveNextWithHighs(highs, state, GAME_DATA, {
      rosterAware: true,
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
      throw new Error('The enabled roster cannot run a legal version of this production setup.')
    }
    if (rosterPlan.optimizerStats?.validationOk === false) {
      const errors = rosterPlan.optimizerStats.validationErrors || []
      throw new Error(
        errors.length
          ? `Roster validation failed: ${errors.join(' · ')}`
          : 'Roster validation failed.',
      )
    }

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
    const teamModel = buildTeamModel(rosterPlan, state, GAME_DATA)
    const personality: any = recommendPersonalityRoles(
      teamModel,
      selected,
      rosterPlan.rows,
    )

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
