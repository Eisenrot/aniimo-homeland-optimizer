/// <reference lib="webworker" />

import { GAME_DATA } from '../../src/data.js'
import { optimizePlan } from '../../src/optimizer.js'
import type { SolveRequest, WorkerMessage } from '../types'

self.onmessage = (event: MessageEvent<SolveRequest>) => {
  const { id, state, options } = event.data
  try {
    const plan = optimizePlan(state, GAME_DATA, {
      maxClimateVariants: options?.maxClimateVariants ?? 28,
      maxClimateOffset: options?.maxClimateOffset ?? 9,
      onProgress: (progress: unknown) => {
        const message: WorkerMessage = {
          type: 'progress',
          id,
          progress: progress as WorkerMessage & never,
        } as WorkerMessage
        self.postMessage(message)
      },
    })

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
