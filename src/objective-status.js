const VALID_GUARANTEE_STATUSES = new Set(['enabled', 'disabled', 'excluded'])

export function guaranteeStatus(guarantee) {
  const explicit = String(guarantee?.status || '')
  if (VALID_GUARANTEE_STATUSES.has(explicit)) return explicit
  return guarantee?.enabled === false ? 'disabled' : 'enabled'
}

export function isGuaranteeEnabled(guarantee) {
  return guaranteeStatus(guarantee) === 'enabled'
}

export function isGuaranteeExcluded(guarantee) {
  return guaranteeStatus(guarantee) === 'excluded'
}

export function nextGuaranteeStatus(guarantee) {
  const current = guaranteeStatus(guarantee)
  if (current === 'enabled') return 'disabled'
  if (current === 'disabled') return 'excluded'
  return 'enabled'
}

export function excludedObjectiveItems(state) {
  return new Set(
    (state?.guarantees || [])
      .filter(isGuaranteeExcluded)
      .map((guarantee) => String(guarantee?.item || ''))
      .filter(Boolean),
  )
}

export function recipeExcludedByState(recipe, state) {
  const excluded = excludedObjectiveItems(state)
  if (!excluded.size) return false
  return (recipe?.outputs || []).some((output) => excluded.has(String(output.item)))
}
