import loadHighs from 'highs'

let cached = null

export function loadNextHighs(options) {
  if (!cached) cached = loadHighs(options)
  return cached
}

export function resetNextHighsForTests() {
  cached = null
}
