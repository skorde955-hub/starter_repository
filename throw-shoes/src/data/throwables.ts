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
  spriteSize?: {
    width: number
    height: number
  }
  audio: {
    releaseTone: number
    releaseNoise: number
    releaseDecay: number
    impactTone: number
    impactMetallic: number
    impactDecay: number
  }
}

export const throwables: Throwable[] = [
  {
    id: 'shoe',
    name: 'Dodgy Loafer',
    description: 'Classic office toss. Reliable, slightly curved trajectory.',
    image: '/img/throwing objects/shoe.png',
    arc: 'medium',
    style: 'medium',
    physics: {
      power: 1.05,
      lift: 0.02,
      drag: 0.012,
      wobble: 0.01,
    },
    spriteSize: {
      width: 72,
      height: 62,
    },
    audio: {
      releaseTone: 620,
      releaseNoise: 0.45,
      releaseDecay: 0.28,
      impactTone: 280,
      impactMetallic: 0.35,
      impactDecay: 0.32,
    },
  },
  {
    id: 'bottle',
    name: 'Sparkling Bottle',
    description: 'Sloshy, with a looping arc and satisfying clink.',
    image: '/img/throwing objects/bottle.png',
    arc: 'high',
    style: 'heavy',
    physics: {
      power: 1.15,
      lift: 0.015,
      drag: 0.02,
      wobble: 0.015,
    },
    spriteSize: {
      width: 44,
      height: 88,
    },
    audio: {
      releaseTone: 780,
      releaseNoise: 0.6,
      releaseDecay: 0.34,
      impactTone: 960,
      impactMetallic: 0.55,
      impactDecay: 0.42,
    },
  },
  {
    id: 'stone',
    name: 'Stress Pebble',
    description: 'Dense little meteor for straight-line shots.',
    image: '/img/throwing objects/stone.png',
    arc: 'low',
    style: 'heavy',
    physics: {
      power: 1.28,
      lift: -0.015,
      drag: 0.006,
    },
    spriteSize: {
      width: 46,
      height: 46,
    },
    audio: {
      releaseTone: 420,
      releaseNoise: 0.3,
      releaseDecay: 0.22,
      impactTone: 190,
      impactMetallic: 0.18,
      impactDecay: 0.36,
    },
  },
  {
    id: 'laptop',
    name: 'ThinkPad Express',
    description: 'Corporate rebellion with a dramatic crash landing.',
    image: '/img/throwing objects/laptop.png',
    arc: 'medium',
    style: 'heavy',
    physics: {
      power: 1.3,
      lift: -0.02,
      drag: 0.012,
    },
    spriteSize: {
      width: 96,
      height: 48,
    },
    audio: {
      releaseTone: 560,
      releaseNoise: 0.5,
      releaseDecay: 0.38,
      impactTone: 620,
      impactMetallic: 0.82,
      impactDecay: 0.48,
    },
  },
  {
    id: 'chicken',
    name: 'Rubber Chicken',
    description: 'Chaotic flapping, wacky spin, crowd pleaser.',
    image: '/img/throwing objects/duck.png',
    arc: 'high',
    style: 'light',
    physics: {
      power: 0.92,
      lift: 0.05,
      drag: 0.018,
      wobble: 0.08,
    },
    spriteSize: {
      width: 66,
      height: 66,
    },
    audio: {
      releaseTone: 540,
      releaseNoise: 0.7,
      releaseDecay: 0.3,
      impactTone: 440,
      impactMetallic: 0.25,
      impactDecay: 0.28,
    },
  },
  {
    id: 'paperplane',
    name: 'Snarky Memo',
    description: 'Glides on a gentle drift, perfect for stealthy zingers.',
    image: '/img/throwing objects/paper_ball.png',
    arc: 'high',
    style: 'light',
    physics: {
      power: 0.88,
      lift: 0.07,
      drag: 0.026,
    },
    spriteSize: {
      width: 50,
      height: 42,
    },
    audio: {
      releaseTone: 860,
      releaseNoise: 0.36,
      releaseDecay: 0.4,
      impactTone: 360,
      impactMetallic: 0.12,
      impactDecay: 0.24,
    },
  },
]
