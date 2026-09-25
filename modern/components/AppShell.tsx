import type { ReactNode } from 'react'
import { Activity, Home, Map, UsersRound } from 'lucide-react'
import { itemIcon, fmt } from '../lib/presentation'
import type { AppPage } from '../lib/page'
import type { OptimizerPlan, OptimizerState } from '../types'
import OwnedAniimoDialog from './OwnedAniimoDialog'
import SettingsPopover from './SettingsPopover'

const NAV = [
  { key: 'plan', label: 'Plan', href: './', icon: Home },
  { key: 'team', label: 'Team', href: './team.html', icon: UsersRound },
  { key: 'layout', label: 'Layout', href: './layout.html', icon: Map },
] as const

type Props = {
  page: AppPage
  state: OptimizerState
  plan: OptimizerPlan | null
  running: boolean
  children: ReactNode
  patch: (update: (draft: OptimizerState) => void) => void
  onSolve: () => void
  onReset: () => void
}

export default function AppShell({
  page,
  state,
  plan,
  running,
  children,
  patch,
  onSolve,
  onReset,
}: Props) {
  const targetName = state.target === 'coin'
    ? 'Home Coin'
    : (window as any).__ANIIMO_ITEM_NAME__?.[state.target] || 'Target'
  const constraints = state.guarantees.filter((item) => item.enabled !== false)
  const coMax = constraints.filter((item) => item.maximize).length

  return (
    <div className="rewrite-shell">
      <div className="rewrite-sticky-shell">
        <header className="rewrite-top-dock">
          <a className="rewrite-brand" href="./" aria-label="Aniimo Homeland Optimizer">
            <span className="rewrite-brand-mark">A</span>
            <span><b>Aniimo</b><small>Homeland Optimizer</small></span>
          </a>

          <nav className="rewrite-segmented-nav" aria-label="Optimizer sections">
            {NAV.map((item) => {
              const Icon = item.icon
              const current = page === item.key
              return (
                <a
                  key={item.key}
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  className={current ? 'current' : undefined}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </a>
              )
            })}
          </nav>

          <div className="rewrite-dock-tools">
            <OwnedAniimoDialog state={state} patch={patch} />
            <SettingsPopover running={running} onSolve={onSolve} onReset={onReset} />
          </div>
        </header>

        <section className="rewrite-current-plan" aria-label="Current optimized plan">
          <div className="rewrite-current-gain">
            <span className="rewrite-plan-art"><img src={itemIcon('coin')} alt="" /></span>
            <span>
              <small>Current plan gain</small>
              <strong>{plan ? fmt(plan.ratePerHour) : running ? '…' : '—'} <em>/ h</em></strong>
              <b>Home Coin</b>
            </span>
          </div>

          <div className="rewrite-current-target">
            <img src={itemIcon(state.target)} alt="" />
            <span><small>Objective</small><b>{targetName}</b><em>{plan ? `${fmt(plan.objectiveRate, 3)} / h` : 'waiting for plan'}</em></span>
          </div>

          <div className="rewrite-current-stat">
            <span><small>Requirements</small><b>{constraints.length}</b></span>
          </div>
          <div className="rewrite-current-stat">
            <span><small>Co-MAX</small><b>{coMax}</b></span>
          </div>
          <div className={running ? 'rewrite-plan-state running' : 'rewrite-plan-state'}>
            <Activity aria-hidden="true" />
            <span>{running ? 'Solving' : plan ? 'Synced' : 'Ready'}</span>
          </div>
        </section>
      </div>

      <main className="rewrite-page-content">{children}</main>

      <footer className="rewrite-footer">
        <span>Unofficial community tool · optimization runs locally in your browser.</span>
        <span>Experimental React/TypeScript rewrite · main remains untouched.</span>
      </footer>
    </div>
  )
}
