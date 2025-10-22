export type ImpactStrength = 'light' | 'medium' | 'heavy'

export interface Throwable {
  id: string
  name: string
  description: string
  image: string
  arc: 'low' | 'medium' | 'high'
  style: ImpactStrength
  physics: {
    power: number
    lift: number
    drag: number
    wobble?: number
  }
  audio: {
    releaseTone: number
    releaseNoise: number
    releaseDecay: number
    impactTone: number
    impactMetallic: number
    impactDecay: number
    voicePitch: number
    voiceRate: number
  }
}

export const throwables: Throwable[] = [
  {
    id: 'shoe',
    name: 'Dodgy Loafer',
    description: 'Classic office toss. Reliable, slightly curved trajectory.',
    image: '/img/throwable-shoe.svg',
    arc: 'medium',
    style: 'medium',
    physics: {
      power: 1.05,
      lift: 0.02,
      drag: 0.012,
      wobble: 0.01,
    },
    audio: {
      releaseTone: 620,
      releaseNoise: 0.45,
      releaseDecay: 0.28,
      impactTone: 280,
      impactMetallic: 0.35,
      impactDecay: 0.32,
      voicePitch: 1.05,
      voiceRate: 1.1,
    },
  },
  {
    id: 'bottle',
    name: 'Sparkling Bottle',
    description: 'Sloshy, with a looping arc and satisfying clink.',
    image: '/img/throwable-bottle.svg',
    arc: 'high',
    style: 'heavy',
    physics: {
      power: 1.15,
      lift: 0.015,
      drag: 0.02,
      wobble: 0.015,
    },
    audio: {
      releaseTone: 780,
      releaseNoise: 0.6,
      releaseDecay: 0.34,
      impactTone: 960,
      impactMetallic: 0.55,
      impactDecay: 0.42,
      voicePitch: 1.0,
      voiceRate: 1.05,
    },
  },
  {
    id: 'stone',
    name: 'Stress Pebble',
    description: 'Dense little meteor for straight-line shots.',
    image: '/img/throwable-stone.svg',
    arc: 'low',
    style: 'heavy',
    physics: {
      power: 1.28,
      lift: -0.015,
      drag: 0.006,
    },
    audio: {
      releaseTone: 420,
      releaseNoise: 0.3,
      releaseDecay: 0.22,
      impactTone: 190,
      impactMetallic: 0.18,
      impactDecay: 0.36,
      voicePitch: 0.95,
      voiceRate: 0.95,
    },
  },
  {
    id: 'laptop',
    name: 'ThinkPad Express',
    description: 'Corporate rebellion with a dramatic crash landing.',
    image: '/img/throwable-laptop.svg',
    arc: 'medium',
    style: 'heavy',
    physics: {
      power: 1.3,
      lift: -0.02,
      drag: 0.012,
    },
    audio: {
      releaseTone: 560,
      releaseNoise: 0.5,
      releaseDecay: 0.38,
      impactTone: 620,
      impactMetallic: 0.82,
      impactDecay: 0.48,
      voicePitch: 0.98,
      voiceRate: 1.0,
    },
  },
  {
    id: 'chicken',
    name: 'Rubber Chicken',
    description: 'Chaotic flapping, wacky spin, crowd pleaser.',
    image: '/img/throwable-chicken.svg',
    arc: 'high',
    style: 'light',
    physics: {
      power: 0.92,
      lift: 0.05,
      drag: 0.018,
      wobble: 0.08,
    },
    audio: {
      releaseTone: 540,
      releaseNoise: 0.7,
      releaseDecay: 0.3,
      impactTone: 440,
      impactMetallic: 0.25,
      impactDecay: 0.28,
      voicePitch: 1.3,
      voiceRate: 1.2,
    },
  },
  {
    id: 'paperplane',
    name: 'Snarky Memo',
    description: 'Glides on a gentle drift, perfect for stealthy zingers.',
    image: '/img/throwable-paperplane.svg',
    arc: 'high',
    style: 'light',
    physics: {
      power: 0.88,
      lift: 0.07,
      drag: 0.026,
    },
    audio: {
      releaseTone: 860,
      releaseNoise: 0.36,
      releaseDecay: 0.4,
      impactTone: 360,
      impactMetallic: 0.12,
      impactDecay: 0.24,
      voicePitch: 1.25,
      voiceRate: 1.15,
    },
  },
]
