import { useCallback, useEffect, useRef } from 'react'
import type { ImpactStrength, Throwable } from '../data/throwables'
import { throwables } from '../data/throwables'

type AudioProfile = Throwable['audio']

const THROWABLE_PROFILES: Record<string, AudioProfile> = throwables.reduce<Record<string, AudioProfile>>(
  (acc, item) => {
    acc[item.id] = item.audio
    return acc
  },
  {},
)

const FALLBACK_PROFILE: AudioProfile = {
  releaseTone: 640,
  releaseNoise: 0.45,
  releaseDecay: 0.3,
  impactTone: 320,
  impactMetallic: 0.3,
  impactDecay: 0.34,
  voicePitch: 1.05,
  voiceRate: 1.05,
}

const IMPACT_GAIN: Record<ImpactStrength, number> = {
  light: 0.22,
  medium: 0.28,
  heavy: 0.36,
}

const RELEASE_GAIN: Record<ImpactStrength, number> = {
  light: 0.18,
  medium: 0.25,
  heavy: 0.32,
}

export function useSoundBoard() {
  const ctxRef = useRef<AudioContext | null>(null)
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const waitingForVoicesRef = useRef(false)

  const ensureContext = useCallback(async (): Promise<AudioContext | null> => {
    if (!ctxRef.current) {
      const globalWindow = window as Window &
        typeof globalThis & { webkitAudioContext?: typeof AudioContext }
      const AudioContextClass = globalWindow.AudioContext ?? globalWindow.webkitAudioContext
      if (!AudioContextClass) {
        return null
      }
      ctxRef.current = new AudioContextClass()
    }
    const ctx = ctxRef.current
    if (!ctx) {
      return null
    }
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        // ignore resume failure; some browsers block autoplay until further interaction
      }
    }
    return ctx
  }, [])

  const getProfile = useCallback((throwableId: string): AudioProfile => {
    return THROWABLE_PROFILES[throwableId] ?? FALLBACK_PROFILE
  }, [])

  const playDraw = useCallback(async () => {
    const ctx = await ensureContext()
    if (!ctx) return
    const now = ctx.currentTime

    const base = ctx.createOscillator()
    base.type = 'sawtooth'
    base.frequency.setValueAtTime(210, now)
    base.frequency.exponentialRampToValueAtTime(140, now + 0.45)

    const tension = ctx.createGain()
    tension.gain.setValueAtTime(0.001, now)
    tension.gain.exponentialRampToValueAtTime(0.18, now + 0.08)
    tension.gain.exponentialRampToValueAtTime(0.001, now + 0.5)

    base.connect(tension)
    tension.connect(ctx.destination)

    const creak = ctx.createOscillator()
    creak.type = 'triangle'
    creak.frequency.setValueAtTime(40, now)
    const creakGain = ctx.createGain()
    creakGain.gain.setValueAtTime(0.001, now)
    creakGain.gain.linearRampToValueAtTime(0.08, now + 0.15)
    creakGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)

    creak.connect(creakGain)
    creakGain.connect(ctx.destination)

    base.start(now)
    base.stop(now + 0.6)
    creak.start(now)
    creak.stop(now + 0.6)
  }, [ensureContext])

  const playRelease = useCallback(
    async (throwableId: string, strength: ImpactStrength) => {
      const ctx = await ensureContext()
      if (!ctx) return
      const profile = getProfile(throwableId)
      const now = ctx.currentTime
      const baseGain = RELEASE_GAIN[strength] ?? 0.22

      // Noise burst
      const noise = ctx.createBufferSource()
      const bufferSize = Math.round(ctx.sampleRate * (profile.releaseDecay + 0.2))
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (profile.releaseDecay * ctx.sampleRate))
      }
      noise.buffer = buffer

      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = profile.releaseTone
      filter.Q.value = 0.6 + profile.releaseNoise

      const noiseGain = ctx.createGain()
      noiseGain.gain.setValueAtTime(0.0001, now)
      noiseGain.gain.linearRampToValueAtTime(baseGain * profile.releaseNoise, now + 0.02)
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.releaseDecay)

      noise.connect(filter)
      filter.connect(noiseGain)
      noiseGain.connect(ctx.destination)

      // Air whistle
      const tone = ctx.createOscillator()
      tone.type = 'sine'
      tone.frequency.setValueAtTime(profile.releaseTone, now)
      tone.frequency.exponentialRampToValueAtTime(profile.releaseTone * 0.7, now + profile.releaseDecay)

      const toneGain = ctx.createGain()
      toneGain.gain.setValueAtTime(0.001, now)
      toneGain.gain.linearRampToValueAtTime(baseGain * 0.6, now + 0.03)
      toneGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.releaseDecay)

      tone.connect(toneGain)
      toneGain.connect(ctx.destination)

      noise.start(now)
      noise.stop(now + profile.releaseDecay + 0.1)
      tone.start(now)
      tone.stop(now + profile.releaseDecay + 0.1)
    },
    [ensureContext, getProfile],
  )

  const playImpact = useCallback(
    async (throwableId: string, strength: ImpactStrength) => {
      const ctx = await ensureContext()
      if (!ctx) return
      const profile = getProfile(throwableId)
      const now = ctx.currentTime
      const impactGain = IMPACT_GAIN[strength] ?? 0.28

      // Body noise
      const noise = ctx.createBufferSource()
      const bufferSize = Math.round(ctx.sampleRate * (profile.impactDecay + 0.2))
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i += 1) {
        data[i] = Math.random() * 2 - 1
      }
      noise.buffer = buffer

      const noiseFilter = ctx.createBiquadFilter()
      noiseFilter.type = profile.impactMetallic > 0.5 ? 'highpass' : 'bandpass'
      noiseFilter.frequency.value = profile.impactTone
      noiseFilter.Q.value = 0.7 + profile.impactMetallic * 3

      const noiseGain = ctx.createGain()
      noiseGain.gain.setValueAtTime(0.0001, now)
      noiseGain.gain.linearRampToValueAtTime(impactGain, now + 0.01)
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.impactDecay)

      noise.connect(noiseFilter)
      noiseFilter.connect(noiseGain)
      noiseGain.connect(ctx.destination)

      // Ring/tone
      const tone = ctx.createOscillator()
      tone.type = profile.impactMetallic > 0.6 ? 'square' : 'triangle'
      tone.frequency.setValueAtTime(profile.impactTone, now)
      tone.frequency.exponentialRampToValueAtTime(profile.impactTone * 0.7, now + profile.impactDecay)

      const toneGain = ctx.createGain()
      toneGain.gain.setValueAtTime(impactGain * 0.7, now)
      toneGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.impactDecay)

      tone.connect(toneGain)
      toneGain.connect(ctx.destination)

      noise.start(now)
      noise.stop(now + profile.impactDecay + 0.1)
      tone.start(now)
      tone.stop(now + profile.impactDecay + 0.1)
    },
    [ensureContext, getProfile],
  )

  const speakReaction = useCallback((caption: string, throwableId: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !caption) return
    const synth = window.speechSynthesis
    const profile = getProfile(throwableId)

    const resolveVoice = () => {
      const voices = synth.getVoices()
      if (!voices.length) return null
      const preferred =
        voices.find((voice) => /female/i.test(voice.name) && voice.lang.startsWith('en')) ??
        voices.find((voice) => voice.lang.startsWith('en')) ??
        voices[0]
      return preferred ?? null
    }

    if (!voiceRef.current && !waitingForVoicesRef.current) {
      const voice = resolveVoice()
      if (voice) {
        voiceRef.current = voice
      } else {
        waitingForVoicesRef.current = true
        const handler = () => {
          const resolved = resolveVoice()
          if (resolved) {
            voiceRef.current = resolved
            waitingForVoicesRef.current = false
            synth.removeEventListener('voiceschanged', handler)
          }
        }
        synth.addEventListener('voiceschanged', handler)
      }
    }

    if (speechRef.current) {
      synth.cancel()
    }

    const utterance = new SpeechSynthesisUtterance(caption)
    utterance.pitch = profile.voicePitch
    utterance.rate = profile.voiceRate
    utterance.volume = 0.92
    if (voiceRef.current) {
      utterance.voice = voiceRef.current
    }
    speechRef.current = utterance
    synth.cancel()
    synth.speak(utterance)
  }, [getProfile])

  useEffect(() => {
    return () => {
      if (speechRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return {
    playDraw,
    playRelease,
    playImpact,
    speakReaction,
  }
}

export type { ImpactStrength }
