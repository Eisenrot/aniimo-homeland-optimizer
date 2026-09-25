import { useCallback, useEffect, useRef, useState } from 'react'
import FacilitiesPanel from './components/FacilitiesPanel'
import ModulesPanel from './components/ModulesPanel'
import ObjectivePanel from './components/ObjectivePanel'
import PlanSettings from './components/PlanSettings'
import RecipeNotesPanel from './components/RecipeNotesPanel'
import ResultsPanel from './components/ResultsPanel'
import { optimizerClient } from './engine/optimizerClient'
import { DATA, loadState, normalizeState, resetState, saveState } from './state'
import type { OptimizerPlan, OptimizerState, SolverProgress } from './types'

function clone<T>(value: T): T {
  return structuredClone(value)
}

export default function App() {
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

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" role="img" aria-label="Aniimo" />
          <div>
            <h1>Aniimo Homeland Optimizer</h1>
            <p>experimental · React + TypeScript · parity engine</p>
          </div>
        </div>
        <nav className="top-actions">
          <span className="modern-badge">MIGRATION 01</span>
          <button className="ghost" onClick={() => void solve(state)} disabled={running}>Re-run</button>
          <button className="ghost" onClick={reset}>Reset</button>
          <a className="ghost link" href="./legacy.html">Legacy reference</a>
        </nav>
      </header>

      <main className="shell">
        <section className="panel modern-migration-note">
          <div className="section-title"><span /><h3>Migration parity</h3><i /><em className="micro">{DATA.version || ''}</em></div>
          <p>
            The React shell still calls the existing production solver from a Vite worker.
            Model-affecting controls are being moved first; solver replacement comes only after parity is measurable.
          </p>
        </section>

        <div className="workspace">
          <aside className="config-stack">
            <ObjectivePanel state={state} patch={patch} />
            <PlanSettings state={state} patch={patch} />
            <FacilitiesPanel state={state} patch={patch} />
            <ModulesPanel state={state} patch={patch} />
            <RecipeNotesPanel state={state} patch={patch} />
          </aside>

          <section className="results-stack">
            <ResultsPanel plan={plan} progress={progress} running={running} error={error} />
          </section>
        </div>
      </main>

      <footer>
        <span>Experimental rewrite. Main remains untouched.</span>
        <span>Current engine: existing JavaScript solver in a Web Worker.</span>
      </footer>
    </>
  )
}
