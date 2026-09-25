import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { readPlanCache, writePlanCache } from '../src/plan-cache.js'
import AppShell from './components/AppShell'
import { optimizerClient } from './engine/optimizerClient'
import { currentPage } from './lib/page'
import { DATA, loadState, normalizeState, resetState, saveState } from './state'
import type { OptimizerPlan, OptimizerState, SolverProgress } from './types'

function clone<T>(value: T): T {
  return structuredClone(value)
}

const PlanPage = lazy(() => import('./pages/PlanPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const LayoutPage = lazy(() => import('./pages/LayoutPage'))

const RUN_OPTIONS = { maxClimateVariants: 28, maxClimateOffset: 9 }
const BUILD_ID = `modern-v3:${DATA.version || 'data'}`

export default function App() {
  const page = currentPage()
  const [state, setState] = useState<OptimizerState>(() => loadState())
  const [plan, setPlan] = useState<OptimizerPlan | null>(null)
  const [progress, setProgress] = useState<SolverProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const patch = useCallback((update: (draft: OptimizerState) => void) => {
    setState((current) => {
      const draft = clone(current)
      update(draft)
      const normalized = normalizeState(draft)
      saveState(normalized)
      return normalized
    })
  }, [])

  const solve = useCallback(async (snapshot: OptimizerState, force = false) => {
    if (!force) {
      const cached = readPlanCache(localStorage, snapshot, RUN_OPTIONS, BUILD_ID)
      if (cached?.plan) {
        setError(null)
        setProgress({ phase: 'Cached', progress: 1, detail: 'Exact plan state restored' })
        setPlan({
          ...cached.plan,
          optimizerStats: {
            ...(cached.plan.optimizerStats || {}),
            ...(cached.stats || {}),
            engine: 'cache',
            elapsedMs: 0,
          },
        } as OptimizerPlan)
        setRunning(false)
        return
      }
    }

    setRunning(true)
    setError(null)
    setProgress({ phase: 'Preparing', progress: 0 })

    try {
      const result = await optimizerClient.solve(snapshot, setProgress)
      setPlan(result)
      writePlanCache(localStorage, snapshot, RUN_OPTIONS, BUILD_ID, result, result.optimizerStats || {})
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRunning(false)
    }
  }, [])

  useEffect(() => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void solve(state), 180)
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    }
  }, [state, solve])

  useEffect(() => () => optimizerClient.cancel(), [])

  const reset = () => {
    const next = resetState()
    setState(next)
  }

  const content = page === 'team'
    ? <TeamPage state={state} plan={plan} planRunning={running} />
    : page === 'layout'
      ? <LayoutPage state={state} plan={plan} planRunning={running} />
      : <PlanPage state={state} patch={patch} plan={plan} progress={progress} running={running} error={error} />

  return (
    <AppShell
      page={page}
      state={state}
      plan={plan}
      running={running}
      patch={patch}
      onSolve={() => void solve(state, true)}
      onReset={reset}
    >
      <Suspense fallback={<section className="surface-card route-loading">Loading…</section>}>
        {content}
      </Suspense>
    </AppShell>
  )
}
