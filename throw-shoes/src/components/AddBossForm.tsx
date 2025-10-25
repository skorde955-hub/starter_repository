import { useState } from 'react'
import type { Boss } from '../models/Boss'
import type { CreateBossRequest } from '../models/Boss'
import { useBosses } from '../state/BossContext'

interface AddBossFormProps {
  onCancel: () => void
  onCreated: (boss: Boss) => void
}

interface FormState {
  name: string
  role: string
  description: string
  mugshotFile: File | null
}

const INITIAL_STATE: FormState = {
  name: '',
  role: '',
  description: '',
  mugshotFile: null,
}

export function AddBossForm({ onCancel, onCreated }: AddBossFormProps) {
  const { addBoss } = useBosses()
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ mugshot?: string }>({})

  const updateField = (key: keyof FormState, value: string | File | null) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  const handleFileChange = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) {
      updateField('mugshotFile', null)
      setPreview({})
      return
    }
    const file = fileList[0]
    updateField('mugshotFile', file)
    const dataUrl = await fileToDataUrl(file)
    setPreview({ mugshot: dataUrl })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!form.name.trim() || !form.role.trim()) {
      setError('Please provide name and role')
      return
    }
    if (!form.mugshotFile) {
      setError('Please upload the mugshot image')
      return
    }

    setSubmitting(true)
    try {
      const payload: CreateBossRequest = {
        name: form.name.trim(),
        role: form.role.trim(),
        description: form.description.trim(),
        mugshotDataUrl: await fileToDataUrl(form.mugshotFile),
      }
      const created = await addBoss(payload)
      setSubmitting(false)
      setForm(INITIAL_STATE)
      setPreview({})
      onCreated(created)
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Failed to add boss')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <header className="text-center">
          <p className="text-base font-semibold uppercase tracking-[0.4em] text-ink-300/70 tagline-fun">
            Add New Boss
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white heading-fun sm:text-5xl">
            Personalise your target
          </h1>
          <p className="mt-4 text-lg leading-8 text-slate-300">
            Drop in a clear mugshot. We will crop the face and mount it onto our signature caricature body.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl shadow-ink-950/30"
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="flex flex-col gap-3">
              <span className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-300/70 tagline-fun">
                Name
              </span>
              <input
                type="text"
                required
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-400/40"
                placeholder="e.g. A. B. Consultant"
              />
            </label>
            <label className="flex flex-col gap-3">
              <span className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-300/70 tagline-fun">
                Role / Title
              </span>
              <input
                type="text"
                required
                value={form.role}
                onChange={(event) => updateField('role', event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-400/40"
                placeholder="MDP, Practice Lead"
              />
            </label>
          </div>

          <label className="mt-6 flex flex-col gap-3">
            <span className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-300/70 tagline-fun">
              Description
            </span>
            <textarea
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-400/40"
              placeholder="What makes this boss special?"
            />
          </label>

          <div className="mt-8">
            <UploadField
              label="Mugshot (front facing)"
              subtitle="Used to crop the head for the sling stage."
              accept="image/*"
              preview={preview.mugshot}
              disabled={submitting}
              onSelect={handleFileChange}
            />
          </div>

          {error ? (
            <p className="mt-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex justify-center rounded-full border border-slate-700 px-6 py-3 text-base font-medium text-slate-200 transition hover:border-ink-300/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-300"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex justify-center rounded-full bg-emerald-500 px-8 py-3 text-base font-semibold text-slate-900 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {submitting ? 'Adding…' : 'Add Boss'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UploadField({
  label,
  subtitle,
  accept,
  onSelect,
  disabled,
  preview,
}: {
  label: string
  subtitle: string
  accept: string
  disabled?: boolean
  preview?: string
  onSelect: (files: FileList | null) => void
}) {
  return (
    <label className="flex flex-col gap-3 rounded-3xl border border-dashed border-slate-700 bg-slate-900/50 p-6 hover:border-ink-400/60">
      <span className="text-sm font-semibold uppercase tracking-[0.3em] text-ink-300/70 tagline-fun">
        {label}
      </span>
      <span className="text-sm text-slate-400">{subtitle}</span>
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.files)}
        className="mt-2 rounded-full border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-ink-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-900 hover:file:bg-ink-400"
      />
      {preview ? (
        <span className="mt-4 flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/60">
          <img src={preview} alt="preview" className="h-full w-full object-contain" />
        </span>
      ) : null}
    </label>
  )
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read file as data URL'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
