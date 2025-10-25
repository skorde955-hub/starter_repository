import type { Throwable } from '../data/throwables'

interface ArmoryPickerProps {
  items: Throwable[]
  selectedId: string
  onSelect: (id: string) => void
}

export function ArmoryPicker({ items, selectedId, onSelect }: ArmoryPickerProps) {
  return (
    <div className="relative">
      <div className="absolute inset-x-0 -top-6 h-6 rounded-full bg-slate-900/70 shadow-lg shadow-ink-900/30 blur" aria-hidden />
      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/80 p-5 backdrop-blur">
        <ul className="flex min-w-full gap-4 sm:gap-5">
          {items.map((item) => {
            const selected = selectedId === item.id
            return (
              <li key={item.id} className="flex-1 min-w-[140px] sm:min-w-[160px]">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`flex h-full w-full flex-col gap-3 rounded-2xl border bg-slate-900/80 p-5 text-left transition hover:-translate-y-1 hover:border-ink-400/60 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-400 ${
                    selected ? 'border-ink-300/80 ring-2 ring-ink-400/60 ring-offset-2 ring-offset-slate-950' : 'border-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="h-12 w-12 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-inner shadow-ink-900/30">
                      <img src={item.image} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-base font-semibold text-white">{item.name}</span>
                      <span className="block text-sm text-slate-300">{labelForArc(item.arc)}</span>
                    </span>
                  </span>
                  <span className="text-base leading-6 text-slate-300">{item.description}</span>
                  <span className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-300/70">
                    {`Feel: ${labelForStyle(item.style)}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function labelForArc(arc: Throwable['arc']) {
  switch (arc) {
    case 'low':
      return 'Arc: Line drive'
    case 'medium':
      return 'Arc: Balanced'
    case 'high':
      return 'Arc: Soaring arc'
    default:
      return 'Arc: Custom'
  }
}

function labelForStyle(style: Throwable['style']) {
  switch (style) {
    case 'light':
      return 'Featherlight'
    case 'medium':
      return 'Classic'
    case 'heavy':
      return 'Hefty'
    default:
      return 'Custom'
  }
}
