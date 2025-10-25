export interface BossFaceRect {
  x: number
  y: number
  width: number
  height: number
}

export interface BossFaceClipRadius {
  x: number
  y: number
}

export interface BossStageComposite {
  base: string
  face: {
    src: string
    rect: BossFaceRect
    clipRadius?: BossFaceClipRadius
    rotation?: number
  }
}

export interface BossMetrics {
  totalHits: number
}

export interface BossAssets {
  body?: string
  face?: string
  mugshot?: string
}

export interface Boss {
  id: string
  name: string
  role: string
  description?: string
  image: string
  parodyImage: string
  stageComposite?: BossStageComposite
  assets?: BossAssets
  metrics?: BossMetrics
  createdAt?: string
}

export interface CreateBossRequest {
  name: string
  role: string
  description?: string
  mugshotDataUrl: string
}
