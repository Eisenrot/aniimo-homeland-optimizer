const AXES = [
  ['I', 'E'],
  ['N', 'S'],
  ['F', 'T'],
  ['P', 'J'],
] as const

const BLUE = new Set(['E', 'S', 'T', 'J'])

type DisplayPart = {
  char: string
  status: string
  facilities?: string[]
}

type Props = {
  profile?: string | null
  display?: DisplayPart[] | null
  compact?: boolean
}

export default function PersonalityCode({ profile, display, compact = false }: Props) {
  const letters = String(profile || '').toUpperCase()
  const fallback = AXES.map((pair) => ({
    char: pair.find((letter) => letters.includes(letter)) || '-',
    status: letters ? 'nice' : 'none',
    facilities: [],
  }))
  const ordered = AXES.map((_, index) => {
    const part = display?.[index] || fallback[index]
    const meaningful = part.status !== 'none' && part.char && part.char !== 'o'
    return {
      ...part,
      char: meaningful ? String(part.char).toUpperCase() : '-',
      meaningful,
    }
  })

  const aria = ordered
    .map((part) => part.meaningful ? part.char : '-')
    .join('')

  return (
    <span
      className={compact ? 'personality-code compact' : 'personality-code'}
      aria-label={`Relevant personality: ${aria}`}
    >
      {ordered.map((part, index) => (
        <span
          key={`${part.char}:${index}`}
          title={part.facilities?.length ? part.facilities.join(' · ') : 'No personality requirement'}
          className={
            !part.meaningful
              ? 'personality-letter unused'
              : BLUE.has(part.char)
                ? 'personality-letter blue'
                : 'personality-letter pink'
          }
        >
          {part.char}
        </span>
      ))}
    </span>
  )
}
