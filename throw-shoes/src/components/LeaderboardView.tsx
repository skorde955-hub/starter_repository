import { useMemo } from 'react'
import type { Boss } from '../models/Boss'

interface LeaderboardViewProps {
  bosses: Boss[]
  onBack: () => void
  onQueueBoss: (boss: Boss) => void
}

interface LeaderboardEntry {
  boss: Boss
  hits: number
  heat: number
  ageHours: number
}

export function LeaderboardView({ bosses, onBack, onQueueBoss }: LeaderboardViewProps) {
  const entries = useMemo<LeaderboardEntry[]>(() => {
    return bosses
      .map((boss) => {
        const hits = boss.metrics?.totalHits ?? 0
        const createdAt = boss.createdAt ? Date.parse(boss.createdAt) : null
        const ageMs = createdAt ? Math.max(1, Date.now() - createdAt) : 1000 * 60 * 60 * 48
        const ageHours = ageMs / (1000 * 60 * 60)
        const heat = hits / ageHours
        return { boss, hits, heat, ageHours }
      })
      .sort((a, b) => b.hits - a.hits)
  }, [bosses])

  const totalHits = entries.reduce((sum, entry) => sum + entry.hits, 0)
  const viralScore =
    entries.length === 0
      ? 0
      : Math.min(
          100,
          Math.round(
            entries.reduce((score, entry, index) => score + entry.hits * (index + 1), 0) %
              123,
          ) + 12,
        )

  const topPerformer = entries[0]?.boss
  const risingStar = entries.reduce<LeaderboardEntry | null>((best, entry) => {
    if (!best) return entry
    return entry.heat > best.heat ? entry : best
  }, null)
  const sleeperPick = entries[entries.length - 1]
  const tickerItems = entries.length
    ? entries.map(
        (entry, index) => `${index + 1}. ${entry.boss.name} · ${entry.hits.toLocaleString()} hits`,
      )
    : ['No throws recorded yet — sling a boss to light up the board.']
  const maxHits = Math.max(1, ...entries.map((entry) => entry.hits))

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.5em] text-ink-300/70">
              Viral Leaderboard
            </p>
            <h1 className="mt-2 text-4xl font-semibold text-white heading-fun sm:text-5xl">
              Most Slapped Bosses
            </h1>
            <p className="mt-3 max-w-2xl text-base text-slate-300 font-bubble">
              Every hit updates in real time. Double tap a name below to sling them instantly and
              climb the meme charts.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center rounded-full border border-slate-700 px-5 py-2.5 text-sm font-medium font-bubble text-slate-200 transition hover:border-ink-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300"
            >
              ← Back to Roster
            </button>
          </div>
        </header>

        <div className="rounded-3xl border border-ink-500/30 bg-slate-900/70 p-6 shadow-[0_20px_80px_rgba(15,20,40,0.45)]">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 rounded-2xl bg-gradient-to-br from-rose-500/30 via-rose-500/10 to-transparent p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-rose-200/80">
                Viral Heat Index
              </p>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-6xl font-bold text-white heading-fun">{viralScore}</span>
                <span className="pb-2 text-sm uppercase tracking-[0.3em] text-rose-100/70">
                  /100
                </span>
              </div>
              <p className="mt-3 text-base text-rose-50/80 font-bubble">
                Crowd volume is {viralScore > 70 ? 'peaking' : viralScore > 40 ? 'rising' : 'primed'}
                . Share the stream, light up the boss board, make HR nervous.
              </p>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-rose-100/30">
                <div
                  className="h-full bg-gradient-to-r from-rose-400 via-rose-300 to-amber-200 shadow-[0_0_15px_rgba(244,114,182,0.6)]"
                  style={{ width: `${Math.max(18, viralScore)}%` }}
                />
              </div>
            </div>
            <div className="flex-1 space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
              <LeaderboardHighlight
                label="Most Dunked"
                boss={topPerformer}
                hits={entries[0]?.hits ?? 0}
                tagline="Trending on /r/catharsis"
              />
              <LeaderboardHighlight
                label="Rising Meme"
                boss={risingStar?.boss}
                hits={risingStar ? Math.round(risingStar.heat * 12) : 0}
                tagline="Hit velocity past hour"
              />
              <LeaderboardHighlight
                label="Needs Backup"
                boss={sleeperPick?.boss}
                hits={sleeperPick?.hits ?? 0}
                tagline="Give them a sympathy slap"
              />
            </div>
            <div className="flex-1 rounded-2xl border border-emerald-400/30 bg-emerald-900/10 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-200/80">
                Total Hits Logged
              </p>
              <p className="mt-2 text-5xl font-bold text-emerald-50 heading-fun">
                {totalHits.toLocaleString()}
              </p>
              <p className="mt-3 text-base text-emerald-50/80 font-bubble">
                across {bosses.length}{' '}
                {bosses.length === 1 ? 'boss profile' : 'boss profiles'} in circulation.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {entries.slice(0, 4).map((entry) => (
                  <span
                    key={entry.boss.id}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-50"
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-300" />
                    {entry.boss.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/60">
            <div className="ticker-strip flex gap-8 whitespace-nowrap px-6 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-ink-200/80">
              {[...tickerItems, ...tickerItems].map((item, index) => (
                <span key={`${item}-${index}`}>{item}</span>
              ))}
            </div>
          </div>
        </div>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-ink-200/70">Most Hit</p>
                <h2 className="mt-2 text-2xl font-semibold text-white heading-fun">
                  Viral Clip Reels
                </h2>
              </div>
              <span className="text-sm text-slate-400 font-bubble">
                Updated {new Date().toLocaleTimeString()}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {entries.slice(0, 5).map((entry, index) => (
                <button
                  key={entry.boss.id}
                  type="button"
                  onClick={() => onQueueBoss(entry.boss)}
                  className="group flex w-full items-center justify-between rounded-2xl border border-slate-800/70 bg-slate-950/40 px-4 py-3 text-left transition hover:border-ink-400/60 hover:bg-slate-900/80"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-bold text-ink-200/90">#{index + 1}</span>
                    <div>
                      <p className="text-base font-semibold text-white">{entry.boss.name}</p>
                      <p className="text-sm text-slate-400">{entry.boss.role}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-ink-100">
                      {entry.hits.toLocaleString()}
                    </p>
                    <p className="text-xs uppercase tracking-[0.3em] text-ink-200/70">
                      tap to sling
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-ink-400/40 bg-ink-950/20 p-6 shadow-lg shadow-ink-900/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-ink-200/70">Shareable Flex</p>
                <h2 className="mt-2 text-2xl font-semibold text-white heading-fun">
                  Hype Ideas
                </h2>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <LeaderboardIdea
                title="Clip Bomb"
                body="Screen-record the wildest throw and tag #ThrowShoesChallenge."
              />
              <LeaderboardIdea
                title="Office Poll"
                body="Let the team vote on who gets slinged next. Democracy hurts."
              />
              <LeaderboardIdea
                title="Remix Mode"
                body="Pair the stage with hype music, upload to Shorts, farm the lulz."
              />
              <LeaderboardIdea
                title="Callout Card"
                body="Print the leaderboard and tape it to the coffee machine — instant buzz."
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-inner shadow-slate-950/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-ink-200/70">Full Roster</p>
              <h2 className="mt-1 text-2xl font-semibold text-white heading-fun">
                Every boss in circulation
              </h2>
            </div>
            <p className="text-sm text-slate-400 font-bubble">
              Double click a row to sling instantly
            </p>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800/60">
            <table className="min-w-full divide-y divide-slate-800/80 text-left text-sm font-bubble">
              <thead className="bg-slate-950/70 text-xs uppercase tracking-[0.3em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Boss</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Total Hits</th>
                  <th className="px-4 py-3">Heat</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/30">
                {entries.map((entry) => (
                  <tr
                    key={entry.boss.id}
                    className="transition hover:bg-slate-900/70"
                    onDoubleClick={() => onQueueBoss(entry.boss)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                          <img
                            src={entry.boss.image}
                            alt={`${entry.boss.name} avatar`}
                            className="h-full w-full object-cover"
                          />
                        </span>
                        <div>
                          <p className="text-base font-semibold text-white">{entry.boss.name}</p>
                          <p className="text-xs uppercase tracking-[0.4em] text-ink-200/70">
                            #{entry.boss.id.slice(0, 4).toUpperCase()}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{entry.boss.role}</td>
                    <td className="px-4 py-3 text-lg font-semibold text-ink-100">
                      {entry.hits.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-ink-400 via-rose-400 to-amber-300"
                            style={{
                              width: `${Math.max(3, (entry.hits / maxHits) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs uppercase tracking-[0.4em] text-ink-200/70">
                          {Math.round(entry.heat * 10)} ⚡
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onQueueBoss(entry.boss)}
                        className="inline-flex items-center rounded-full border border-ink-400/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-ink-100 transition hover:bg-ink-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300"
                      >
                        Sling
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

function LeaderboardHighlight({
  label,
  boss,
  hits,
  tagline,
}: {
  label: string
  boss?: Boss
  hits: number
  tagline: string
}) {
  if (!boss) {
    return (
      <div className="rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-slate-400">
        Waiting for more throws…
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-ink-200/70">{label}</p>
        <p className="mt-1 text-xl font-semibold text-white heading-fun">{boss.name}</p>
        <p className="text-sm text-slate-400">{tagline}</p>
      </div>
      <div className="text-right">
        <p className="text-3xl font-bold text-ink-100">{hits.toLocaleString()}</p>
        <p className="text-xs uppercase tracking-[0.3em] text-ink-200/70">hit score</p>
      </div>
    </div>
  )
}

function LeaderboardIdea({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-200/80">{title}</p>
      <p className="mt-2 text-base text-slate-200">{body}</p>
    </div>
  )
}
