import fs from 'node:fs'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'
import { DEFAULT_STATE } from './src/defaults.js'
import { GAME_DATA } from './src/data.js'
import { fillHomelandForRV } from './src/progression.js'

const temp = './.tmp-presets-test.mjs'

try {
  const source = fs.readFileSync('./modern/presets.ts', 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
    },
  }).outputText
  fs.writeFileSync(temp, js)

  const mod = await import(pathToFileURL(process.cwd() + '/.tmp-presets-test.mjs').href + '?x=' + Date.now())
  const state = fillHomelandForRV({
    ...structuredClone(DEFAULT_STATE),
    homelandLevel: 20,
    workerSlots: 45,
    teamSlots: 45,
    abilityLevel: 4,
  }, GAME_DATA)

  state.recipeNotes = Object.fromEntries(
    GAME_DATA.recipes.filter((recipe) => recipe.note).map((recipe) => [String(recipe.note.item), true]),
  )
  state.target = '4010148'
  state.guarantees = [
    { item: '4001066', perHour: 20, maximize: true, enabled: true },
    { item: '4001067', perHour: 20, maximize: true, enabled: true },
    { item: '4010147', perHour: 2, maximize: false, enabled: true },
  ]

  const snapshot = mod.snapshotPresetState(state)
  const code = mod.buildShareCodeFromSnapshot(snapshot)
  const parsedCode = mod.parseSharedPresetInput(code)
  if (JSON.stringify(parsedCode) !== JSON.stringify(snapshot)) throw new Error('Compact share-code roundtrip failed')

  const legacyJson = JSON.stringify({ v: 1, state: snapshot })
  const legacyBytes = new TextEncoder().encode(legacyJson)
  let binary = ''
  for (const byte of legacyBytes) binary += String.fromCharCode(byte)
  const legacyPayload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const legacyUrl = `https://eisenrot.github.io/aniimo-homeland-optimizer/#preset=${legacyPayload}`
  const parsedLegacy = mod.parseSharedPresetInput(legacyUrl)
  if (JSON.stringify(parsedLegacy) !== JSON.stringify(snapshot)) throw new Error('Legacy share-link roundtrip failed')

  globalThis.window = { location: { href: 'https://eisenrot.github.io/aniimo-homeland-optimizer/' } }
  const compactUrl = mod.buildShareUrlFromSnapshot(snapshot)
  const parsedUrl = mod.parseSharedPresetInput(compactUrl)
  if (JSON.stringify(parsedUrl) !== JSON.stringify(snapshot)) throw new Error('Compact share-link roundtrip failed')

  if (code.length > 2000) {
    throw new Error(`Compact share code is ${code.length} characters; expected <= 2000 for a normal Discord message`)
  }

  console.log('preset/share codec OK', {
    legacyUrl: legacyUrl.length,
    compactCode: code.length,
    compactUrl: compactUrl.length,
    reduction: `${Math.round((1 - code.length / legacyUrl.length) * 100)}%`,
  })
} finally {
  if (fs.existsSync(temp)) fs.unlinkSync(temp)
}
