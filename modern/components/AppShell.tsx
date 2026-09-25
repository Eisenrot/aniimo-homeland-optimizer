import type { ReactNode } from 'react'
import {
  Activity,
  Github,
  House,
  Map,
  PawPrint,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  UsersRound,
  Warehouse,
} from 'lucide-react'
import { DATA } from '../state'
import type { AppPage } from '../lib/page'
import type { OptimizerPlan, OptimizerState } from '../types'

const NAV = [
  { key: 'overview', label: 'Overview', href: './', icon: House },
  { key: 'optimizer', label: 'Optimizer', href: './optimizer.html', icon: SlidersHorizontal },
  { key: 'homeland', label: 'Homeland', href: './homeland.html', icon: Warehouse },
  { key: 'team', label: 'Real Team', href: './team.html', icon: UsersRound },
  { key: 'layout', label: 'Layout', href: './layout.html', icon: Map },
  { key: 'roster', label: 'Roster', href: './roster.html', icon: PawPrint },
] as const

const META: Record<AppPage, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: 'Homeland command', title: 'Overview', description: 'The useful numbers first. Configuration, staffing and physical layout stay one click away.' },
  optimizer: { eyebrow: 'Production model', title: 'Optimizer', description: 'Set the economic objective and constraints, then inspect exactly what the solver chose.' },
  homeland: { eyebrow: 'Configuration', title: 'Homeland', description: 'Facilities, modules, recipe unlocks and the operating rules that define every solve.' },
  team: { eyebrow: 'Owned roster', title: 'Real Team', description: 'Turn the theoretical plan into an actual Aniimo team, with personality roles and anti-stall coverage.' },
  layout: { eyebrow: 'Physical planner', title: 'Layout', description: 'Pack the chosen production plan into unlocked plots without corrupting climate requirements.' },
  roster: { eyebrow: 'Availability', title: 'Aniimo Roster', description: 'Manage forms, copies and ability availability used by the real-team optimizer.' },
}

type Props = {
  page: AppPage
  state: OptimizerState
  plan: OptimizerPlan | null
  running: boolean
  children: ReactNode
  onSolve: () => void
  onReset: () => void
}

export default function AppShell({ page, state, plan, running, children, onSolve, onReset }: Props) {
  const meta = META[page]
  const status = running ? 'Solving' : plan ? 'Plan synced' : page === 'roster' ? 'Roster mode' : 'Ready'

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <a className="app-brand" href="./" aria-label="Aniimo Homeland Optimizer overview">
          <span className="app-brand-mark">A</span>
          <span><b>Aniimo</b><small>Homeland Optimizer</small></span>
        </a>

        <nav className="app-nav" aria-label="Primary navigation">
          {NAV.map((item) => {
            const Icon = item.icon
            const current = page === item.key
            return (
              <a key={item.key} href={item.href} className={current ? 'app-nav-item current' : 'app-nav-item'} aria-current={current ? 'page' : undefined}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            )
          })}
        </nav>

        <div className="sidebar-context">
          <span className="context-label">Current Homeland</span>
          <div className="context-grid">
            <span><small>RV</small><b>{state.homelandLevel}</b></span>
            <span><small>Team</small><b>{state.teamSlots}</b></span>
            <span><small>Target</small><b>{state.target === 'coin' ? 'Coin' : 'Item'}</b></span>
          </div>
        </div>

        <div className="sidebar-footer">
          <span>{DATA.version || 'Game data'}</span>
          <a href="https://github.com/Eisenrot/aniimo-homeland-optimizer" target="_blank" rel="noreferrer">
            <Github aria-hidden="true" /> GitHub
          </a>
        </div>
      </aside>

      <div className="app-main">
        <div className="mobile-nav-wrap">
          <nav className="mobile-nav" aria-label="Primary navigation">
            {NAV.map((item) => (
              <a key={item.key} href={item.href} aria-current={page === item.key ? 'page' : undefined} className={page === item.key ? 'current' : ''}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <header className="page-header">
          <div className="page-heading">
            <span className="page-eyebrow">{meta.eyebrow}</span>
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
          </div>
          <div className="page-actions">
            <span className={running ? 'status-badge running' : 'status-badge'}><Activity aria-hidden="true" />{status}</span>
            {page !== 'roster' && (
              <button className="ui-button secondary" type="button" onClick={onSolve} disabled={running}>
                <RefreshCw aria-hidden="true" /> Re-run
              </button>
            )}
            <button className="ui-button ghost" type="button" onClick={onReset}><RotateCcw aria-hidden="true" /> Reset</button>
          </div>
        </header>

        <main className="page-content">{children}</main>

        <footer className="app-footer">
          <span>Experimental React/TypeScript rewrite · main remains untouched.</span>
          <span>Optimization runs locally in your browser.</span>
        </footer>
      </div>
    </div>
  )
}
