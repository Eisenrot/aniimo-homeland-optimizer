const AXES = [
  ['I', 'E'],
  ['N', 'S'],
  ['F', 'T'],
  ['P', 'J'],
] as const

const BLUE = new Set(['E', 'S', 'T', 'J'])

type Props = {
  profile?: string | null
  compact?: boolean
}

export default function PersonalityCode({ profile, compact = false }: Props) {
  const letters = String(profile || '').toUpperCase()
  const ordered = AXES.map((pair) => pair.find((letter) => letters.includes(letter)) || '?')

  return (
    <span className={compact ? 'personality-code compact' : 'personality-code'} aria-label={profile || 'Unknown personality'}>
      {ordered.map((letter, index) => (
        <span
          key={`${letter}:${index}`}
          className={BLUE.has(letter) ? 'personality-letter blue' : letter === '?' ? 'personality-letter unknown' : 'personality-letter pink'}
        >
          {letter}
        </span>
      ))}
    </span>
  )
}
