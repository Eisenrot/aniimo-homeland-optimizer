import type { CSSProperties } from 'react'
import { abilityIcon } from '../lib/presentation'
import { DATA } from '../state'

type Props = {
  ability: string
  level: number
  compact?: boolean
}

export default function AbilityPill({ ability, level, compact = false }: Props) {
  const color = DATA.abilities?.[ability]?.color || '#7f8994'
  return (
    <span
      className={compact ? 'ability-pill compact' : 'ability-pill'}
      style={{ '--ability': color } as CSSProperties}
    >
      <img src={abilityIcon(ability)} alt="" />
      <span>{ability}</span>
      <b>Lv.{level}</b>
    </span>
  )
}
