import { useEffect, useMemo, useRef, useState } from 'react'
import { BossCard } from './components/BossCard'
import { ArmoryPicker } from './components/ArmoryPicker'
import { CanvasStage } from './components/CanvasStage'
import type { CollisionResult } from './components/CanvasStage'
import type { BossProfile } from './data/bosses'
import { bosses } from './data/bosses'
import { throwables } from './data/throwables'
import { useSoundBoard } from './hooks/useSoundBoard'
import type { ImpactStrength } from './data/throwables'

type View = 'selection' | 'stage'

function App() {
  const [parodyMode, setParodyMode] = useState(true)
  const [selectedBoss, setSelectedBoss] = useState<BossProfile | null>(null)
  const [view, setView] = useState<View>('selection')
  const [selectedThrowableId, setSelectedThrowableId] = useState(throwables[0].id)
  const [aimAssist, setAimAssist] = useState(true)
  const [reactionLog, setReactionLog] = useState<
    Array<{
      id: string
      bossId: string
      bossName: string
      bossRole: string
      throwableId: string
      throwableName: string
      strength: ImpactStrength
      caption: string
      time: number
    }>
  >([])
  const [activeReaction, setActiveReaction] = useState<{
    id: string
    caption: string
    strength: ImpactStrength
  } | null>(null)
  const reactionTimeoutRef = useRef<number | null>(null)

  const { playDraw, playRelease, playImpact, speakReaction } = useSoundBoard()

  const heroBoss = useMemo(() => selectedBoss ?? bosses[0], [selectedBoss])
  const activeThrowable = useMemo(
    () => throwables.find((item) => item.id === selectedThrowableId) ?? throwables[0],
    [selectedThrowableId],
  )

  const handleImpact = (impact: CollisionResult) => {
    const utterances = REACTION_CAPTIONS[impact.strength]
    const caption = pickRandom(utterances)
    void playImpact(impact.throwableId, impact.strength)
    speakReaction(caption, impact.throwableId)
    setActiveReaction({
      id: `${impact.throwableId}-${impact.timestamp}`,
      caption,
      strength: impact.strength,
    })
    if (reactionTimeoutRef.current !== null) {
      window.clearTimeout(reactionTimeoutRef.current)
    }
    reactionTimeoutRef.current = window.setTimeout(() => {
      setActiveReaction(null)
      reactionTimeoutRef.current = null
    }, 1800)

    setReactionLog((current) =>
      [
        {
          id: `${impact.throwableId}-${impact.timestamp}`,
          bossId: heroBoss.id,
          bossName: heroBoss.name,
          bossRole: heroBoss.role,
          throwableId: impact.throwableId,
          throwableName: activeThrowable.name,
          strength: impact.strength,
          caption,
          time: impact.timestamp,
        },
        ...current,
      ].slice(0, 5),
    )
  }

  const handleLaunch = ({ strength, throwableId }: { strength: ImpactStrength; throwableId: string }) => {
    const mappedStrength = WHOOSH_LOOKUP[throwableId] ?? strength
    void playRelease(throwableId, mappedStrength)
  }

  const handleDrawStart = () => {
    void playDraw()
  }

  const handleStart = () => {
    if (!selectedBoss) return
    setReactionLog([])
    setActiveReaction(null)
    if (reactionTimeoutRef.current !== null) {
      window.clearTimeout(reactionTimeoutRef.current)
      reactionTimeoutRef.current = null
    }
    setView('stage')
  }

  const handleReset = () => {
    setReactionLog([])
    setActiveReaction(null)
    if (reactionTimeoutRef.current !== null) {
      window.clearTimeout(reactionTimeoutRef.current)
      reactionTimeoutRef.current = null
    }
    setView('selection')
  }

  useEffect(() => {
    return () => {
      if (reactionTimeoutRef.current !== null) {
        window.clearTimeout(reactionTimeoutRef.current)
      }
    }
  }, [])

  if (view === 'stage' && heroBoss && activeThrowable) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-12 text-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 lg:grid lg:grid-cols-[2fr_1fr]">
          <main className="flex flex-col gap-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-ink-950/30 lg:p-10">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-ink-300/70">Stage Loaded</p>
                <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{heroBoss.name}</h1>
                <p className="text-sm text-slate-300">{heroBoss.role}</p>
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  Drag from the sling zone and release to hurl your equipped item. Hits appear in the console feed instantly.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setAimAssist((value) => !value)}
                  aria-pressed={aimAssist}
                  className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-400 ${
                    aimAssist
                      ? 'border-ink-400 bg-ink-500/20 text-white'
                      : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-ink-300/80 hover:text-white'
                  }`}
                >
                  <span className={`h-5 w-5 rounded-full transition ${aimAssist ? 'bg-ink-300' : 'bg-slate-700'}`} />
                  <span>{aimAssist ? 'Aim assist on' : 'Aim assist off'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center justify-center rounded-full border border-slate-700 px-6 py-2 text-sm font-medium text-slate-300 transition hover:border-ink-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-400"
                >
                  Switch Boss
                </button>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 p-4 sm:p-6">
              <CanvasStage
                boss={heroBoss}
                throwable={activeThrowable}
                parodyMode={parodyMode}
                aimAssist={aimAssist}
                onHit={handleImpact}
                onLaunch={handleLaunch}
                onDrawStart={handleDrawStart}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
                <div className="rounded-full bg-slate-900/70 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-200 shadow-lg shadow-slate-900/30">
                  Sling Zone
                </div>
                <div className="self-end rounded-2xl bg-slate-900/70 px-4 py-3 text-[11px] leading-5 text-ink-100 shadow-lg shadow-slate-900/30">
                  {aimAssist
                    ? 'Aim assist on — release to auto-stabilise the arc.'
                    : 'Aim assist off — every throw follows raw input.'}
                </div>
              </div>
              {activeReaction && (
                <div className="pointer-events-none absolute right-6 top-6 flex max-w-xs translate-y-0 animate-reaction-pop flex-col items-end gap-2">
                  <div className="rounded-3xl border border-white/40 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-900 shadow-2xl shadow-slate-900/40">
                    “{activeReaction.caption}”
                  </div>
                  <div className="mr-9 h-4 w-5 -scale-y-100 rounded-tl-full border-l-2 border-t-2 border-white/50 bg-white/80" />
                </div>
              )}
            </div>

            <div className="grid gap-4 text-sm text-slate-300 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink-300/70">Target</p>
                <p className="mt-2 text-lg font-semibold text-white">{heroBoss.name}</p>
                <p className="text-xs text-slate-400">{heroBoss.role}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink-300/70">Equipped</p>
                <p className="mt-2 text-lg font-semibold text-white">{activeThrowable.name}</p>
                <p className="text-xs text-slate-400">{activeThrowable.description}</p>
                <p className="mt-3 text-[11px] uppercase tracking-[0.25em] text-ink-200">
                  {activeThrowable.arc === 'low'
                    ? 'Arc: Line drive'
                    : activeThrowable.arc === 'medium'
                      ? 'Arc: Balanced'
                      : 'Arc: Soaring'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink-300/70">Session</p>
                <p className="mt-2 text-lg font-semibold text-white">{reactionLog.length} hits logged</p>
                <p className="text-xs text-slate-400">
                  {reactionLog.length
                    ? 'Latest entry mirrors into the console automatically.'
                    : 'Land a hit to trigger the first reaction entry.'}
                </p>
              </div>
            </div>

            <section>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Armory</p>
              <p className="mt-2 text-sm text-slate-300">
                Queue a throwable before you pull back the sling. Keyboard hot-swaps arrive with the next iteration.
              </p>
            </section>

            <ArmoryPicker items={throwables} selectedId={selectedThrowableId} onSelect={setSelectedThrowableId} />
          </main>

          <aside className="flex flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-ink-900/10">
            <div>
              <h2 className="text-2xl font-semibold text-white">Stage Console</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Physics loop is live. Upcoming sprint: reaction sprites, wholesome mode effects, and capture controls.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 font-mono text-sm text-ink-200">
              <p>// Ready to launch</p>
              <p>{`boss = ${heroBoss.id}`}</p>
              <p>{`parodyMode = ${parodyMode}`}</p>
              <p>{`equippedItem = ${activeThrowable.id}`}</p>
              <p>{`assistEnabled = ${aimAssist}`}</p>
              <p>{`recentHits = ${reactionLog.length}`}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-300">
              <p className="font-semibold text-white">Latest reactions</p>
              <ul className="mt-3 space-y-3 text-xs text-slate-400">
                {reactionLog.length ? (
                  reactionLog.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-xl border border-slate-800/80 bg-slate-900/80 p-3 shadow-inner shadow-slate-950/40"
                    >
                      <p className="text-slate-300">
                        <span className="font-semibold text-white">{entry.throwableName}</span> tagged{' '}
                        <span className="font-semibold text-white">{entry.bossName}</span>
                      </p>
                      <p className="mt-1 text-[11px] text-ink-200">“{entry.caption}”</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-ink-300/70">{`Impact: ${entry.strength}`}</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {new Date(entry.time).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </p>
                    </li>
                  ))
                ) : (
                  <li className="rounded-xl border border-dashed border-slate-700 p-3 text-slate-500">
                    No hits yet — arc something at the target.
                  </li>
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-300">
              <p className="font-semibold text-white">Next tasks</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-slate-400">
                <li>Animate boss reactions and throwable impacts.</li>
                <li>Layer wholesome mode + reduced motion toggles.</li>
                <li>Wire canvas snapshot / GIF capture workflow.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-ink-300/70">
            Throw Shoes at Boss
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Pick your boss and smash the start button
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Curate real photos or switch to parody avatars before your event. Nothing is stored; selection
            happens entirely on the client.
          </p>
        </header>

        <section className="mt-10 flex flex-col gap-8 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Boss Roster</h2>
              <p className="text-sm text-slate-400">
                Select one avatar to queue the stage. Add or replace bosses by editing `src/data/bosses.ts`.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setParodyMode((mode) => !mode)}
              aria-pressed={parodyMode}
              className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-400 ${
                parodyMode
                  ? 'border-ink-400 bg-ink-500/20 text-white'
                  : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-ink-300/80 hover:text-white'
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full transition ${parodyMode ? 'bg-ink-300' : 'bg-slate-700'}`}
              />
              <span>Parody mode</span>
            </button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {bosses.map((boss) => (
              <BossCard
                key={boss.id}
                boss={boss}
                parodyMode={parodyMode}
                selected={boss.id === selectedBoss?.id}
                onSelect={setSelectedBoss}
              />
            ))}
          </div>

          <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="text-lg font-semibold text-white">Smash Now</p>
              <p className="text-sm text-slate-400">
                {selectedBoss
                  ? `Ready to queue ${selectedBoss.name} on the stage.`
                  : 'Select a boss to unlock the stage.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStart}
              disabled={!selectedBoss}
              className="inline-flex items-center rounded-full bg-ink-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-ink-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {selectedBoss ? 'Launch Stage' : 'Choose a Boss'}
            </button>
          </div>
        </section>

        <footer className="mt-10 text-center text-xs text-slate-500">
          <p>For entertainment purposes only — flip to wholesome mode when reactions ship.</p>
        </footer>
      </div>
    </div>
  )
}

export default App

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}
const REACTION_CAPTIONS: Record<ImpactStrength, string[]> = {
  light: [
    'Did you cite that slide deck?',
    'My Gantt chart!',
    'Not the partner badge!',
    'Who lobbed that pre-read?',
  ],
  medium: [
    'Ouch! That was not in the scope!',
    'My case pyramid is collapsing!',
    'This will derail the client workshop!',
    'I said bring insights, not projectiles!',
  ],
  heavy: [
    'Call the steering committee!',
    'That’s coming out of the transformation budget!',
    'My MECE principles!',
    'I’m escalating this to global leadership!',
  ],
}

const WHOOSH_LOOKUP: Record<string, ImpactStrength> = {
  shoe: 'medium',
  bottle: 'heavy',
  stone: 'heavy',
  laptop: 'heavy',
  chicken: 'light',
  paperplane: 'light',
}
