import { useCallback, useEffect, useRef, useState } from 'react'
import AppShell from './components/AppShell'
import { optimizerClient } from './engine/optimizerClient'
import { currentPage } from './lib/page'
import HomelandPage from './pages/HomelandPage'
import LayoutPage from './pages/LayoutPage'
import OptimizerPage from './pages/OptimizerPage'
import OverviewPage from './pages/OverviewPage'
import RosterPage from './pages/RosterPage'
import TeamPage from './pages/TeamPage'
import { loadState, normalizeState, resetState, saveState } from './state'
import type { OptimizerPlan, OptimizerState, SolverProgress } from './types'

function clone<T>(value: T): T {
  return structuredClone(value)
}

const PLAN_PAGES = new Set(['overview', 'optimizer', 'team', 'layout'])

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

  const solve = useCallback(async (snapshot: OptimizerState) => {
    if (!PLAN_PAGES.has(page)) return
    setRunning(true)
    setError(null)
    setProgress({ phase: 'Preparing', progress: 0 })
    try {
      const result = await optimizerClient.solve(snapshot, setProgress)
      setPlan(result)
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
      onSolve={() => void solve(state)}
      onReset={reset}
    >
      {content}
    </AppShell>
  )
}
