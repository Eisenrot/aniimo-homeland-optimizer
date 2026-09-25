import { useMemo, useState } from 'react'
import type { Pal } from '../types'

type Props = {
  pal: Pick<Pal, 'id' | 'name' | 'speciesName' | 'isForm'>
  className?: string
}

function keys(pal: Props['pal']) {
  const id = String(pal.id ?? '')
  const form = pal.isForm ? id : id.slice(0, -2)
  const base = id.slice(0, -2)
  return [...new Set([form, base].filter(Boolean))]
}

export default function AniimoAvatar({ pal, className }: Props) {
  const [attempt, setAttempt] = useState(0)
  const urls = useMemo(() => {
    const out: string[] = []
    for (const key of keys(pal)) {
      out.push(`https://aniidex.com/images/aniimo/UI_PetHead_${key}.webp`)
      out.push(`https://aniidex.com/_ipx/q_95&fit_inside&s_120x120/images/aniimo/UI_PetHead_${key}.webp`)
    }
    return out
  }, [pal.id, pal.isForm])

  const label = pal.speciesName || pal.name || 'Aniimo'
  const url = urls[attempt]

  if (!url) {
    return <span className={className ? `aniimo-avatar-fallback ${className}` : 'aniimo-avatar-fallback'}>{label.slice(0, 1)}</span>
  }

  return (
    <img
      className={className}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setAttempt((current) => current + 1)}
    />
  )
}
