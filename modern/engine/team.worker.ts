/// <reference lib="webworker" />

import { GAME_DATA } from '../../src/data.js'
import {
  buildTeamModel,
  findBestTeam,
  planItemRates,
  recommendPersonalityRoles,
  requiredAbilities,
} from '../../src/optimizer.js'
import type { OptimizerPlan, OptimizerState, TeamAnalysisResult, TeamWorkerMessage } from '../types'

type AnalyzeRequest = {
  id: number
  state: OptimizerState
  plan: OptimizerPlan
}

const compactMember = (member: any) => {
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

self.onmessage = async (event: MessageEvent<AnalyzeRequest>) => {
  const { id, state, plan } = event.data
  const progress = (detail: string) => {
    const message: TeamWorkerMessage = { type: 'progress', id, detail }
    self.postMessage(message)
  }

  try {
    progress('Building team model')
    const staffingPlan = {
      ...plan,
      optimizerStats: {
        ...(plan.optimizerStats || {}),
        engine: 'highs-mip-next',
      },
      scenario: { ...(plan.scenario || {}), generatorLevel: Number(state.generatorLevel || 1) },
    } as OptimizerPlan
    const model = buildTeamModel(staffingPlan, state, GAME_DATA)
    const solveBestTeam = findBestTeam as unknown as (
      model: unknown,
      state: OptimizerState,
      data: typeof GAME_DATA,
      options: { onProgress?: (detail: string) => void },
    ) => Promise<any | null>

    const best: any = await solveBestTeam(model, state, GAME_DATA, {
      onProgress: progress,
    })

    if (!best) {
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

    const activeModel = best.model || model
    const actualPlan = {
      ...(activeModel?.plan || plan),
      rows: [...(best.eval?.rows || [])],
    } as OptimizerPlan

    progress('Assigning personality roles')
    const personality: any = recommendPersonalityRoles(
      model,
      best.team,
      staffingPlan.rows,
    )

    const assignmentMaps = Array.from({ length: best.team.length }, () => new Map<string, { facility: string; mode: 'permanent' | 'utility' | 'flex'; seconds: number }>())
    const addAssignment = (worker: number, facility: string, mode: 'permanent' | 'utility' | 'flex', seconds: number) => {
      if (worker < 0 || worker >= assignmentMaps.length || !facility) return
      const map = assignmentMaps[worker]
      const previous = map.get(facility)
      const priority = { permanent: 3, utility: 2, flex: 1 }
      if (previous) {
        previous.seconds += Math.max(0, Number(seconds || 0))
        if (priority[mode] > priority[previous.mode]) previous.mode = mode
      } else {
        map.set(facility, { facility, mode, seconds: Math.max(0, Number(seconds || 0)) })
      }
    }
    for (const assignment of personality?.coverageMatch?.assignments || []) {
      const mode = assignment?.slot?.mode
      if (mode === 'permanent' || mode === 'utility') {
        addAssignment(Number(assignment.worker), String(assignment.slot?.facility || ''), mode, 3600)
      }
    }
    for (const assignment of personality?.assignments || []) {
      if (assignment?.permanent) continue
      addAssignment(Number(assignment.worker), String(assignment.facility || ''), 'flex', Number(assignment.seconds || 0))
    }
    const assignments = assignmentMaps.map((map) => [...map.values()].sort((a, b) => {
      const priority = { permanent: 3, utility: 2, flex: 1 }
      return priority[b.mode] - priority[a.mode] || b.seconds - a.seconds || a.facility.localeCompare(b.facility)
    }))

    const result: TeamAnalysisResult = {
      best: {
        team: best.team.map(compactMember),
        rate: Number(best.eval?.rate || 0),
      },
      itemRates: planItemRates(actualPlan, GAME_DATA)
        .filter((item: any) => Number(item.rate || 0) > 1e-8)
        .map((item: any) => ({
          item: String(item.item),
          rate: Number(item.rate || 0),
        })),
      assignments,
      requiredAbilities: requiredAbilities(actualPlan),
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