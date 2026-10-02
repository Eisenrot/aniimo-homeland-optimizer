/// <reference lib="webworker" />

import { GAME_DATA } from '../../src/data.js'
import { loadNextHighs } from '../../src/solver-next/highs-runtime.js'
import { solveNextWithHighs } from '../../src/solver-next/solve.js'
import type {
  OptimizerPlan,
  SolveRequest,
  SolverProgress,
  WorkerMessage,
} from '../types'

function friendlyPhase(raw?: string) {
  if (!raw) return 'Optimizing'
  if (raw === 'joint-fairness') return 'Balancing objectives'
  if (raw === 'joint-sum') return 'Final optimization'
  if (raw === 'final') return 'Final optimization'
  if (raw === 'automation-tiebreak') return 'Preferring electrical automation'
  if (raw === 'automation-max-coverage') return 'Maximizing electrical coverage'
  if (raw.startsWith('calibrate:primary')) return 'Calibrating primary objective'
  if (raw.startsWith('calibrate:co:')) return 'Calibrating co-MAX objective'
  if (raw.startsWith('calibrate:')) return 'Calibrating objective'
  return raw
}

self.onmessage = async (event: MessageEvent<SolveRequest>) => {
  const { id, state, options } = event.data
  const started = performance.now()

  try {
    const highs = await loadNextHighs()
    const plan = await solveNextWithHighs(highs, state, GAME_DATA, {
      timeLimitSeconds: options?.timeLimitSeconds ?? 8,
      maxClimateCuts: options?.maxClimateCuts ?? 24,
      mipRelativeGap: options?.mipRelativeGap ?? 0,
      mipAbsoluteGap: options?.mipAbsoluteGap ?? 1e-7,
      onProgress(progress: SolverProgress) {
        const message: WorkerMessage = {
          type: 'progress',
          id,
          progress: {
            ...progress,
            engine: 'highs-mip-next',
            phase: friendlyPhase(progress.phase),
            elapsedMs: performance.now() - started,
          },
        }
        self.postMessage(message)
      },
    }) as OptimizerPlan

    if (plan.optimizerStats?.validationOk === false) {
      const errors = plan.optimizerStats.validationErrors || []
      throw new Error(
        errors.length
          ? `Solver Next validation failed: ${errors.join(' · ')}`
          : 'Solver Next validation failed.',
      )
    }

    const message: WorkerMessage = { type: 'result', id, plan }
    self.postMessage(message)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const message: WorkerMessage = {
      type: 'error',
      id,
      message: err.message,
      stack: err.stack,
    }
    self.postMessage(message)
  }
}