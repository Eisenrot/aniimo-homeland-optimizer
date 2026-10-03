import { useMemo } from 'react'
import { CheckCircle2, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react'
import AbilityPill from '../components/AbilityPill'
import AniimoAvatar from '../components/AniimoAvatar'
import PersonalityCode from '../components/PersonalityCode'
import { assetUrl } from '../lib/presentation'
import { DATA } from '../state'
import type { OptimizerState, TeamAnalysisResult } from '../types'

type Props = {
  state: OptimizerState
  analysis: TeamAnalysisResult | null
  running: boolean
  detail: string
  error: string | null
  onAnalyze: () => void
}

export default function TeamPage({
  state,
  analysis,
  running,
  detail,
  error,
  onAnalyze,
}: Props) {
  const best = analysis?.best || null
  const personality = analysis?.personality
  const enabledCopies = useMemo(
    () => DATA.pals.reduce((sum, pal) => {
      const owned = state.owned[String(pal.id)]
      return owned?.enabled ? sum + Math.max(0, Math.floor(Number(owned.count || 0))) : sum
    }, 0),
    [state],
  )

  if (!best && !running) {
    return (
      <div className="team-theatre empty">
        <section className="team-empty-stage">
          <span>TEAM / BEST CHOICE</span>
          <UsersRound aria-hidden="true" />
          <h1>{error ? 'Roster blocked.' : 'The stage is empty.'}</h1>
          <p>{error || 'The enabled roster is solved into the strongest working team automatically.'}</p>
          <button className="ui-button secondary" type="button" onClick={onAnalyze}>
            <RefreshCw aria-hidden="true" /> Analyze
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="team-theatre">
      <section className="team-main-stage">
        <header className="team-stage-title">
          <div>
            <span>TEAM / BEST CHOICE</span>
            <h1>{running ? detail : best ? 'The working cast.' : 'Casting…'}</h1>
            <p>{error || (best
              ? `${best.team.length} workers selected from ${enabledCopies} enabled owned copies.`
              : detail)}</p>
          </div>
          <button className="ui-button secondary" type="button" onClick={onAnalyze} disabled={running}>
            <RefreshCw aria-hidden="true" /> Analyze again
          </button>
        </header>

        {best && (
          <>
            <div className="team-lineup" aria-label="Recommended workers">
              {best.team.map((member, index) => {
                const hint = personality?.hints[index]
                const facilityAssignments = (analysis?.assignments?.[index] || []).slice(0, 4)
                const allFacilityNames = (analysis?.assignments?.[index] || [])
                  .map((assignment) => DATA.facilities.find((facility) => facility.slug === assignment.facility)?.name || assignment.facility)
                  .join(' · ')
                return (
                  <article className="team-cast-card" key={`${member.id}:${member.copy}:${index}`}>
                    <span className="team-cast-number">{String(index + 1).padStart(2, '0')}</span>
                    <div className="team-cast-personality">
                      <PersonalityCode
                        profile={hint?.profile}
                        display={hint?.display}
                        compact
                      />
                    </div>
                    <div className="team-cast-portrait" title={allFacilityNames || undefined}>
                      <AniimoAvatar pal={member} />
                    </div>
                    <div className="team-cast-copy">
                      <b>{member.name}</b>
                      <small>{member.form || 'Base'} · copy {member.copy}</small>
                      {!!facilityAssignments.length && (
                        <div className="team-facility-badges" aria-label="Assigned facilities">
                          {facilityAssignments.map((assignment) => {
                            const facility = DATA.facilities.find((item) => item.slug === assignment.facility)
                            const icon = assetUrl(facility?.plotGlyph || facility?.icon)
                            return (
                              <span
                                className={`team-facility-badge mode-${assignment.mode}`}
                                key={assignment.facility}
                                title={`${facility?.name || assignment.facility} · ${assignment.mode}`}
                              >
                                {icon ? <img src={icon} alt="" /> : <b>{(facility?.name || assignment.facility).slice(0, 1)}</b>}
                              </span>
                            )
                          })}
                        </div>
                      )}
                      <div className="ability-chip-row">
                        {Object.entries(member.abilities).map(([ability, level]) => (
                          <AbilityPill key={ability} ability={ability} level={level} compact />
                        ))}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </section>

      <aside className="team-margin">
        <div className="team-margin-heading">
          <ShieldCheck aria-hidden="true" />
          <span>ABILITY COVERAGE</span>
        </div>
        <div className="coverage-list">
          {analysis?.requiredAbilities.map((item) => (
            <div key={`${item.ability}:${item.level}`}>
              <CheckCircle2 aria-hidden="true" />
              <span>
                <AbilityPill ability={item.ability} level={item.level} compact />
                <small>{item.count} worker-equivalent</small>
                <em>{item.jobs.join(' · ')}</em>
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
