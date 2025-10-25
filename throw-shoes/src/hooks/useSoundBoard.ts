import { useCallback, useRef } from 'react'
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

      // Body thump
      const thump = ctx.createOscillator()
      thump.type = 'sine'
      thump.frequency.setValueAtTime(120, now)
      thump.frequency.exponentialRampToValueAtTime(48, now + 0.28)

      const thumpGain = ctx.createGain()
      thumpGain.gain.setValueAtTime(impactGain * 0.6, now)
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.impactDecay + 0.18)

      thump.connect(thumpGain)
      thumpGain.connect(ctx.destination)

      // Rattle / debris
      const rattle = ctx.createOscillator()
      rattle.type = 'sawtooth'
      rattle.frequency.setValueAtTime(profile.impactTone * 0.8, now)
      rattle.frequency.exponentialRampToValueAtTime(profile.impactTone * 0.4, now + profile.impactDecay)

      const rattleGain = ctx.createGain()
      rattleGain.gain.setValueAtTime(impactGain * 0.24, now + 0.02)
      rattleGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.impactDecay + 0.12)

      rattle.connect(rattleGain)
      rattleGain.connect(ctx.destination)

      noise.start(now)
      noise.stop(now + profile.impactDecay + 0.1)
      tone.start(now)
      tone.stop(now + profile.impactDecay + 0.1)
      thump.start(now)
      thump.stop(now + profile.impactDecay + 0.3)
      rattle.start(now + 0.02)
      rattle.stop(now + profile.impactDecay + 0.18)
    },
    [ensureContext, getProfile],
  )

  const playCelebration = useCallback(async () => {
    const ctx = await ensureContext()
    if (!ctx) return
    const now = ctx.currentTime

    const master = ctx.createGain()
    master.gain.setValueAtTime(0.95, now)
    master.connect(ctx.destination)

    // Crowd cheer (layered noise swell)
    const crowd = ctx.createBufferSource()
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let lastOut = 0
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1
      data[i] = (lastOut + 0.03 * white) / 1.03
      lastOut = data[i]
    }
    crowd.buffer = buffer

    const crowdGain = ctx.createGain()
    crowdGain.gain.setValueAtTime(0.0001, now)
    crowdGain.gain.exponentialRampToValueAtTime(0.34, now + 0.12)
    crowdGain.gain.exponentialRampToValueAtTime(0.001, now + 3.2)

    const crowdFilter = ctx.createBiquadFilter()
    crowdFilter.type = 'bandpass'
    crowdFilter.frequency.setValueAtTime(680, now)
    crowdFilter.Q.setValueAtTime(0.9, now)

    crowd.connect(crowdFilter)
    crowdFilter.connect(crowdGain)
    crowdGain.connect(master)
    crowd.start(now)
    crowd.stop(now + 3.2)

    // High shimmer layer
    const shimmer = ctx.createOscillator()
    shimmer.type = 'sawtooth'
    shimmer.frequency.setValueAtTime(1860, now + 0.25)
    shimmer.frequency.exponentialRampToValueAtTime(520, now + 1.4)

    const shimmerGain = ctx.createGain()
    shimmerGain.gain.setValueAtTime(0.001, now + 0.25)
    shimmerGain.gain.linearRampToValueAtTime(0.14, now + 0.35)
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6)

    shimmer.connect(shimmerGain)
    shimmerGain.connect(master)
    shimmer.start(now + 0.25)
    shimmer.stop(now + 1.8)

    // Firecracker pops with stereo panning
    for (let i = 0; i < 6; i += 1) {
      const burstDelay = now + 0.28 + i * 0.18
      const pop = ctx.createBufferSource()
      const popBuffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.45), ctx.sampleRate)
      const popData = popBuffer.getChannelData(0)
      for (let j = 0; j < popData.length; j += 1) {
        const envelope = Math.exp(-j / (ctx.sampleRate * 0.18))
        popData[j] = (Math.random() * 2 - 1) * envelope
      }
      pop.buffer = popBuffer

      const popGain = ctx.createGain()
      popGain.gain.setValueAtTime(0.001, burstDelay)
      popGain.gain.linearRampToValueAtTime(0.24, burstDelay + 0.04)
      popGain.gain.exponentialRampToValueAtTime(0.0001, burstDelay + 0.5)

      const pan = ctx.createStereoPanner()
      pan.pan.setValueAtTime((Math.random() - 0.5) * 1.6, burstDelay)

      pop.connect(popGain)
      popGain.connect(pan)
      pan.connect(master)
      pop.start(burstDelay)
      pop.stop(burstDelay + 0.6)
    }

    // Call-and-response whoops
    for (let i = 0; i < 3; i += 1) {
      const start = now + 0.4 + i * 0.45
      const whoop = ctx.createOscillator()
      whoop.type = 'triangle'
      whoop.frequency.setValueAtTime(380 + i * 90, start)
      whoop.frequency.exponentialRampToValueAtTime(120 + i * 70, start + 0.35)

      const whoopGain = ctx.createGain()
      whoopGain.gain.setValueAtTime(0.001, start)
      whoopGain.gain.linearRampToValueAtTime(0.16, start + 0.08)
      whoopGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6)

      const pan = ctx.createStereoPanner()
      pan.pan.setValueAtTime(i === 1 ? 0 : i === 0 ? -0.65 : 0.65, start)

      whoop.connect(whoopGain)
      whoopGain.connect(pan)
      pan.connect(master)
      whoop.start(start)
      whoop.stop(start + 0.65)
    }

    // Sparkle crackles
    for (let i = 0; i < 5; i += 1) {
      const sparkleDelay = now + 0.32 + i * 0.24
      const sparkle = ctx.createBufferSource()
      const sparkleBuffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.2), ctx.sampleRate)
      const sparkleData = sparkleBuffer.getChannelData(0)
      for (let j = 0; j < sparkleData.length; j += 1) {
        const env = Math.pow(1 - j / sparkleData.length, 1.5)
        sparkleData[j] = (Math.random() * 2 - 1) * env
      }
      sparkle.buffer = sparkleBuffer

      const sparkleGain = ctx.createGain()
      sparkleGain.gain.setValueAtTime(0.001, sparkleDelay)
      sparkleGain.gain.linearRampToValueAtTime(0.12, sparkleDelay + 0.02)
      sparkleGain.gain.exponentialRampToValueAtTime(0.0001, sparkleDelay + 0.24)

      const pan = ctx.createStereoPanner()
      pan.pan.setValueAtTime((Math.random() - 0.5) * 1.2, sparkleDelay)

      sparkle.connect(sparkleGain)
      sparkleGain.connect(pan)
      pan.connect(master)
      sparkle.start(sparkleDelay)
      sparkle.stop(sparkleDelay + 0.26)
    }
  }, [ensureContext])

  return {
    playDraw,
    playRelease,
    playImpact,
    playCelebration,
  }
}

export type { ImpactStrength }
