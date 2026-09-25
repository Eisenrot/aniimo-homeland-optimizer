import FacilitiesPanel from '../components/FacilitiesPanel'
import ModulesPanel from '../components/ModulesPanel'
import ObjectivePanel from '../components/ObjectivePanel'
import PersistentCollapse from '../components/PersistentCollapse'
import PlanSettings from '../components/PlanSettings'
import RecipeNotesPanel from '../components/RecipeNotesPanel'
import ResultsPanel from '../components/ResultsPanel'
import type { OptimizerPlan, OptimizerState, SolverProgress } from '../types'

type Props = {
  state: OptimizerState
  patch: (update: (draft: OptimizerState) => void) => void
  plan: OptimizerPlan | null
  progress: SolverProgress | null
  running: boolean
  error: string | null
}

export default function PlanPage({ state, patch, plan, progress, running, error }: Props) {
  return (
    <div className="rewrite-plan-workspace">
      <aside className="rewrite-config-stack">
        <PersistentCollapse id="objective" label="Objective">
          <ObjectivePanel state={state} patch={patch} />
        </PersistentCollapse>
        <PersistentCollapse id="homeland" label="Homeland">
          <PlanSettings state={state} patch={patch} />
        </PersistentCollapse>
        <PersistentCollapse id="facilities" label="Facilities">
          <FacilitiesPanel state={state} patch={patch} />
        </PersistentCollapse>
        <PersistentCollapse id="modules" label="Modules">
          <ModulesPanel state={state} patch={patch} />
        </PersistentCollapse>
        <PersistentCollapse id="recipe-notes" label="Recipe notes">
          <RecipeNotesPanel state={state} patch={patch} />
        </PersistentCollapse>
      </aside>

      <section className="rewrite-results-stack">
        <ResultsPanel
          plan={plan}
          progress={progress}
          running={running}
          error={error}
        />
      </section>
    </div>
  )
}
