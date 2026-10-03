import { rosterType, rosterTypes, setOwnedCopiesForTypes } from './src/owned-copies.js'

const pals = [
  { id: 1, name: 'Base A', isForm: false },
  { id: 2, name: 'Base B', isForm: false },
  { id: 3, name: 'Prismana A', isForm: true, form: 'Prismana' },
  { id: 4, name: 'Rain A', isForm: true, form: 'Rainstorm' },
  { id: 5, name: 'Unavailable Base', isForm: false, unavailable: true },
]

const state = {
  owned: {
    '1': { enabled: true, count: 1 },
    '2': { enabled: false, count: 3 },
    '3': { enabled: true, count: 2 },
    '4': { enabled: true, count: 4 },
    '5': { enabled: true, count: 7 },
  },
}

const types = rosterTypes(pals)
if (types[0] !== 'Base' || !types.includes('Prismana') || !types.includes('Rainstorm')) {
  throw new Error('roster type list is wrong')
}
if (rosterType(pals[0]) !== 'Base' || rosterType(pals[2]) !== 'Prismana') {
  throw new Error('roster type classification is wrong')
}

const baseResult = setOwnedCopiesForTypes(state, pals, new Set(['Base']), 8)
if (baseResult.target !== 8 || baseResult.changed !== 1) {
  throw new Error('Base batch did not report the expected change count')
}
if (state.owned['1'].count !== 8) throw new Error('enabled Base Aniimo was not set to 8 copies')
if (state.owned['2'].count !== 3) throw new Error('disabled Base Aniimo should stay untouched')
if (state.owned['5'].count !== 7) throw new Error('unavailable Aniimo should stay untouched')
if (state.owned['3'].count !== 2 || state.owned['4'].count !== 4) {
  throw new Error('unselected form types should stay untouched')
}

const formsResult = setOwnedCopiesForTypes(state, pals, ['Prismana', 'Rainstorm'], 200)
if (formsResult.target !== 99 || formsResult.changed !== 2) {
  throw new Error('selected form batch / copy clamp is wrong')
}
if (state.owned['3'].count !== 99 || state.owned['4'].count !== 99) {
  throw new Error('selected enabled forms were not updated')
}

console.log('owned-copy batch controls OK')
