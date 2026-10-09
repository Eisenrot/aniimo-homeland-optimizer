export const DEFAULT_CLIMATE_CUTS = 48
export const RETRY_CLIMATE_CUTS = 96

export function isClimateSearchExhausted(plan) {
  return plan?.searchExhausted === true
    || String(plan?.optimizerStats?.modelStatus || '').startsWith('climate-')
}

export async function solveWithClimateRetry(solve, { initialCuts = DEFAULT_CLIMATE_CUTS, retryCuts = RETRY_CLIMATE_CUTS, onRetry = () => {} } = {}) {
  const first = await solve(initialCuts)
  if (!isClimateSearchExhausted(first) || retryCuts <= initialCuts) return first
  onRetry()
  return solve(retryCuts)
}
