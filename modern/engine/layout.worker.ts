/// <reference lib="webworker" />

import { GAME_DATA } from '../../src/data.js'
import { buildFullBaseLayout, normalizeLayoutSettings } from '../../src/full-layout.js'
import type { BaseLayout, LayoutSettings, LayoutWorkerMessage, OptimizerPlan, OptimizerState } from '../types'

type Request = {
  id: number
  state: OptimizerState
  plan: OptimizerPlan
  settings: LayoutSettings
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, state, plan, settings } = event.data
  try {
    const normalized = normalizeLayoutSettings(settings, state.homelandLevel)
    const layout = buildFullBaseLayout(plan, state, GAME_DATA, normalized) as unknown as BaseLayout
    self.postMessage({ type: 'result', id, layout } satisfies LayoutWorkerMessage)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    self.postMessage({ type: 'error', id, message: err.message } satisfies LayoutWorkerMessage)
  }
}
