import type { Boss } from '../models/Boss'

interface BossCardProps {
  boss: Boss
  parodyMode?: boolean
  selected?: boolean
  onSelect?: (boss: Boss) => void
}

export function BossCard({
  boss,
  parodyMode = false,
  selected = false,
  onSelect,
}: BossCardProps) {
  const imageSrc = parodyMode ? boss.parodyImage : boss.image

  return (
    <button
      type="button"
      onClick={() => onSelect?.(boss)}
      className={`group flex flex-col items-center gap-4 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-7 font-bubble transition-all hover:-translate-y-1 hover:border-ink-400/60 hover:bg-slate-900/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-400 ${
        selected ? 'border-ink-300 ring-2 ring-ink-400/60 ring-offset-2 ring-offset-slate-950' : ''
      }`}
    >
      <span className="relative h-32 w-32 overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-lg shadow-ink-900/40">
        <img
          src={imageSrc}
          alt={parodyMode ? `${boss.name} parody avatar` : `${boss.name} avatar`}
          className="h-full w-full object-cover"
        />
      </span>
      <span className="text-xl font-semibold text-white heading-fun text-center leading-tight">{boss.name}</span>
      <span className="text-base font-medium text-slate-300 font-bubble text-center leading-relaxed">
        {boss.role}
      </span>
      <span className="mt-3 text-sm uppercase tracking-[0.3em] text-ink-300/70 tagline-fun opacity-0 transition-opacity group-hover:opacity-100">
        Select
      </span>
    </button>
  )
}
