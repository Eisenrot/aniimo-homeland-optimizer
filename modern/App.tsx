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

const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const OptimizerPage = lazy(() => import('./pages/OptimizerPage'))
const HomelandPage = lazy(() => import('./pages/HomelandPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const LayoutPage = lazy(() => import('./pages/LayoutPage'))
const RosterPage = lazy(() => import('./pages/RosterPage'))

const PLAN_PAGES = new Set(['overview', 'optimizer', 'team', 'layout'])
const RUN_OPTIONS = { maxClimateVariants: 28, maxClimateOffset: 9 }
const BUILD_ID = `modern-v2:${DATA.version || 'data'}`

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
    if (!PLAN_PAGES.has(page)) return

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
      writePlanCache(
        localStorage,
        snapshot,
        RUN_OPTIONS,
        BUILD_ID,
        result,
        result.optimizerStats || {},
      )
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRunning(false)
    }
  }, [page])

  useEffect(() => {
    if (!PLAN_PAGES.has(page)) return
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void solve(state), 180)
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    }
  }, [state, solve, page])

  useEffect(() => () => optimizerClient.cancel(), [])

  const reset = () => {
    const next = resetState()
    setState(next)
  }

  let content
  if (page === 'overview') {
    content = <OverviewPage state={state} plan={plan} progress={progress} running={running} error={error} />
  } else if (page === 'optimizer') {
    content = <OptimizerPage state={state} patch={patch} plan={plan} progress={progress} running={running} error={error} />
  } else if (page === 'homeland') {
    content = <HomelandPage state={state} patch={patch} />
  } else if (page === 'team') {
    content = <TeamPage state={state} plan={plan} planRunning={running} />
  } else if (page === 'layout') {
    content = <LayoutPage state={state} plan={plan} planRunning={running} />
  } else {
    content = <RosterPage state={state} patch={patch} />
  }

  return (
    <AppShell
      page={page}
      state={state}
      plan={plan}
      running={running}
      onSolve={() => void solve(state, true)}
      onReset={reset}
    >
      <Suspense fallback={<section className="surface-card route-loading">Loading page…</section>}>
        {content}
      </Suspense>
    </AppShell>
  )
}
