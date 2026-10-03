export function rosterType(pal) {
  return pal?.isForm ? String(pal.form || 'Form') : 'Base'
}

export function rosterTypes(pals) {
  return [...new Set((pals || []).map(rosterType))].sort((a, b) => {
    if (a === 'Base') return -1
    if (b === 'Base') return 1
    return a.localeCompare(b)
  })
}

export function setOwnedCopiesForTypes(state, pals, selectedTypes, count) {
  const target = Math.min(99, Math.max(1, Math.floor(Number(count) || 1)))
  const selected = selectedTypes instanceof Set ? selectedTypes : new Set(selectedTypes || [])
  let changed = 0

  for (const pal of pals || []) {
    const id = String(pal.id)
    const owned = state.owned?.[id]
    if (!owned?.enabled || pal.unavailable || !selected.has(rosterType(pal))) continue
    owned.count = target
    changed++
  }

  return { target, changed }
}
