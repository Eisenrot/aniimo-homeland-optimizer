import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readPlanCache, stableStringify, writePlanCache } from '../src/plan-cache.js'
import AppShell from './components/AppShell'
import { optimizerClient } from './engine/optimizerClient'
import { teamClient } from './engine/teamClient'
import { currentPage } from './lib/page'
import { clearSharedPresetFromLocation, readSharedPresetFromLocation, type PresetSnapshot } from './presets'
import { DATA, loadState, normalizeState, resetState, saveState } from './state'
import type { OptimizerPlan, OptimizerState, SolverProgress, TeamAnalysisResult } from './types'

function clone<T>(value: T): T {
  return structuredClone(value)
}

const PlanPage = lazy(() => import('./pages/PlanPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const LayoutPage = lazy(() => import('./pages/LayoutPage'))

const RUN_OPTIONS = { solverEngine: 'highs-mip-next', timeLimitSeconds: 8, maxClimateCuts: 24, mipRelativeGap: 0 } as const
const DEPLOY_BUILD_ID = import.meta.env.VITE_BUILD_ID || (import.meta.env.DEV ? `dev-${Date.now()}` : 'local-build')
const BUILD_ID = `modern-v11-solver-next:${DEPLOY_BUILD_ID}:${DATA.version || 'data'}`
const TEAM_CACHE_STORE = 'aniimoModernTeamCacheV2'
const TEAM_CACHE_VERSION = 15

function loadInitialState() {
  const stored = loadState()
  const shared = readSharedPresetFromLocation()
  if (!shared) return stored
  const next = normalizeState({ ...shared, owned: stored.owned })
  saveState(next)
  clearSharedPresetFromLocation()
  return next
}

function cachedPlan(state: OptimizerState): OptimizerPlan | null {
  const cached = readPlanCache(localStorage, state, RUN_OPTIONS, BUILD_ID)
  if (!cached?.plan) return null
  return {
    ...cached.plan,
    optimizerStats: {
      ...(cached.plan.optimizerStats || {}),
      ...(cached.stats || {}),
      engine: cached.plan.optimizerStats?.engine || cached.stats?.engine || 'highs-mip-next',
      elapsedMs: 0,
    },
  } as OptimizerPlan
}

function teamSignature(state: OptimizerState, plan: OptimizerPlan) {
  const { optimizerStats: _stats, ...stablePlan } = plan
  return stableStringify({
    version: TEAM_CACHE_VERSION,
    build: BUILD_ID,
    state,
    plan: stablePlan,
  })
}

function readTeamCache(state: OptimizerState, plan: OptimizerPlan): TeamAnalysisResult | null {
  try {
    const entry = JSON.parse(localStorage.getItem(TEAM_CACHE_STORE) || 'null')
    if (entry?.version !== TEAM_CACHE_VERSION || entry.signature !== teamSignature(state, plan)) return null
    return entry.result as TeamAnalysisResult
  } catch {
    return null
  }
}

function writeTeamCache(state: OptimizerState, plan: OptimizerPlan, result: TeamAnalysisResult) {
  try {
    localStorage.setItem(TEAM_CACHE_STORE, JSON.stringify({
      version: TEAM_CACHE_VERSION,
      signature: teamSignature(state, plan),
      result,
    }))
  } catch {
    // Cache is an optimization, never a requirement.
  }
}

export default function App() {
  const page = currentPage()
  const [state, setState] = useState<OptimizerState>(() => loadInitialState())
  const stateKey = useMemo(() => stableStringify(state), [state])
  const [plan, setPlan] = useState<OptimizerPlan | null>(() => cachedPlan(state))
  const [planStateKey, setPlanStateKey] = useState<string | null>(() => plan ? stateKey : null)
  const [progress, setProgress] = useState<SolverProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [teamAnalysis, setTeamAnalysis] = useState<TeamAnalysisResult | null>(null)
  const [teamRunning, setTeamRunning] = useState(false)
  const [teamDetail, setTeamDetail] = useState('Preparing team')
  const [teamError, setTeamError] = useState<string | null>(null)

  const timer = useRef<number | null>(null)

  const invalidateTeam = useCallback(() => {
    teamClient.cancel()
    setTeamAnalysis(null)
    setTeamRunning(false)
    setTeamError(null)
    setTeamDetail('Updating team')
  }, [])

  const patch = useCallback((update: (draft: OptimizerState) => void) => {
    invalidateTeam()
    setState((current) => {
      const draft = clone(current)
      update(draft)
      const normalized = normalizeState(draft)
      saveState(normalized)
      return normalized
    })
  }, [invalidateTeam])

  const solve = useCallback(async (snapshot: OptimizerState, force = false) => {
    const snapshotKey = stableStringify(snapshot)

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
            engine: cached.plan.optimizerStats?.engine || cached.stats?.engine || 'highs-mip-next',
            elapsedMs: 0,
          },
        } as OptimizerPlan)
        setPlanStateKey(snapshotKey)
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
      setPlanStateKey(snapshotKey)
      writePlanCache(localStorage, snapshot, RUN_OPTIONS, BUILD_ID, result, result.optimizerStats || {})
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRunning(false)
    }
  }, [])

  const analyzeTeam = useCallback(async (
    snapshot: OptimizerState,
    sourcePlan: OptimizerPlan,
    force = false,
  ) => {
    if (!force) {
      const cached = readTeamCache(snapshot, sourcePlan)
      if (cached) {
        setTeamAnalysis(cached)
        setTeamRunning(false)
        setTeamError(null)
        setTeamDetail('Team restored')
        return
      }
    }

    setTeamRunning(true)
    setTeamError(null)
    setTeamDetail('Finding the best team')

    try {
      const result = await teamClient.analyze(snapshot, sourcePlan, setTeamDetail)
      setTeamAnalysis(result)
      writeTeamCache(snapshot, sourcePlan, result)
    } catch (reason) {
      setTeamError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setTeamRunning(false)
    }
  }, [])

  useEffect(() => {
    if (plan && planStateKey === stateKey) return
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void solve(state), 100)
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    }
  }, [state, stateKey, plan, planStateKey, solve])

  useEffect(() => {
    if (!plan || planStateKey !== stateKey) return
    void analyzeTeam(state, plan)
    return () => teamClient.cancel()
  }, [stateKey, plan, planStateKey, analyzeTeam])

  useEffect(() => () => {
    optimizerClient.cancel()
    teamClient.cancel()
  }, [])

  const reset = () => {
    optimizerClient.cancel()
    invalidateTeam()
    const next = resetState()
    setPlan(null)
    setPlanStateKey(null)
    setState(next)
  }

  const loadPreset = useCallback((snapshot: PresetSnapshot) => {
    optimizerClient.cancel()
    invalidateTeam()
    setPlan(null)
    setPlanStateKey(null)
    setState((current) => {
      const next = normalizeState({ ...snapshot, owned: current.owned })
      saveState(next)
      return next
    })
  }, [invalidateTeam])

  const forceTeamAnalysis = () => {
    if (!plan || planStateKey !== stateKey) return
    void analyzeTeam(state, plan, true)
  }

  const content = page === 'team'
    ? (
        <TeamPage
          state={state}
          analysis={teamAnalysis}
          running={teamRunning}
          detail={teamDetail}
          error={teamError}
          onAnalyze={forceTeamAnalysis}
        />
      )
    : page === 'layout'
      ? <LayoutPage state={state} plan={plan} planRunning={running} />
      : <PlanPage
          state={state}
          patch={patch}
          plan={plan}
          planCurrent={planStateKey === stateKey}
          progress={progress}
          running={running}
          error={error}
        />

  return (
    <AppShell
      page={page}
      state={state}
      running={running}
      teamAnalysis={teamAnalysis}
      teamRunning={teamRunning}
      teamError={teamError}
      patch={patch}
      onSolve={() => void solve(state, true)}
      onReset={reset}
      onLoadPreset={loadPreset}
    >
      <Suspense fallback={<section className="surface-card route-loading">Loading…</section>}>
        {content}
      </Suspense>
    </AppShell>
  )
}
