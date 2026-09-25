import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react'
import AbilityPill from '../components/AbilityPill'
import AniimoAvatar from '../components/AniimoAvatar'
import PersonalityCode from '../components/PersonalityCode'
import { teamClient } from '../engine/teamClient'
import { DATA } from '../state'
import { fmt } from '../lib/presentation'
import { stableStringify } from '../../src/plan-cache.js'
import type { OptimizerPlan, OptimizerState, TeamAnalysisResult } from '../types'

const TEAM_CACHE_STORE = 'aniimoModernTeamCacheV1'
const TEAM_CACHE_VERSION = 1

function teamSignature(state: OptimizerState, plan: OptimizerPlan) {
  const { optimizerStats: _stats, ...stablePlan } = plan
  return stableStringify({ version: TEAM_CACHE_VERSION, state, plan: stablePlan })
}

function readTeamCache(state: OptimizerState, plan: OptimizerPlan) {
  try {
    const entry = JSON.parse(localStorage.getItem(TEAM_CACHE_STORE) || 'null')
    if (entry?.version !== TEAM_CACHE_VERSION || entry.signature !== teamSignature(state, plan)) return null
    return entry.result as TeamAnalysisResult
  } catch {
    return null
  }
}

function writeTeamCache(state: OptimizerState, plan: OptimizerPlan, result: TeamAnalysisResult) {
  try {
    localStorage.setItem(TEAM_CACHE_STORE, JSON.stringify({
      version: TEAM_CACHE_VERSION,
      signature: teamSignature(state, plan),
      result,
    }))
  } catch {}
}

type Props = {
  state: OptimizerState
  plan: OptimizerPlan | null
  planRunning: boolean
}

export default function TeamPage({ state, plan, planRunning }: Props) {
  const [analysis, setAnalysis] = useState<TeamAnalysisResult | null>(null)
  const [detail, setDetail] = useState('Waiting for the production plan')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)

  const run = async (force = false) => {
    if (!plan || planRunning) return
    if (!force) {
      const cached = readTeamCache(state, plan)
      if (cached) {
        setAnalysis(cached)
        setSelected(0)
        setDetail('Exact roster and plan restored from cache')
        setError(null)
        return
      }
    }
    setRunning(true)
    setError(null)
    setDetail('Preparing real-team search')
    try {
      const result = await teamClient.analyze(state, plan, setDetail)
      setAnalysis(result)
      setSelected(0)
      writeTeamCache(state, plan, result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    if (!plan || planRunning) return
    void run(false)
    return () => teamClient.cancel()
  }, [plan, planRunning])

  const candidate = analysis?.candidates[selected] || analysis?.candidates[0]
  const personality = selected === 0 ? analysis?.personality : null
  const enabled = useMemo(() => DATA.pals.filter((pal) => state.owned[String(pal.id)]?.enabled).length, [state])

  return (
    <div className="team-page">
      <section className="team-hero surface-card">
        <div>
          <span className="surface-eyebrow">Real-team search</span>
          <h2>{running ? detail : candidate ? `Candidate #${candidate.rank}` : 'No team result yet'}</h2>
          <p>{error || (planRunning ? 'The production plan is still changing. Team search starts as soon as it settles.' : candidate ? `${candidate.team.length} Aniimo · ${enabled} enabled roster entries considered` : 'The theoretical production plan is converted into actual owned workers here.')}</p>
        </div>
        <button className="ui-button secondary" type="button" onClick={() => void run(true)} disabled={!plan || running || planRunning}>
          <RefreshCw aria-hidden="true" /> Analyze again
        </button>
      </section>

      {candidate && (
        <>
          <section className="team-summary-grid">
            <div className="metric-tile emphasis"><span>Real-team Coin / h</span><strong>{fmt(candidate.rate)}</strong><small>{plan ? `${fmt(candidate.rate / Math.max(1, plan.ratePerHour) * 100, 1)}% of theoretical` : ''}</small></div>
            <div className="metric-tile"><span>Objective</span><strong>{fmt(candidate.objectiveRate, 3)}</strong><small>Concrete team result</small></div>
            <div className="metric-tile"><span>Essential core</span><strong>{analysis?.core.length || 0}</strong><small>{analysis?.reserves.length || 0} reserve Aniimo</small></div>
            <div className="metric-tile"><span>Personality pass</span><strong>{personality ? fmt(personality.rate) : '—'}</strong><small>{personality ? 'Best team with legal roles' : 'Top candidate only'}</small></div>
          </section>

          <section className="surface-card">
            <div className="surface-header">
              <div><span className="surface-eyebrow">Recommended workers</span><h3>The actual Aniimo assigned to this candidate.</h3></div>
              <UsersRound aria-hidden="true" className="surface-icon" />
            </div>
            <div className="team-member-grid">
              {candidate.team.map((member, index) => {
                const hint = personality?.hints[index]
                return (
                  <article className="team-member-card" key={`${member.id}:${member.copy}:${index}`}>
                    <AniimoAvatar pal={member} />
                    <div className="team-member-main">
                      <span><b>{member.name}</b><small>{member.form || 'Base'} · copy {member.copy}</small></span>
                      <div className="ability-chip-row">
                        {Object.entries(member.abilities).map(([ability, level]) => <AbilityPill key={ability} ability={ability} level={level} compact />)}
                      </div>
                    </div>
                    {hint && <div className="personality-profile"><span><small>Personality</small><PersonalityCode profile={hint.profile} /></span></div>}
                  </article>
                )
              })}
            </div>
          </section>

          <div className="team-lower-grid">
            <section className="surface-card">
              <div className="surface-header"><div><span className="surface-eyebrow">Alternative candidates</span><h3>Close options without re-running the search.</h3></div></div>
              <div className="candidate-list">
                {analysis?.candidates.map((item, index) => (
                  <button type="button" className={selected === index ? 'candidate-row selected' : 'candidate-row'} key={item.rank} onClick={() => setSelected(index)}>
                    <span className="candidate-rank">#{item.rank}</span>
                    <span className="candidate-faces">{item.team.slice(0, 5).map((member, i) => <AniimoAvatar key={`${member.id}:${i}`} pal={member} />)}</span>
                    <span><small>Coin / h</small><b>{fmt(item.rate)}</b></span>
                    <span><small>Objective</small><b>{fmt(item.objectiveRate, 2)}</b></span>
                  </button>
                ))}
              </div>
            </section>

            <section className="surface-card">
              <div className="surface-header"><div><span className="surface-eyebrow">Coverage</span><h3>Ability and anti-stall health.</h3></div><ShieldCheck aria-hidden="true" className="surface-icon" /></div>
              <div className="coverage-list">
                {analysis?.requiredAbilities.map((item) => (
                  <div key={item.ability}><CheckCircle2 aria-hidden="true" /><span><AbilityPill ability={item.ability} level={item.level} compact /><small>{item.count} worker-equivalent · {item.jobs.join(' · ')}</small></span></div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {!candidate && !running && (
        <section className="empty-state surface-card">
          <UsersRound aria-hidden="true" />
          <h3>{error ? 'Real-team search failed' : 'No candidate yet'}</h3>
          <p>{error || 'Once the production plan is available, this page searches the enabled roster automatically.'}</p>
        </section>
      )}
    </div>
  )
}
