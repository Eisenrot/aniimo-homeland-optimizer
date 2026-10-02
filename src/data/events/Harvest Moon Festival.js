export const HARVEST_MOON_FESTIVAL = Object.freeze({
  name: 'Harvest Moon Festival',
  availability: { start: '2026-09-16', end: '2026-10-27' },
  currency: 'Moonray Wheat',
  sources: [
    'https://aniidex.com/items/moondew-radish-seeds/',
    'https://aniidex.com/items/waxing-moon-pepper-seeds/',
    'https://aniidex.com/items/moondew-radish/',
    'https://aniidex.com/items/waxing-moon-pepper/',
    'https://aniidex.com/items/umbral-pickle/',
    'https://aniidex.com/items/umbral-hot-pot/',
    'https://aniidex.com/items/harvest-platter/',
    'https://aniidex.com/items/roasted-waxing-moon-pepper/',
    'https://aniidex.com/items/moondew-radish-slices/',
    'https://aniidex.com/items/umbral-sweet-spicy-sauce/',
    'https://aniimotools.dev/systems/recipes/',
  ],
  seeds: [
    { id: 4000043, name: 'Moondew Radish Seeds', recipeNote: 4040039 },
    { id: 4000044, name: 'Waxing Moon Pepper Seeds', recipeNote: 4040040 },
  ],
  objectiveGroups: [
    {
      subgroup: 'Fantasy Crops',
      items: [4001066, 4001067],
    },
    {
      subgroup: 'Fantasy Products',
      items: [4010146, 4010147, 4010148, 4010149, 4010150, 4010151],
    },
  ],
})

const icon = (id) => `https://aniidex.com/images/items/ui_item_${id}.webp`

export const HARVEST_MOON_ITEMS = Object.freeze({
  '4000043': { name: 'Moondew Radish Seeds', value: 0, quality: 4, event: HARVEST_MOON_FESTIVAL.name, icon: icon(4000043) },
  '4000044': { name: 'Waxing Moon Pepper Seeds', value: 0, quality: 4, event: HARVEST_MOON_FESTIVAL.name, icon: icon(4000044) },
  '4001066': { name: 'Moondew Radish', value: 74, currency: 'coin', energy: 1350, quality: 4, event: HARVEST_MOON_FESTIVAL.name, icon: icon(4001066) },
  '4001067': { name: 'Waxing Moon Pepper', value: 74, currency: 'coin', energy: 1350, quality: 4, event: HARVEST_MOON_FESTIVAL.name, icon: icon(4001067) },
  '4010146': { name: 'Umbral Pickle', value: 2290, currency: 'coin', quality: 4, event: HARVEST_MOON_FESTIVAL.name, icon: icon(4010146) },
  '4010147': { name: 'Umbral Hot Pot', value: 2150, currency: 'coin', quality: 4, event: HARVEST_MOON_FESTIVAL.name, icon: icon(4010147) },
  '4010148': { name: 'Harvest Platter', value: 5290, currency: 'coin', quality: 4, event: HARVEST_MOON_FESTIVAL.name, icon: icon(4010148) },
  '4010149': { name: 'Roasted Waxing Moon Pepper', value: 1520, currency: 'coin', quality: 4, event: HARVEST_MOON_FESTIVAL.name, icon: icon(4010149) },
  '4010150': { name: 'Moondew Radish Slices', value: 2370, currency: 'coin', quality: 4, event: HARVEST_MOON_FESTIVAL.name, icon: icon(4010150) },
  '4010151': { name: 'Umbral Sweet Spicy Sauce', value: 2390, currency: 'coin', quality: 4, event: HARVEST_MOON_FESTIVAL.name, icon: icon(4010151) },
})

const notes = Object.freeze({
  pickle: { item: 4040042, name: 'Recipe Note: Umbral Pickle' },
  hotPot: { item: 4040043, name: 'Recipe Note: Umbral Hot Pot' },
  platter: { item: 4040044, name: 'Recipe Note: Harvest Platter' },
  sauce: { item: 4040047, name: 'Recipe Note: Umbral Sweet and Spicy Sauce' },
})

