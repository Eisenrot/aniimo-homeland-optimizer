import type { OptimizerPlan, OptimizerState, TeamAnalysisResult, TeamWorkerMessage } from '../types'

export class TeamClient {
  private serial = 0
  private active: Worker | null = null

  cancel() {
    this.active?.terminate()
    this.active = null
  }

  analyze(state: OptimizerState, plan: OptimizerPlan, onProgress?: (detail: string) => void): Promise<TeamAnalysisResult> {
    this.cancel()
    const id = ++this.serial
    const worker = new Worker(new URL('./team.worker.ts', import.meta.url), { type: 'module' })
    this.active = worker
    return new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<TeamWorkerMessage>) => {
        const message = event.data
        if (message.id !== id) return
        if (message.type === 'progress') {
          onProgress?.(message.detail)
          return
        }
        worker.terminate()
        if (this.active === worker) this.active = null
        if (message.type === 'result') resolve(message.result)
        else reject(new Error(message.message))
      }
      worker.onerror = (event) => {
        worker.terminate()
        if (this.active === worker) this.active = null
        reject(new Error(event.message || 'Real-team worker crashed'))
      }
      worker.postMessage({ id, state, plan })
    })
  }
}

export const teamClient = new TeamClient()
