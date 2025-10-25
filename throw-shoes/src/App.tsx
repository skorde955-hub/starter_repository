import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { BossCard } from './components/BossCard'
import { ArmoryPicker } from './components/ArmoryPicker'
import { CanvasStage } from './components/CanvasStage'
import type { CollisionResult } from './components/CanvasStage'
import { throwables } from './data/throwables'
import { useSoundBoard } from './hooks/useSoundBoard'
import type { ImpactStrength } from './data/throwables'
import { AddBossForm } from './components/AddBossForm'
import { useBosses } from './state/BossContext'
import type { Boss } from './models/Boss'

type View = 'selection' | 'stage' | 'add'
type CrowdMood = 'calm' | 'amped' | 'eruption'

function App() {
  const { bosses, loading: bossesLoading, error: bossesError, recordHit, refresh } = useBosses()
  const [parodyMode, setParodyMode] = useState(false)
  const [selectedBossId, setSelectedBossId] = useState<string | null>(null)
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
      combo: number
      time: number
    }>
  >([])
  const comboTimeoutRef = useRef<number | null>(null)
  const lastHitRef = useRef<number>(0)
  const [satisfaction, setSatisfaction] = useState(42)
  const [comboCount, setComboCount] = useState(0)
  const [celebrationActive, setCelebrationActive] = useState(false)

  const { playDraw, playRelease, playImpact, playCelebration } = useSoundBoard()

  useEffect(() => {
    if (!bossesLoading && bosses.length && !selectedBossId) {
      setSelectedBossId(bosses[0].id)
    }
  }, [bossesLoading, bosses, selectedBossId])

  const selectedBoss: Boss | null = useMemo(() => {
    return bosses.find((boss) => boss.id === selectedBossId) ?? null
  }, [bosses, selectedBossId])

  const heroBoss: Boss | null = useMemo(() => {
    if (selectedBoss) return selectedBoss
    if (bosses.length) return bosses[0]
    return null
  }, [selectedBoss, bosses])

  const handleBossCreated = (boss: Boss) => {
    setSelectedBossId(boss.id)
    setView('selection')
  }
  const activeThrowable = useMemo(
    () => throwables.find((item) => item.id === selectedThrowableId) ?? throwables[0],
    [selectedThrowableId],
  )
  const hypeLevel = Math.min(1, Math.max(0, satisfaction / 100))
  const crowdMood: CrowdMood = hypeLevel > 0.78 ? 'eruption' : hypeLevel > 0.45 ? 'amped' : 'calm'
  const crowdMessage = CROWD_MESSAGES[crowdMood]
  const comboLabel = comboCount > 1 ? `Combo x${comboCount}` : 'Combo primed'

  const handleImpact = (impact: CollisionResult) => {
    if (!heroBoss) return
    const utterances = REACTION_CAPTIONS[impact.strength]
    const caption = pickRandom(utterances)
    const now = Date.now()
    const comboWindow = COMBO_WINDOW
    const nextCombo = now - lastHitRef.current <= comboWindow ? comboCount + 1 : 1
    lastHitRef.current = now
    setComboCount(nextCombo)
    if (comboTimeoutRef.current !== null) {
      window.clearTimeout(comboTimeoutRef.current)
    }
    comboTimeoutRef.current = window.setTimeout(() => {
      setComboCount(0)
      comboTimeoutRef.current = null
    }, comboWindow)
    const bonus = nextCombo > 1 ? (nextCombo - 1) * 2.4 : 0
    const gain = SATISFACTION_GAIN[impact.strength] + bonus
    const newSatisfaction = Math.min(100, satisfaction + gain)
    const crossedCelebration = satisfaction < 90 && newSatisfaction >= 90
    setSatisfaction(newSatisfaction)
    void playImpact(impact.throwableId, impact.strength)
    const displayCaption =
      nextCombo > 1 ? `${caption} (Combo x${nextCombo})` : caption
    if (typeof window !== 'undefined' && 'navigator' in window) {
      const nav = window.navigator as Navigator & {
        vibrate?: (pattern: number | number[]) => boolean
      }
      const pattern =
        impact.strength === 'heavy'
          ? [16, 28, 18]
          : impact.strength === 'medium'
            ? [12, 18]
            : [8]
      nav.vibrate?.(pattern)
    }
    if (crossedCelebration) {
      setCelebrationActive(true)
      void playCelebration()
    }
    const reactionId = `${impact.throwableId}-${impact.timestamp}`

    void recordHit(heroBoss.id)

    setReactionLog((current) =>
      [
        {
          id: reactionId,
          bossId: heroBoss.id,
          bossName: heroBoss.name,
          bossRole: heroBoss.role,
          throwableId: impact.throwableId,
          throwableName: activeThrowable.name,
          strength: impact.strength,
          caption: displayCaption,
          combo: nextCombo,
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
    setSatisfaction(52)
    setComboCount(0)
    lastHitRef.current = 0
    if (comboTimeoutRef.current !== null) {
      window.clearTimeout(comboTimeoutRef.current)
      comboTimeoutRef.current = null
    }
    setView('stage')
  }

  const handleReset = () => {
    setReactionLog([])
    setComboCount(0)
    setSatisfaction(42)
    lastHitRef.current = 0
    if (comboTimeoutRef.current !== null) {
      window.clearTimeout(comboTimeoutRef.current)
      comboTimeoutRef.current = null
    }
    setView('selection')
  }

  useEffect(() => {
    return () => {
      if (comboTimeoutRef.current !== null) {
        window.clearTimeout(comboTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!celebrationActive) return undefined
    const timeout = window.setTimeout(() => setCelebrationActive(false), 2200)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [celebrationActive])

  useEffect(() => {
    if (view !== 'stage') return undefined
    const interval = window.setInterval(() => {
      setSatisfaction((value) => (value > 0 ? Math.max(0, value - 0.6) : value))
    }, 1500)
    return () => {
      window.clearInterval(interval)
    }
  }, [view])

  if (bossesLoading) {
    return (
      <StatusScreen
        title="Loading the boss roster"
        message="Give us a second while we gather everyone on stage."
      />
    )
  }

  if (bossesError) {
    return (
      <StatusScreen
        tone="error"
        title="Could not load bosses"
        message={bossesError}
        actionLabel="Retry"
        onAction={() => {
          void refresh()
        }}
      />
    )
  }

  if (!bosses.length && view !== 'add') {
    return (
      <StatusScreen
        title="No bosses yet"
        message="Add the first boss to unlock the sling stage."
        actionLabel="Add Boss"
        onAction={() => setView('add')}
      />
    )
  }

  if (view === 'add') {
    return (
      <AddBossForm
        onCancel={() => setView('selection')}
        onCreated={handleBossCreated}
      />
    )
  }

  if (view === 'stage' && heroBoss && activeThrowable) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100 sm:px-6">
        <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-2 sm:px-4">
          <main className="relative flex flex-col gap-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-ink-950/30 lg:p-12">
            {celebrationActive && <CelebrationOverlay />}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-base uppercase tracking-[0.38em] text-ink-300/70 tagline-fun">Stage Loaded</p>
                <h1 className="mt-3 text-4xl font-semibold text-white heading-fun sm:text-5xl">{heroBoss.name}</h1>
                <p className="mt-2 text-lg text-slate-200 font-bubble">{heroBoss.role}</p>
                <p className="mt-4 text-sm leading-6 text-slate-300 font-bubble">
                  Drag from the sling zone and release to hurl your equipped item. Hits appear in the console feed instantly.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setAimAssist((value) => !value)}
                  aria-pressed={aimAssist}
                  className={`inline-flex items-center gap-3 rounded-full border px-5 py-2.5 text-base font-medium font-bubble transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-400 ${
                    aimAssist
                      ? 'border-ink-400 bg-ink-500/20 text-white'
                      : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-ink-300/80 hover:text-white'
                  }`}
                >
                  <span className={`h-5 w-5 rounded-full transition ${aimAssist ? 'bg-ink-300' : 'bg-slate-700'}`} />
                  <span className="font-display text-base">
                    {aimAssist ? 'Aim assist on' : 'Aim assist off'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center justify-center rounded-full border border-slate-700 px-6 py-2.5 text-base font-medium font-bubble text-slate-200 transition hover:border-ink-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-400"
                >
                  Switch Boss
                </button>
                <button
                  type="button"
                  onClick={() => setView('add')}
                  className="inline-flex items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/20 px-6 py-2.5 text-base font-medium text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-400/30 hover:text-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                >
                  Add Boss
                </button>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-slate-800/70 bg-transparent p-4 sm:p-6">
              <CanvasStage
                boss={heroBoss}
                throwable={activeThrowable}
                parodyMode={parodyMode}
                aimAssist={aimAssist}
                hypeLevel={hypeLevel}
                onHit={handleImpact}
                onLaunch={handleLaunch}
                onDrawStart={handleDrawStart}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
                <div className="rounded-full bg-slate-900/70 px-5 py-1.5 text-sm font-semibold uppercase tracking-[0.32em] text-ink-200 shadow-lg shadow-slate-900/30 tagline-fun">
                  Sling Zone
                </div>
                <div className="self-end rounded-2xl bg-slate-900/70 px-5 py-3 text-sm leading-6 text-ink-100 shadow-lg shadow-slate-900/30 font-bubble">
                  {aimAssist
                    ? 'Aim assist on — release to auto-stabilise the arc.'
                    : 'Aim assist off — every throw follows raw input.'}
                </div>
              </div>
            </div>

            <div className="grid gap-4 text-base text-slate-200 font-bubble sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-300/70 tagline-fun">Target</p>
                <p className="mt-2 text-xl font-semibold text-white heading-fun">{heroBoss.name}</p>
                <p className="text-base text-slate-300 font-bubble">{heroBoss.role}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-300/70 tagline-fun">Equipped</p>
                <p className="mt-2 text-xl font-semibold text-white heading-fun">{activeThrowable.name}</p>
                <p className="text-base text-slate-300 font-bubble">{activeThrowable.description}</p>
                <p className="mt-3 text-sm uppercase tracking-[0.25em] text-ink-200 tagline-fun">
                  {activeThrowable.arc === 'low'
                    ? 'Arc: Line drive'
                    : activeThrowable.arc === 'medium'
                      ? 'Arc: Balanced'
                      : 'Arc: Soaring'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-300/70 tagline-fun">
                  Satisfaction
                </p>
                <p className="mt-2 text-2xl font-semibold text-white heading-fun">
                  {Math.round(satisfaction)}%
                </p>
                <p className="text-base text-slate-300 font-bubble">{crowdMessage}</p>
                <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-800/60">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-fuchsia-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.round(satisfaction))}%` }}
                  />
                </div>
                <p className="mt-4 text-sm uppercase tracking-[0.32em] text-ink-200 tagline-fun">
                  {crowdMood === 'eruption'
                    ? 'Crowd: Eruption'
                    : crowdMood === 'amped'
                      ? 'Crowd: Amped'
                      : 'Crowd: Warming up'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-300/70 tagline-fun">
                  Momentum
                </p>
                <p className="mt-2 text-xl font-semibold text-white heading-fun">{comboLabel}</p>
                <p className="text-base text-slate-300 font-bubble">
                  {comboCount > 1
                    ? 'Crowd is roaring — keep the streak alive.'
                    : 'Chain consecutive hits to unlock bonus hype.'}
                </p>
                <p className="mt-3 text-sm uppercase tracking-[0.25em] text-ink-200 tagline-fun">
                  {reactionLog.length
                    ? `Hits logged: ${reactionLog.length}`
                    : 'No hits recorded yet'}
                </p>
              </div>
            </div>

            <section className="font-bubble">
              <p className="text-base font-semibold uppercase tracking-[0.3em] text-slate-400 tagline-fun">Armory</p>
              <p className="mt-2 text-base text-slate-300">
                Queue a throwable before you pull back the sling. Weight now shapes impact sparks and
                satisfaction gain.
              </p>
            </section>

            <ArmoryPicker items={throwables} selectedId={selectedThrowableId} onSelect={setSelectedThrowableId} />
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <header className="text-center font-bubble">
          <p className="text-base font-semibold uppercase tracking-[0.4em] text-ink-300/70 tagline-fun">
            Throw Shoes at Boss
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white heading-fun sm:text-5xl">
            Load the impact stage and make it personal
          </h1>
          <p className="mt-4 text-lg leading-8 text-slate-300">
            Drop in real portraits or flip to parody mode on demand. Everything runs locally, and the
            satisfaction meter resets the moment the tab closes.
          </p>
        </header>

        <section className="mt-10 flex flex-col gap-8 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 font-bubble sm:p-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white heading-fun">Boss Roster</h2>
              <p className="text-base text-slate-300">
                Select one avatar to queue the stage or add a new leader to the roster for everyone to sling at.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <button
                type="button"
                onClick={() => setView('add')}
                className="inline-flex items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/20 px-6 py-2.5 text-base font-medium text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-400/30 hover:text-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              >
                Add Boss
              </button>
              <button
                type="button"
                onClick={() => setParodyMode((mode) => !mode)}
                aria-pressed={parodyMode}
                className={`inline-flex items-center gap-3 rounded-full border px-5 py-2.5 text-base font-medium font-bubble transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-400 ${
                  parodyMode
                    ? 'border-ink-400 bg-ink-500/20 text-white'
                    : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-ink-300/80 hover:text-white'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full transition ${parodyMode ? 'bg-ink-300' : 'bg-slate-700'}`}
                />
                <span className="font-display text-base">Parody mode</span>
              </button>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {bosses.map((boss) => (
              <BossCard
                key={boss.id}
                boss={boss}
                parodyMode={parodyMode}
                selected={boss.id === selectedBoss?.id}
                onSelect={(profile) => setSelectedBossId(profile.id)}
              />
            ))}
          </div>

          <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-7 text-center font-bubble sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="text-xl font-semibold text-white heading-fun">Smash Now</p>
              <p className="text-base text-slate-300">
                {selectedBoss
                  ? `Ready to queue ${selectedBoss.name} on the stage.`
                  : 'Select a boss to unlock the stage.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStart}
              disabled={!selectedBoss}
              className="inline-flex items-center rounded-full bg-ink-500 px-8 py-3 text-base font-semibold font-display text-white transition hover:bg-ink-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {selectedBoss ? 'Launch Stage' : 'Choose a Boss'}
            </button>
          </div>
        </section>

        <footer className="mt-10 text-center text-sm text-slate-500 font-bubble">
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

function CelebrationOverlay() {
  const fireworks: Array<{ top: string; left?: string; right?: string; delay: string; size?: 'lg' | 'sm' }> = [
    { top: '12%', left: '14%', delay: '0ms', size: 'lg' },
    { top: '20%', right: '12%', delay: '90ms', size: 'lg' },
    { top: '34%', left: '22%', delay: '160ms' },
    { top: '40%', right: '20%', delay: '210ms' },
    { top: '16%', left: '46%', delay: '120ms', size: 'sm' },
    { top: '52%', left: '18%', delay: '260ms', size: 'sm' },
    { top: '48%', right: '24%', delay: '320ms' },
  ]

  const sparkles = Array.from({ length: 12 }, (_, index) => ({
    top: `${22 + (index % 4) * 16}%`,
    left: `${18 + (index * 7) % 60}%`,
    delay: `${index * 140}ms`,
  }))

  const confettiPieces = Array.from({ length: 36 }, (_, index) => {
    const left = `${(index % 12) * 8 + (index % 2 === 0 ? 2 : -1)}%`
    const delay = `${index * 55}ms`
    const duration = `${2400 + (index % 6) * 220}ms`
    const hue = (index * 37) % 360
    const scale = 0.8 + (index % 5) * 0.08
    const rotate = `${(index * 33) % 360}deg`
    return {
      key: index,
      left,
      delay,
      duration,
      color: `hsl(${hue}, 82%, 60%)`,
      scale,
      rotate,
    }
  })

  return (
    <div className="celebration-overlay">
      <span className="celebration-overlay__glow" />
      {fireworks.map((burst, index) => (
        <span
          key={`firework-${index}`}
          className={`firework ${burst.size ? `firework--${burst.size}` : ''}`}
          style={{
            top: burst.top,
            left: burst.left,
            right: burst.right,
            animationDelay: burst.delay,
          }}
        >
          <span className="firework__trail" />
        </span>
      ))}
      {sparkles.map((sparkle, index) => (
        <span
          key={`sparkle-${index}`}
          className="sparkle"
          style={{
            top: sparkle.top,
            left: sparkle.left,
            animationDelay: sparkle.delay,
          }}
        />
      ))}
      <div className="celebration-overlay__confetti">
        {confettiPieces.map((piece) => (
          <span
            key={`confetti-${piece.key}`}
            className="confetti-piece"
            style={{
              left: piece.left,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              transform: `rotate(${piece.rotate}) scale(${piece.scale})`,
              background: piece.color,
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="celebration-overlay__banner">
        <span className="celebration-banner">Crowd Eruption!</span>
      </div>
    </div>
  )
}

interface StatusScreenProps {
  title: string
  message: string
  tone?: 'default' | 'error'
  actionLabel?: string
  onAction?: () => void
}

function StatusScreen({ title, message, tone = 'default', actionLabel, onAction }: StatusScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center">
        <p className="text-base font-semibold uppercase tracking-[0.4em] text-ink-300/70 tagline-fun">
          Boss Roster
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-white heading-fun sm:text-5xl">{title}</h1>
        <p className={`text-lg leading-8 ${tone === 'error' ? 'text-rose-200' : 'text-slate-300'}`}>{message}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className={`inline-flex items-center rounded-full px-6 py-3 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              tone === 'error'
                ? 'bg-rose-500 text-slate-900 hover:bg-rose-400 focus-visible:outline-rose-200'
                : 'bg-ink-500 text-slate-900 hover:bg-ink-400 focus-visible:outline-ink-300'
            }`}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

const COMBO_WINDOW = 2200
const SATISFACTION_GAIN: Record<ImpactStrength, number> = {
  light: 6,
  medium: 11,
  heavy: 18,
}
const CROWD_MESSAGES: Record<CrowdMood, string> = {
  calm: 'Tap in a strong throw to wake the stands.',
  amped: 'Crowd is leaning in — keep the launch cadence hot.',
  eruption: 'It’s pandemonium. Every hit is fuel for the hype.',
}

const REACTION_CAPTIONS: Record<ImpactStrength, string[]> = {
  light: [
    'Soft tap',
    'Easy lob',
    'Light ping',
    'Quick flick',
  ],
  medium: [
    'Solid smack',
    'Firm thud',
    'Mid strike',
    'Steady slam',
  ],
  heavy: [
    'Major slam',
    'Critical blow',
    'Total crash',
    'Power smash',
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
