import { solveNextWithHighs } from './solve.js'

function ownedCount(state, id) {
  const owned = state.owned?.[String(id)]
  return Math.max(1, Math.floor(Number(owned?.count || 1)))
}

function memberPalId(member) {
  return String(member?.pal?.id ?? '')
}

function facilityName(data, slug) {
  return data.facilities?.find((facility) => facility.slug === slug)?.name || slug
}

function candidateScore(candidateId, plan, state) {
  const selected = plan.roster?.selected || []
  const assignments = plan.roster?.assignments || []
  const originalCount = ownedCount(state, candidateId)
  const memberByKey = new Map(selected.map((member) => [member.key, member]))

  let existingFullTime = 0
  let extraFlex = 0
  let extraSeconds = 0

  for (const assignment of assignments) {
    const member = memberByKey.get(assignment.workerKey)
    if (!member || memberPalId(member) !== candidateId) continue
    const isExtra = Number(member.copy || 1) > originalCount
    const seconds = Math.max(0, Number(assignment.seconds || 0))
    if (isExtra) {
      extraSeconds += seconds
      if (assignment.kind === 'flex') extraFlex += seconds
    } else if ((assignment.kind === 'permanent' || assignment.kind === 'utility') && seconds >= 3599) {
      existingFullTime += seconds
    }
  }

  return (existingFullTime > 0 ? 1_000_000 : 0)
    + (extraFlex > 0 ? 100_000 : 0)
    + extraSeconds
}

async function solveProbe(highs, plan, state, data, timeLimitSeconds) {
  return solveNextWithHighs(highs, state, data, {
    rosterAware: true,
    fixedPlan: plan,
    objectiveWeights: plan.objectiveWeights,
    timeLimitSeconds,
    maxClimateCuts: 24,
    mipRelativeGap: 0,
    mipAbsoluteGap: 1e-7,
  })
}

function describeRescue(plan, state, data, candidateId) {
  const selected = plan.roster?.selected || []
  const assignments = plan.roster?.assignments || []
  const memberByKey = new Map(selected.map((member) => [member.key, member]))
  const originalCount = ownedCount(state, candidateId)
  const member = selected.find((entry) => memberPalId(entry) === candidateId)
  const pal = member?.pal || data.pals?.find((entry) => String(entry.id) === candidateId)
  const label = String(pal?.name || pal?.speciesName || candidateId)

  const reserved = new Set()
  const extraAbilities = new Set()
  const extraFacilities = new Set()

  for (const assignment of assignments) {
    const assigned = memberByKey.get(assignment.workerKey)
    if (!assigned || memberPalId(assigned) !== candidateId) continue

    const isExtra = Number(assigned.copy || 1) > originalCount
    const seconds = Math.max(0, Number(assignment.seconds || 0))
    if (!isExtra && (assignment.kind === 'permanent' || assignment.kind === 'utility') && seconds >= 3599) {
      reserved.add(facilityName(data, assignment.facility))
    }
    if (isExtra) {
      if (assignment.task?.ability) extraAbilities.add(String(assignment.task.ability))
      if (assignment.facility) extraFacilities.add(facilityName(data, assignment.facility))
    }
  }

  const nextCount = originalCount + 1
  const reservedText = [...reserved]
  const abilityText = [...extraAbilities]
  const facilityText = [...extraFacilities]

  let reason = ''
  if (reservedText.length && abilityText.length) {
    reason = ` ${label} is already reserved full-time by ${reservedText.join(' / ')}, while the remaining Plan still needs ${abilityText.join(' / ')} work.`
  } else if (reservedText.length && facilityText.length) {
    reason = ` ${label} is already reserved full-time by ${reservedText.join(' / ')}, while another copy is needed for ${facilityText.join(' / ')}.`
  } else if (facilityText.length) {
    reason = ` The extra copy is used by ${facilityText.join(' / ')}.`
  }

  return {
    palId: candidateId,
    label,
    fromCount: originalCount,
    toCount: nextCount,
    message: `This exact Plan becomes feasible if ${label} is set to ${nextCount} owned copies.${reason} More team slots alone will not help; the missing resource is another physical copy.`,
  }
}

export async function findSingleCopyRescue(highs, plan, state, data, options = {}) {
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  const timeLimitSeconds = Math.max(2, Number(options.timeLimitSeconds || 8))
  const augmentedState = structuredClone(state)

  for (const pal of data.pals || []) {
    const id = String(pal.id)
    const owned = augmentedState.owned?.[id]
    if (!owned?.enabled || pal.unavailable) continue
    owned.count = ownedCount(state, id) + 1
  }

  progress('Checking whether one more owned copy can unblock the Plan')
  const augmented = await solveProbe(highs, plan, augmentedState, data, timeLimitSeconds)
  if (augmented.infeasible || augmented.optimizerStats?.validationOk === false) return null

  const candidateIds = [...new Set(
    (augmented.roster?.selected || [])
      .filter((member) => Number(member.copy || 1) > ownedCount(state, memberPalId(member)))
      .map(memberPalId)
      .filter(Boolean),
  )].sort((a, b) => candidateScore(b, augmented, state) - candidateScore(a, augmented, state))

  for (const candidateId of candidateIds.slice(0, 8)) {
    const candidateState = structuredClone(state)
    const owned = candidateState.owned?.[candidateId]
    if (!owned?.enabled) continue
    owned.count = ownedCount(state, candidateId) + 1

    const pal = data.pals?.find((entry) => String(entry.id) === candidateId)
    progress(`Trying one more ${pal?.name || pal?.speciesName || 'specialist'}`)
    const rescued = await solveProbe(highs, plan, candidateState, data, timeLimitSeconds)
    if (rescued.infeasible || rescued.optimizerStats?.validationOk === false) continue

    return {
      ...describeRescue(rescued, state, data, candidateId),
      plan: rescued,
    }
  }

  return null
}
