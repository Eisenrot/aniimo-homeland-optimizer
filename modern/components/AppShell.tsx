import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, Home, Map as MapIcon, Moon, Sun, UsersRound } from 'lucide-react'
import { itemIcon, fmt } from '../lib/presentation'
import { DATA } from '../state'
import type { AppPage } from '../lib/page'
import type { PresetSnapshot } from '../presets'
import type { OptimizerState, TeamAnalysisResult } from '../types'
import OwnedAniimoDialog from './OwnedAniimoDialog'
import PresetsDialog from './PresetsDialog'
import SettingsPopover from './SettingsPopover'

const NAV = [
  { key: 'plan', label: 'Plan', href: './', icon: Home },
  { key: 'team', label: 'Team', href: './team.html', icon: UsersRound },
  { key: 'layout', label: 'Layout', href: './layout.html', icon: MapIcon },
] as const

const THEME_STORE = 'aniimoOptimizerThemeV3'
type Theme = 'light' | 'dark'

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    return window.localStorage.getItem(THEME_STORE) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

type Props = {
  page: AppPage
  state: OptimizerState
  running: boolean
  teamAnalysis: TeamAnalysisResult | null
  teamRunning: boolean
  teamError: string | null
  children: ReactNode
  patch: (update: (draft: OptimizerState) => void) => void
  onSolve: () => void
  onReset: () => void
  onLoadPreset: (snapshot: PresetSnapshot) => void
}

export default function AppShell({
  page,
  state,
  running,
  teamAnalysis,
  teamRunning,
  teamError,
  children,
  patch,
  onSolve,
  onReset,
  onLoadPreset,
}: Props) {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const constraints = state.guarantees.filter((item) => item.enabled !== false)
  const coMax = constraints.filter((item) => item.maximize).length

  const objectiveTargets = useMemo(() => {
    const ids: string[] = []
    const add = (value: string | number | null | undefined) => {
      const id = String(value || '')
      if (!id || id === 'coin' || ids.includes(id)) return
      ids.push(id)
    }

    add(state.target)
    for (const guarantee of constraints) add(guarantee.item)

    return ids.map((id) => ({
      id,
      name: DATA.items[id]?.name || id,
    }))
  }, [state.target, constraints])

  const itemRates = useMemo(
    () => new Map((teamAnalysis?.itemRates || []).map((item) => [String(item.item), Number(item.rate || 0)])),
    [teamAnalysis],
  )

  const teamNumber = teamAnalysis?.best?.rate
  const busy = running || teamRunning
  const status = teamError
    ? 'ERROR'
    : teamRunning
      ? 'ANALYZING'
      : running
        ? 'PLANNING'
        : teamAnalysis?.best
          ? 'SYNCED'
          : 'READY'

  useEffect(() => {
    document.documentElement.dataset.optimizerTheme = theme
    try {
      window.localStorage.setItem(THEME_STORE, theme)
    } catch {
      // Theme remains usable for the current session if storage is unavailable.
    }
  }, [theme])

  const toggleTheme = () => setTheme((current) => current === 'light' ? 'dark' : 'light')
  const ThemeIcon = theme === 'light' ? Sun : Moon

  return (
    <div className="rewrite-shell" data-theme={theme}>
      <div className="print-noise" aria-hidden="true" />

      <aside className="rewrite-stage-rail">
        <a className="rewrite-rail-brand" href="./" aria-label="Aniimo Homeland Optimizer home">
          <span className="rewrite-rail-brand-mark">H</span>
          <span className="rewrite-rail-brand-copy">
            <b>HOMELAND</b>
            <small>OPTIMIZER</small>
          </span>
        </a>

        <nav className="rewrite-rail-nav" aria-label="Optimizer sections">
          {NAV.map((item, index) => {
            const Icon = item.icon
            const current = page === item.key
            return (
              <a
                key={item.key}
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={current ? 'current' : undefined}
              >
                <small>{String(index + 1).padStart(2, '0')}</small>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            )
          })}
        </nav>

        <div className="rewrite-rail-tools">
          <OwnedAniimoDialog state={state} patch={patch} />
          <PresetsDialog state={state} onLoadPreset={onLoadPreset} />
          <SettingsPopover running={running} onSolve={onSolve} onReset={onReset} />
          <button
            type="button"
            className="rewrite-icon-button rewrite-theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to white theme'}
            aria-pressed={theme === 'dark'}
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to white theme'}
          >
            <ThemeIcon aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="rewrite-stage-body">
        <header className="rewrite-current-plan" aria-label="Current optimized team">
          <div className="rewrite-current-gain">
            <span className="rewrite-plan-art"><img src={itemIcon('coin')} alt="" /></span>
            <span>
              <small>ANIIMO'S NUMBER</small>
              <strong>
                {teamNumber != null ? fmt(teamNumber) : busy ? '…' : '—'}
                <em> / H</em>
              </strong>
            </span>
          </div>

          <div className="rewrite-current-target">
            <small className="rewrite-target-heading">ITEM TARGETS</small>
            <div className="rewrite-target-list">
              {objectiveTargets.length ? objectiveTargets.map((target) => (
                <span className="rewrite-target-item" key={target.id}>
                  <img src={itemIcon(target.id)} alt="" />
                  <span>
                    <b>{target.name}</b>
                    <em>{teamRunning ? '…' : `${fmt(Math.max(0, itemRates.get(target.id) || 0))} / h`}</em>
                  </span>
                </span>
              )) : (
                <span className="rewrite-target-empty">No item targets</span>
              )}
            </div>
          </div>

          <div className="rewrite-current-stat">
            <small>REQ.</small>
            <b>{String(constraints.length).padStart(2, '0')}</b>
          </div>

          <div className="rewrite-current-stat">
            <small>MAX</small>
            <b>{String(coMax).padStart(2, '0')}</b>
          </div>

          <div className={busy ? 'rewrite-plan-state running' : 'rewrite-plan-state'}>
            <Activity aria-hidden="true" />
            <span><small>TEAM</small><b>{status}</b></span>
          </div>
        </header>

        <main className="rewrite-page-content">{children}</main>
      </div>
    </div>
  )
}