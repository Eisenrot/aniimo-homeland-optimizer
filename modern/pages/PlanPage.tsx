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
  progress: SolverProgress | null
  running: boolean
  error: string | null
}

export default function PlanPage({ state, patch, plan, progress, running, error }: Props) {
  return (
    <div className="rewrite-plan-page">
      <div className="rewrite-plan-grid">
        <div className="rewrite-config-stack">
          <ObjectivePanel state={state} patch={patch} />
          <PlanSettings state={state} patch={patch} />
          <FacilitiesPanel state={state} patch={patch} />
        </div>

        <aside className="rewrite-side-stack">
          <ModulesPanel state={state} patch={patch} />
          <RecipeNotesPanel state={state} patch={patch} />
        </aside>
      </div>

      <section className="rewrite-results">
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
