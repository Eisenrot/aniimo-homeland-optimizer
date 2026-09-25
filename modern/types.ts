export type FacilityStack = {
  count: number
  level: number
}

export type FacilityConfig = {
  count: number
  level: number
  stacks?: FacilityStack[]
}

export type Guarantee = {
  item: string
  perHour: number
  maximize: boolean
  enabled: boolean
}

export type OwnedAniimo = {
  enabled: boolean
  count: number
}

export type OptimizerState = {
  homelandLevel: number
  workerSlots: number
  teamSlots: number
  abilityLevel: number | 'auto'
  collectHours: number
  oneRecipePerFacility: boolean
  generatorAvailable: boolean
  hungry: boolean
  manualSpeeds: boolean
  climateOptions: {
    cooling: boolean
    heat: boolean
    sunlamp: boolean
  }
  target: string
  guarantees: Guarantee[]
  goal: string
  facilities: Record<string, FacilityConfig>
  modules: Record<string, number>
  speeds: Record<string, number>
  recipeNotes: Record<string, boolean>
  owned: Record<string, OwnedAniimo>
  realRecipeSpeeds?: Record<string, number>
}

export type Facility = {
  slug: string
  name: string
  kind: string
  maxLevel: number
  categoryName?: string
  category?: number
  icon?: string
  plotGlyph?: string
  homeLevel?: Record<string, number>
}

export type Item = {
  name?: string
  value?: number
}

export type RecipeNote = {
  item: number | string
  name: string
}

export type Recipe = {
  id: number
  facility: string
  level?: number
  env?: string
  note?: RecipeNote
  outputs?: Array<{ item: number; qty: number }>
  inputs?: Array<{ item: number; qty: number }>
  steps?: Array<{ ability: string; level: number; name?: string; workload?: number }>
  [key: string]: unknown
}

export type Pal = {
  id: number | string
  name: string
  speciesName?: string
  form?: string
  isForm?: boolean
  unavailable?: boolean
  legacyId?: number | string
  abilities?: Record<string, number>
  [key: string]: unknown
}

export type GameData = {
  version?: string
  facilities: Facility[]
  recipes: Recipe[]
  items: Record<string, Item>
  pals: Pal[]
  abilities?: Record<string, { color?: string }>
}

export type PlanRow = {
  facility: string
  recipe: Recipe
  batchesPerHour: number
  units: number
  perHour: number
  targetPerHour?: number
  cycleSeconds?: number
}

export type OptimizerStats = {
  engine?: string
  elapsedMs?: number
  candidatePlans?: number
  climateOffsets?: number
  scenarioTotal?: number
  testedScenarios?: number
}

export type OptimizerPlan = {
  ratePerHour: number
  targetRate: number
  objectiveRate: number
  rows: PlanRow[]
  scenario?: Record<string, unknown>
  scenarioLabel?: string
  infeasible?: boolean
  climateLayout?: {
    feasible?: boolean
    status?: string
    message?: string
  }
  optimizerStats?: OptimizerStats
}

export type SolverProgress = {
  phase?: string
  progress?: number
  candidatePlans?: number
  climateOffsets?: number
  elapsedMs?: number
  candidatesPerSecond?: number
  scenarioIndex?: number
  scenarioTotal?: number
  detail?: string
}

export type SolveRequest = {
  id: number
  state: OptimizerState
  options?: {
    maxClimateVariants?: number
    maxClimateOffset?: number
  }
}

export type WorkerMessage =
  | { type: 'progress'; id: number; progress: SolverProgress }
  | { type: 'result'; id: number; plan: OptimizerPlan }
  | { type: 'error'; id: number; message: string; stack?: string }

export type TeamMemberView = {
  id: string
  name: string
  speciesName: string
  form?: string
  isForm: boolean
  abilities: Record<string, number>
  copy: number
}

export type TeamCandidateView = {
  rank: number
  team: TeamMemberView[]
  rate: number
  targetRate: number
  objectiveRate: number
  coverageWeight: number
  resilience: number
}

export type TeamAnalysisResult = {
  candidates: TeamCandidateView[]
  requiredAbilities: Array<{
    ability: string
    level: number
    jobs: string[]
    count: number
    units?: number
  }>
  personality: null | {
    rate: number
    targetRate: number
    objectiveRate: number
    profiles: string[]
    hints: Array<{
      profile: string
      display: Array<{
        char: string
        status: string
        facilities: string[]
      }>
    }>
  }
  core: TeamMemberView[]
  reserves: TeamMemberView[]
  coverage: Array<{
    facility: string
    total: number
    hit: number
    demandHours: number
    capacityRatio: number
  }>
}

export type TeamWorkerMessage =
  | { type: 'progress'; id: number; detail: string }
  | { type: 'result'; id: number; result: TeamAnalysisResult }
  | { type: 'error'; id: number; message: string }

export type LayoutSettings = {
  compact: boolean
  shape: 'auto' | 'compact' | 'rows' | 'clusters' | 'spread'
  allowRotate: boolean
  storageUnits: number
  disabledPlots: number[]
}

export type LayoutPlacement = {
  id: string
  facility: string
  name: string
  kind?: string
  env?: string | null
  x: number
  y: number
  w: number
  h: number
  rotated?: boolean
  icon?: string
}

export type LayoutField = {
  type: string
  x: number
  y: number
  w: number
  h: number
}

export type BaseLayout = {
  feasible: boolean
  reason?: string
  placements: LayoutPlacement[]
  fields: LayoutField[]
  plots: Array<{ plot: number; x: number; y: number; w: number; h: number }>
  usedPlots?: number[]
  bounds?: { x: number; y: number; w: number; h: number }
  itemCount?: number
}

export type LayoutWorkerMessage =
  | { type: 'result'; id: number; layout: BaseLayout }
  | { type: 'error'; id: number; message: string }
