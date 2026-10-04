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
  status?: 'enabled' | 'disabled' | 'excluded'
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
  preferElectricalAutomation: boolean
  maximizeElectricalCoverage: boolean
  generatorAvailable: boolean
  generatorLevel: number
  utilityCounts: {
    cooling: number
    heat: number
    sunlamp: number
    generator: number
    powerPole: number
  }
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
  footprint?: { w: number; h: number }
  influence?: { w: number; h: number }
  placeCap?: number[]
  electricPower?: Record<string, number>
  canRotate?: boolean
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
  events?: Array<{
    name: string
    objectiveGroups?: Array<{
      subgroup: string
      items: Array<number | string>
    }>
    [key: string]: unknown
  }>
}

export type PlanRow = {
  facility: string
  recipe: Recipe
  batchesPerHour: number
  units: number
  perHour: number
  targetPerHour?: number
  cycleSeconds?: number
  manualSeconds?: number
  growSeconds?: number
  effectiveEnv?: string | null
  executionMode?: string
}

export type OptimizerStats = {
  engine?: string
  elapsedMs?: number
  candidatePlans?: number
  climateOffsets?: number
  scenarioTotal?: number
  testedScenarios?: number
  buildMs?: number
  solveMs?: number
  climateCuts?: number
  modelCols?: number
  modelRows?: number
  mipNodes?: string
  mipGap?: number
  modelStatus?: string
  validationOk?: boolean
  validationErrors?: string[]
}

export type ObjectiveWeightView = {
  key: string
  item: string
  label?: string
  scale: number
  normalizer: number
  max: number | null
}

export type RosterAssignmentView = {
  workerKey: string
  kind: 'flex' | 'permanent' | 'utility'
  facility: string
  recipeId?: number | string
  utilityKey?: string
  task?: {
    key?: string
    ability?: string
    level?: number
    family?: number | null
    baselineSeconds?: number
  }
  seconds: number
  speed?: number
  cycle?: number
}

export type RosterSolveView = {
  aware: true
  cap: number
  selectedCount: number
  selected: Array<{
    key: string
    copy: number
    pal: Pal
  }>
  assignments: RosterAssignmentView[]
}

export type OptimizerPlan = {
  ratePerHour: number
  targetRate: number
  objectiveRate: number
  rows: PlanRow[]
  objectiveWeights?: ObjectiveWeightView[]
  jointMinShare?: number | null
  runnableRecipes?: Recipe[]
  roster?: RosterSolveView | null
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
  engine?: string
  phase?: string
  progress?: number
  candidatePlans?: number
  climateOffsets?: number
  elapsedMs?: number
  candidatesPerSecond?: number
  scenarioIndex?: number
  scenarioTotal?: number
  climateCuts?: number
  detail?: string
}

export type SolveRequest = {
  id: number
  type?: 'solve'
  state: OptimizerState
  options?: {
    timeLimitSeconds?: number
    maxClimateCuts?: number
    mipRelativeGap?: number
    mipAbsoluteGap?: number
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
  team: TeamMemberView[]
  rate: number
}

export type TeamFacilityAssignmentView = {
  facility: string
  mode: 'permanent' | 'utility' | 'flex'
  seconds: number
}

export type TeamAnalysisResult = {
  best: TeamCandidateView | null
  itemRates: Array<{
    item: string
    rate: number
  }>
  assignments: TeamFacilityAssignmentView[][]
  requiredAbilities: Array<{
    ability: string
    level: number
    jobs: string[]
    count: number
    units?: number
  }>
  personality: null | {
    hints: Array<{
      profile: string
      display: Array<{
        char: string
        status: string
        facilities: string[]
      }>
    }>
  }
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
  electric?: boolean
  facilityLevel?: number
  powerDemand?: number
}

export type LayoutField = {
  type: string
  temperature?: string
  source?: string
  copy?: number
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
  powerNetwork?: {
    generators: number
    poles: number
    supply: number
    demand: number
    efficiency: number
    unpowered: number
  } | null
}

export type LayoutWorkerMessage =
  | { type: 'result'; id: number; layout: BaseLayout }
  | { type: 'error'; id: number; message: string }
