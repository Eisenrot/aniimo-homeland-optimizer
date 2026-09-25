import type { BaseLayout, LayoutSettings, LayoutWorkerMessage, OptimizerPlan, OptimizerState } from '../types'

export class LayoutClient {
  private serial = 0
  private worker: Worker | null = null

  cancel() {
    this.worker?.terminate()
    this.worker = null
  }

  build(state: OptimizerState, plan: OptimizerPlan, settings: LayoutSettings): Promise<BaseLayout> {
    this.cancel()
    const id = ++this.serial
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker

    return new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<LayoutWorkerMessage>) => {
        const message = event.data
        if (message.id !== id) return
        worker.terminate()
        if (this.worker === worker) this.worker = null
        if (message.type === 'result') resolve(message.layout)
        else reject(new Error(message.message))
      }
      worker.onerror = (event) => {
        worker.terminate()
        if (this.worker === worker) this.worker = null
        reject(new Error(event.message || 'Layout worker crashed'))
      }
      worker.postMessage({ id, state, plan, settings })
    })
  }
}

export const layoutClient = new LayoutClient()