const seasonal = (recipe, note) => ({
  ...recipe,
  note,
  event: HARVEST_MOON_FESTIVAL.name,
  seasonal: true,
})

const electric = (recipe, seconds) => seasonal({
  ...recipe,
  id: Number(`${recipe.id}1`),
  growSeconds: seconds,
  electric: true,
  steps: undefined,
  workload: undefined,
}, recipe.note)

const standardProducts = [
  seasonal({
    id: 4010146,
    facility: 'pickling-jar',
    level: 1,
    inputs: [{ item: 4001066, qty: 8 }, { item: 4001067, qty: 8 }, { item: 4010009, qty: 1 }],
    outputs: [{ item: 4010146, qty: 1 }],
    workload: 203,
    steps: [{ name: 'Marinating', ability: 'Dark', level: 2, workload: 0 }],
  }, notes.pickle),
  seasonal({
    id: 4010147,
    facility: 'blazing-stove',
    level: 1,
    inputs: [{ item: 4001066, qty: 8 }, { item: 4001067, qty: 8 }, { item: 4001071, qty: 8 }],
    outputs: [{ item: 4010147, qty: 1 }],
    workload: 203,
    steps: [{ name: 'Cooking', ability: 'Fire', level: 2, workload: 0 }],
  }, notes.hotPot),
  seasonal({
    id: 4010148,
    facility: 'crafting-table',
    level: 1,
    inputs: [{ item: 4010149, qty: 1 }, { item: 4010150, qty: 1 }],
    outputs: [{ item: 4010148, qty: 1 }],
    workload: 405,
    steps: [{ name: 'Crafting', ability: 'Artisanship', level: 3, workload: 0 }],
  }, notes.platter),
  seasonal({
    id: 4010149,
    facility: 'claw-game-cooker',
    level: 1,
    inputs: [{ item: 4001067, qty: 8 }, { item: 4001069, qty: 23 }],
    outputs: [{ item: 4010149, qty: 1 }],
    workload: 162,
    steps: [{ name: 'Cooking', ability: 'Fire', level: 3, workload: 0 }],
  }, null),
  seasonal({
    id: 4010150,
    facility: 'blazing-stove',
    level: 1,
    inputs: [{ item: 4001066, qty: 8 }, { item: 4010046, qty: 1 }],
    outputs: [{ item: 4010150, qty: 1 }],
    workload: 203,
    steps: [{ name: 'Cooking', ability: 'Fire', level: 2, workload: 0 }],
  }, null),
  seasonal({
    id: 4010151,
    facility: 'simmering-pot',
    level: 1,
    inputs: [{ item: 4001066, qty: 8 }, { item: 4001067, qty: 8 }, { item: 4001069, qty: 23 }],
    outputs: [{ item: 4010151, qty: 1 }],
    workload: 243,
    steps: [{ name: 'Cooking', ability: 'Fire', level: 3, workload: 0 }],
  }, notes.sauce),
]

export const HARVEST_MOON_RECIPES = Object.freeze([
  seasonal({
    id: 4001066,
    facility: 'farmland',
    level: 1,
    inputs: [{ item: 4000043, qty: 1 }],
    outputs: [{ item: 4001066, qty: 8 }],
    growSeconds: 2400,
    steps: [
      { name: 'Sowing', ability: 'Grass', level: 1, workload: 3 },
      { name: 'Reaping', ability: 'Dark', level: 1, workload: 3 },
    ],
  }, null),
  seasonal({
    id: 4001067,
    facility: 'farmland',
    level: 1,
    inputs: [{ item: 4000044, qty: 1 }],
    outputs: [{ item: 4001067, qty: 8 }],
    growSeconds: 2400,
    steps: [
      { name: 'Sowing', ability: 'Grass', level: 1, workload: 3 },
      { name: 'Reaping', ability: 'Dark', level: 1, workload: 3 },
    ],
  }, null),
  ...standardProducts,
  electric(standardProducts[0], 180),
  electric(standardProducts[1], 180),
  electric(standardProducts[2], 300),
  electric(standardProducts[3], 120),
  electric(standardProducts[4], 180),
  electric(standardProducts[5], 180),
])