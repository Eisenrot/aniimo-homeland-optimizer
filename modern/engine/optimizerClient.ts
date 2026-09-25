import type { OptimizerPlan, OptimizerState, SolverProgress, WorkerMessage } from '../types'

type ActiveSolve = {
  worker: Worker
  reject: (reason?: unknown) => void
}

export class OptimizerClient {
  private serial = 0
  private active: ActiveSolve | null = null

  cancel() {
    if (!this.active) return
    this.active.worker.terminate()
    this.active.reject(new DOMException('Solve cancelled', 'AbortError'))
    this.active = null
  }

  solve(
    state: OptimizerState,
    onProgress?: (progress: SolverProgress) => void,
  ): Promise<OptimizerPlan> {
    this.cancel()
    const id = ++this.serial
    const worker = new Worker(new URL('./legacyOptimizer.worker.ts', import.meta.url), { type: 'module' })

    return new Promise((resolve, reject) => {
      this.active = { worker, reject }

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data
        if (message.id !== id) return

        if (message.type === 'progress') {
          onProgress?.(message.progress)
          return
        }

        worker.terminate()
        if (this.active?.worker === worker) this.active = null

        if (message.type === 'result') resolve(message.plan)
        else reject(new Error(message.message))
      }

      worker.onerror = (event) => {
        worker.terminate()
        if (this.active?.worker === worker) this.active = null
        reject(new Error(event.message || 'Optimizer worker crashed'))
      }

      worker.postMessage({
        id,
        state,
        options: {
          maxClimateVariants: 28,
          maxClimateOffset: 9,
        },
      })
    })
  }
}

export const optimizerClient = new OptimizerClient()
