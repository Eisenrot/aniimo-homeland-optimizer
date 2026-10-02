const clampRv = (rv) => Math.min(20, Math.max(1, Math.floor(Number(rv) || 1)))

export const UTILITY_PLACE_CAPS = Object.freeze({
  'cooling-unit': [1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,3,3,3,3],
  'heat-furnace': [1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,3,3,3,3],
  'sunlamp': [1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,3,3],
  'crackle-generator': [1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,3,3,3],
  'crackle-power-pole': [6,6,6,6,6,6,6,6,6,6,6,6,6,12,12,18,18,24,24,30],
})

export const GENERATOR_LEVELS = Object.freeze({
  1: { power: 600, workload: 60, lightning: 1, unlockRv: 12 },
  2: { power: 800, workload: 60, lightning: 2, unlockRv: 14 },
  3: { power: 1000, workload: 75, lightning: 3, unlockRv: 16 },
  4: { power: 1200, workload: 90, lightning: 3, unlockRv: 18 },
  5: { power: 1500, workload: 105, lightning: 3, unlockRv: 20 },
})

export const UTILITY_FACILITY_DEFS = Object.freeze({
  'cooling-unit': {
    slug: 'cooling-unit',
    name: 'Cooling Unit',
    kind: 'utility',
    maxLevel: 1,
    outputLimit: {},
    homeLevel: { 1: 7 },
    upgradeCost: { 1: 8200 },
    icon: '/images/aniimo/homeland/cooling-unit.webp',
    plotGlyph: '/images/aniimo/homeland/glyph/cooling-unit.webp',
    footprint: { w: 2, h: 2 },
    placeCap: UTILITY_PLACE_CAPS['cooling-unit'],
    comfortValue: 5,
    influence: { w: 9, h: 9 },
    category: 104,
    categoryName: 'Auxiliary Facilities',
    canRotate: true,
  },
  'heat-furnace': {
    slug: 'heat-furnace',
    name: 'Heat Furnace',
    kind: 'utility',
    maxLevel: 1,
    outputLimit: {},
    homeLevel: { 1: 7 },
    upgradeCost: { 1: 8200 },
    icon: '/images/aniimo/homeland/heat-furnace.webp',
    plotGlyph: '/images/aniimo/homeland/glyph/heat-furnace.webp',
    footprint: { w: 1, h: 1 },
    placeCap: UTILITY_PLACE_CAPS['heat-furnace'],
    comfortValue: 5,
    influence: { w: 9, h: 9 },
    category: 104,
    categoryName: 'Auxiliary Facilities',
    canRotate: true,
  },
  sunlamp: {
    slug: 'sunlamp',
    name: 'Sunlamp',
    kind: 'utility',
    maxLevel: 1,
    outputLimit: {},
    homeLevel: { 1: 9 },
    upgradeCost: { 1: 15700 },
    icon: '/images/aniimo/homeland/sunlamp.webp',
    plotGlyph: '/images/aniimo/homeland/glyph/sunlamp.webp',
    footprint: { w: 1, h: 1 },
    placeCap: UTILITY_PLACE_CAPS.sunlamp,
    comfortValue: 5,
    influence: { w: 9, h: 9 },
    category: 104,
    categoryName: 'Auxiliary Facilities',
    canRotate: true,
  },
  'crackle-generator': {
    slug: 'crackle-generator',
    name: 'Crackle Generator',
    kind: 'utility',
    maxLevel: 5,
    outputLimit: {},
    homeLevel: { 1: 12, 2: 14, 3: 16, 4: 18, 5: 20 },
    icon: '/images/aniimo/homeland/crackle-generator.webp',
    plotGlyph: '/images/aniimo/homeland/glyph/crackle-generator.webp',
    footprint: { w: 2, h: 2 },
    placeCap: UTILITY_PLACE_CAPS['crackle-generator'],
    comfortValue: 5,
    influence: { w: 11, h: 11 },
    category: 104,
    categoryName: 'Auxiliary Facilities',
    canRotate: true,
  },
  'crackle-power-pole': {
    slug: 'crackle-power-pole',
    name: 'Crackle Power Pole',
    kind: 'utility',
    maxLevel: 1,
    outputLimit: {},
    homeLevel: { 1: 12 },
    icon: '/images/aniimo/homeland/crackle-power-pole.webp',
    plotGlyph: '/images/aniimo/homeland/glyph/crackle-power-pole.webp',
    footprint: { w: 1.5, h: 1.5 },
    placeCap: UTILITY_PLACE_CAPS['crackle-power-pole'],
    comfortValue: 1,
    influence: { w: 7, h: 7 },
    category: 104,
    categoryName: 'Auxiliary Facilities',
    canRotate: true,
  },
})

