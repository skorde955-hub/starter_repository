import type { BossProfile } from '../data/bosses'

interface BossCardProps {
  boss: BossProfile
  parodyMode?: boolean
  selected?: boolean
  onSelect?: (boss: BossProfile) => void
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
      className={`group flex flex-col items-center gap-3 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-6 transition-all hover:-translate-y-1 hover:border-ink-400/60 hover:bg-slate-900/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-400 ${
        selected ? 'border-ink-300 ring-2 ring-ink-400/60 ring-offset-2 ring-offset-slate-950' : ''
      }`}
    >
      <span className="relative h-28 w-28 overflow-hidden rounded-full border border-slate-700 bg-slate-900 shadow-lg shadow-ink-900/40">
        <img
          src={imageSrc}
          alt={parodyMode ? `${boss.name} parody avatar` : `${boss.name} avatar`}
          className="h-full w-full object-cover"
        />
      </span>
      <span className="text-lg font-semibold text-white">{boss.name}</span>
      <span className="text-sm font-medium text-slate-400">{boss.role}</span>
      <span className="mt-2 text-xs uppercase tracking-[0.3em] text-ink-300/70 opacity-0 transition-opacity group-hover:opacity-100">
        Select
      </span>
    </button>
  )
}
