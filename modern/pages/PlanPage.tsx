import { useState } from 'react'
import { BookOpenText, Cpu, Factory, Home, Target } from 'lucide-react'
import FacilitiesPanel from '../components/FacilitiesPanel'
import ModulesPanel from '../components/ModulesPanel'
import ObjectivePanel from '../components/ObjectivePanel'
import PlanSettings from '../components/PlanSettings'
import RecipeNotesPanel from '../components/RecipeNotesPanel'
import ResultsPanel from '../components/ResultsPanel'
import type { OptimizerPlan, OptimizerState, SolverProgress } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
  plan: OptimizerPlan | null
  planCurrent: boolean
  progress: SolverProgress | null
  running: boolean
  error: string | null
}

const SCENES = [
  { key: 'objective', label: 'Objective', note: 'What the solver is chasing.', icon: Target },
  { key: 'homeland', label: 'Homeland', note: 'Level, workers, rules, utilities.', icon: Home },
  { key: 'facilities', label: 'Facilities', note: 'Physical production inventory.', icon: Factory },
  { key: 'modules', label: 'Modules', note: 'Upgrade assumptions.', icon: Cpu },
  { key: 'notes', label: 'Recipe notes', note: 'Recipe access and unlocks.', icon: BookOpenText },
] as const

type SceneKey = typeof SCENES[number]['key']

export default function PlanPage({ state, patch, plan, planCurrent, progress, running, error }: Props) {
  const [scene, setScene] = useState<SceneKey>('objective')
  const active = SCENES.find((item) => item.key === scene) || SCENES[0]

  return (
    <div className="plan-studio">
      <section className="plan-result-stage">
        <div className="plan-stage-caption">
          <span>LIVE MODEL / OUTPUT</span>
          <strong>The production sheet</strong>
          <small>Results remain visible while the assumptions change.</small>
        </div>
        <ResultsPanel
          state={state}
          plan={plan}
          progress={progress}
          running={running}
          error={error}
        />
      </section>

      <nav className="plan-scene-index" aria-label="Plan configuration sections">
        <div className="plan-index-heading">
          <span>EDIT</span>
          <b>05</b>
        </div>
        {SCENES.map((item, index) => {
          const Icon = item.icon
          const selected = scene === item.key
          return (
            <button
              key={item.key}
              type="button"
              className={selected ? 'selected' : undefined}
              aria-pressed={selected}
              onClick={() => setScene(item.key)}
            >
              <small>{String(index + 1).padStart(2, '0')}</small>
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <section className="plan-editor-sheet">
        <header className="plan-editor-masthead">
          <div>
            <span>CONFIGURATION / {active.label.toUpperCase()}</span>
            <h1>{active.label}</h1>
            <p>{active.note}</p>
          </div>
          <em>{String(SCENES.findIndex((item) => item.key === scene) + 1).padStart(2, '0')} / 05</em>
        </header>

        <div className="plan-editor-body" key={scene}>
          {scene === 'objective' && <ObjectivePanel state={state} plan={planCurrent ? plan : null} patch={patch} />}
          {scene === 'homeland' && <PlanSettings state={state} patch={patch} />}
          {scene === 'facilities' && <FacilitiesPanel state={state} patch={patch} />}
          {scene === 'modules' && <ModulesPanel state={state} patch={patch} />}
          {scene === 'notes' && <RecipeNotesPanel state={state} patch={patch} />}
        </div>
      </section>
    </div>
  )
}