export function utilityCapAtRv(slug, rv) {
  const def = UTILITY_FACILITY_DEFS[slug]
  const unlock = Math.min(...Object.values(def?.homeLevel || { 1: Infinity }).map(Number))
  if (clampRv(rv) < unlock) return 0
  const caps = UTILITY_PLACE_CAPS[slug]
  return caps ? Number(caps[clampRv(rv) - 1] || 0) : 0
}

export function maxGeneratorLevelAtRv(rv) {
  const level = clampRv(rv)
  let best = 0
  for (const [generatorLevel, spec] of Object.entries(GENERATOR_LEVELS)) {
    if (spec.unlockRv <= level) best = Math.max(best, Number(generatorLevel))
  }
  return best
}

export function generatorPowerAtLevel(level) {
  return Number(GENERATOR_LEVELS[Math.max(1, Math.min(5, Number(level) || 1))]?.power || 0)
}

export function generatorWorkloadAtLevel(level) {
  return Number(GENERATOR_LEVELS[Math.max(1, Math.min(5, Number(level) || 1))]?.workload || 0)
}

export function generatorLightningAtLevel(level) {
  return Number(GENERATOR_LEVELS[Math.max(1, Math.min(5, Number(level) || 1))]?.lightning || 1)
}

export function configuredFacilityLevel(state, slug, requiredLevel = 1) {
  const cfg = state?.facilities?.[slug]
  if (!cfg) return Math.max(1, Number(requiredLevel) || 1)
  if (Array.isArray(cfg.stacks) && cfg.stacks.length) {
    const eligible = cfg.stacks
      .filter((entry) => Number(entry.count || 0) > 0 && Number(entry.level || 1) >= Number(requiredLevel || 1))
      .map((entry) => Number(entry.level || 1))
      .sort((a, b) => a - b)
    if (eligible.length) return eligible[0]
    return Math.max(...cfg.stacks.map((entry) => Number(entry.level || 1)), Number(requiredLevel || 1))
  }
  return Math.max(Number(requiredLevel || 1), Number(cfg.level || 1))
}

export function electricDemandForFacility(facility, level) {
  if (!facility?.electricPower) return 0
  const numeric = Math.max(1, Math.floor(Number(level) || 1))
  return Number(facility.electricPower[String(numeric)] ?? facility.electricPower[numeric] ?? 0) || 0
}

export function totalGeneratorPower(count, level) {
  return Math.max(0, Math.floor(Number(count) || 0)) * generatorPowerAtLevel(level)
}

export function gridPowerEfficiency(totalPower, totalDemand, maxEfficiency = 1.2) {
  const demand = Math.max(0, Number(totalDemand) || 0)
  if (demand <= 1e-9) return 0
  return Math.max(0, Math.min(maxEfficiency, Math.max(0, Number(totalPower) || 0) / demand))
}

export function electricCycleSeconds(baseSeconds, totalPower, totalDemand) {
  const efficiency = gridPowerEfficiency(totalPower, totalDemand)
  if (efficiency <= 1e-9) return Infinity
  return Math.max(0, Number(baseSeconds) || 0) / efficiency
}

export function centeredInfluenceRect(rect, influence) {
  const w = Number(influence?.w || 0)
  const h = Number(influence?.h || 0)
  return {
    x: Number(rect.x || 0) + Number(rect.w || 0) / 2 - w / 2,
    y: Number(rect.y || 0) + Number(rect.h || 0) / 2 - h / 2,
    w,
    h,
  }
}