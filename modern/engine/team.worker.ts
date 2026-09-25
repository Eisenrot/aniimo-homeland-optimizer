/// <reference lib="webworker" />

import { GAME_DATA } from '../../src/data.js'
import {
  antiStallSummary,
  buildTeamModel,
  findBestTeams,
  findEssentialCore,
  optimizePersonalities,
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

const mapCoverage = (map: Map<string, any> | undefined) =>
  [...(map || new Map())].map(([facility, value]) => ({
    facility,
    total: Number(value?.total || 0),
    hit: Number(value?.hit || 0),
    demandHours: Number(value?.demandHours || 0),
    capacityRatio: Number(value?.capacityRatio || 0),
  }))

self.onmessage = async (event: MessageEvent<AnalyzeRequest>) => {
  const { id, state, plan } = event.data
  const progress = (detail: string) => {
    const message: TeamWorkerMessage = { type: 'progress', id, detail }
    self.postMessage(message)
  }

  try {
    progress('Building staffing model')
    const model = buildTeamModel(plan, state, GAME_DATA)
    const candidates = await findBestTeams(model, state, GAME_DATA, {
      limit: 4,
      onProgress: progress,
    })

    if (!candidates.length) {
      const result: TeamAnalysisResult = {
        candidates: [],
        requiredAbilities: requiredAbilities(plan),
        personality: null,
        core: [],
        reserves: [],
        coverage: [],
      }
      self.postMessage({ type: 'result', id, result } satisfies TeamWorkerMessage)
      return
    }

    const best: any = candidates[0]
    const activeModel = best.model || model
    progress('Finding essential core')
    const core = findEssentialCore(activeModel, best.team, Number(best.eval?.objectiveRate || 0))
    const anti = antiStallSummary(activeModel, best.team, core, best.eval?.rows)

    progress('Scoring personality roles')
    const personality: any = await optimizePersonalities(
      activeModel,
      best.team,
      progress,
      best.eval,
      best.burst,
    )

    const result: TeamAnalysisResult = {
      candidates: candidates.map((candidate: any, index: number) => ({
        rank: index + 1,
        team: candidate.team.map(compactMember),
        rate: Number(candidate.eval?.rate || 0),
        targetRate: Number(candidate.eval?.targetRate || 0),
        objectiveRate: Number(candidate.eval?.objectiveRate || 0),
        coverageWeight: Number(candidate.burst?.coverageWeight || 0),
        resilience: Number(candidate.burst?.burstResilienceScore || 0),
      })),
      requiredAbilities: requiredAbilities(plan),
      personality: {
        rate: Number(personality?.rate || 0),
        targetRate: Number(personality?.targetRate || 0),
        objectiveRate: Number(personality?.objectiveRate || 0),
        profiles: [...(personality?.profiles || [])],
        hints: (personality?.traitHints || []).map((hint: any) => ({
          profile: String(hint.profile || ''),
          display: [...(hint.display || [])].map((part: any) => ({
            char: String(part.char || ''),
            status: String(part.status || 'none'),
            facilities: [...(part.facilities || [])],
          })),
        })),
      },
      core: core.map(compactMember),
      reserves: (anti?.reserves || []).map(compactMember),
      coverage: [
        ...mapCoverage(anti?.utilityByFacility),
        ...mapCoverage(anti?.permanentByFacility),
        ...mapCoverage(anti?.burstByFacility),
      ],
    }

    self.postMessage({ type: 'result', id, result } satisfies TeamWorkerMessage)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    self.postMessage({ type: 'error', id, message: err.message } satisfies TeamWorkerMessage)
  }
}
