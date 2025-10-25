import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Boss, BossStageComposite } from '../models/Boss'
import type { ImpactStrength, Throwable } from '../data/throwables'
import { useAnimationFrame } from '../hooks/useAnimationFrame'

const GRAVITY = 0.48
const MAX_TRAIL_POINTS = 60
const MIN_PULL_DISTANCE = 12
const MAX_PULL_DISTANCE = 260
const RESET_DELAY_MS = 320
const SHAKE_DECAY = 0.84
const MAX_SHAKE = 16
const STRENGTH_SHAKE: Record<ImpactStrength, number> = {
  light: 4.2,
  medium: 7.2,
  heavy: 10.5,
}
const STRENGTH_SQUASH: Record<ImpactStrength, number> = {
  light: 0.12,
  medium: 0.18,
  heavy: 0.26,
}
const STRENGTH_FLASH: Record<ImpactStrength, number> = {
  light: 0.55,
  medium: 0.78,
  heavy: 1,
}
const SHOCKWAVE_DURATION = 520
const STRENGTH_SHOCKWAVE_RADIUS: Record<ImpactStrength, number> = {
  light: 38,
  medium: 56,
  heavy: 74,
}
const PARTICLE_PER_IMPACT: Record<ImpactStrength, number> = {
  light: 14,
  medium: 20,
  heavy: 26,
}
const PARTICLE_LIFETIME = 780
const PARTICLE_GRAVITY = 0.32
const STRENGTH_PARTICLE_IMPULSE: Record<ImpactStrength, number> = {
  light: 0.9,
  medium: 1.18,
  heavy: 1.46,
}
const DEFAULT_BOSS_ASPECT_RATIO = 1.5
const CLEANED_BASE_CACHE = new WeakMap<
  HTMLImageElement,
  { canvas: HTMLCanvasElement; key: string }
>()
const UNIVERSAL_BODY_SPRITE = '/img/caricature-bodies/body-varun.png'
const UNIVERSAL_FACE_RECT = {
  x: 0.204,
  y: -0.375,
  width: 0.72,
  height: 0.7,
}
const UNIVERSAL_FACE_CLIP = {
  x: 0.5,
  y: 0.68,
}
const UNIVERSAL_FACE_ROTATION = 0

type BossMood = 'idle' | 'flinch' | 'stunned'

interface BossAnimationState {
  mood: BossMood
  timer: number
  wobbleSeed: number
  hitFlash: number
  squash: number
  tilt: number
  tiltVelocity: number
}

interface Shockwave {
  id: number
  x: number
  y: number
  age: number
  strength: ImpactStrength
  duration: number
}

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  size: number
  hue: number
  strength: ImpactStrength
}

type BossVisual =
  | {
      kind: 'sprite'
      image: HTMLImageElement
    }
  | {
      kind: 'composite'
      base: HTMLImageElement
      face: HTMLImageElement
      descriptor: BossStageComposite
    }

interface CanvasStageProps {
  boss: Boss
  throwable: Throwable
  parodyMode: boolean
  aimAssist: boolean
  hypeLevel: number
  onHit?: (impact: CollisionResult) => void
  onLaunch?: (payload: { strength: ImpactStrength; throwableId: string }) => void
  onDrawStart?: () => void
}

interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  lift: number
  drag: number
  wobble: number
  age: number
  active: boolean
}

interface CollisionResult {
  bossId: string
  impactPoint: { x: number; y: number }
  strength: ImpactStrength
  throwableId: string
  timestamp: number
}

interface StageLayout {
  width: number
  height: number
  groundY: number
  baseX: number
  baseY: number
  slingAnchors: {
    left: { x: number; y: number }
    right: { x: number; y: number }
  }
  slingRestPoint: { x: number; y: number }
  boss: {
    x: number
    y: number
    width: number
    height: number
    centerX: number
    centerY: number
  }
}

interface LaunchSolution {
  startX: number
  startY: number
  vx: number
  vy: number
  clampedPoint: { x: number; y: number }
  lift: number
  drag: number
  wobble: number
}

export function CanvasStage({
  boss,
  throwable,
  parodyMode,
  aimAssist,
  hypeLevel,
  onHit,
  onLaunch,
  onDrawStart,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const layoutRef = useRef<StageLayout | null>(null)
  const projectileRef = useRef<Projectile | null>(null)
  const trailRef = useRef<Array<{ x: number; y: number }>>([])
  const hoverRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)
  const resetTimeoutRef = useRef<number | null>(null)
  const bossAnimRef = useRef<BossAnimationState>({
    mood: 'idle',
    timer: 0,
    wobbleSeed: Math.random() * Math.PI * 2,
    hitFlash: 0,
    squash: 0,
    tilt: 0,
    tiltVelocity: 0,
  })
  const screenShakeRef = useRef(0)
  const shockwavesRef = useRef<Shockwave[]>([])
  const particlesRef = useRef<Particle[]>([])
  const effectIdRef = useRef(0)
  const lastFrameRef = useRef<number | null>(null)
  const bossAspectRatioRef = useRef(DEFAULT_BOSS_ASPECT_RATIO)

  const bossVisual = useBossVisual(boss, parodyMode)
  const catapultSprite = useCatapultSprite()
  const projectileSprite = useThrowableSprite(throwable.image)
  const projectileSpriteSize = throwable.spriteSize

  useEffect(() => {
    const updateAspectRatio = () => {
      const ratio = deriveBossAspectRatio(bossVisual)
      if (!Number.isFinite(ratio) || ratio <= 0) return
      const clamped = Math.max(1, Math.min(1.85, ratio))
      if (Math.abs(clamped - bossAspectRatioRef.current) < 0.01) return
      bossAspectRatioRef.current = clamped
      const layout = layoutRef.current
      if (layout) {
        layoutRef.current = computeStageLayout(layout.width, layout.height, clamped)
      }
    }

    updateAspectRatio()

    const imageTarget =
      bossVisual.kind === 'composite' ? bossVisual.base : bossVisual.image

    if (typeof imageTarget.decode === 'function') {
      void imageTarget
        .decode()
        .then(updateAspectRatio)
        .catch(() => {
          /* ignore decode errors; load listener handles retry */
        })
    }

    if (imageTarget.complete && imageTarget.naturalWidth > 0 && imageTarget.naturalHeight > 0) {
      return
    }

    const handleLoad = () => {
      updateAspectRatio()
    }

    imageTarget.addEventListener('load', handleLoad)
    return () => {
      imageTarget.removeEventListener('load', handleLoad)
    }
  }, [bossVisual])

  const resetBossAnimation = useCallback(() => {
    bossAnimRef.current = {
      mood: 'idle',
      timer: 0,
      wobbleSeed: Math.random() * Math.PI * 2,
      hitFlash: 0,
      squash: 0,
      tilt: 0,
      tiltVelocity: 0,
    }
    screenShakeRef.current = 0
    shockwavesRef.current = []
    particlesRef.current = []
    lastFrameRef.current = null
  }, [])

  const spawnShockwave = useCallback(
    (point: { x: number; y: number }, strength: ImpactStrength) => {
      effectIdRef.current += 1
      shockwavesRef.current.push({
        id: effectIdRef.current,
        x: point.x,
        y: point.y,
        age: 0,
        strength,
        duration: SHOCKWAVE_DURATION,
      })
    },
    [],
  )

  const spawnParticles = useCallback(
    (point: { x: number; y: number }, strength: ImpactStrength) => {
      const count = PARTICLE_PER_IMPACT[strength] ?? 12
      const impulse = STRENGTH_PARTICLE_IMPULSE[strength] ?? 1
      const hypeBoost = 0.6 + hypeLevel * 0.8
      for (let i = 0; i < count; i += 1) {
        effectIdRef.current += 1
        const angle = Math.random() * Math.PI * 2
        const speed = (0.95 + Math.random() * 0.8) * impulse
        const vx = Math.cos(angle) * speed * 3.4
        const vy = Math.sin(angle) * speed * 2.6 - impulse * 1.5
        const hueBase = strength === 'heavy' ? 12 : strength === 'medium' ? 26 : 38
        const hue = hueBase + (Math.random() - 0.5) * 16 + hypeBoost * 18
        const size = 2.6 + Math.random() * 3.4
        const life = PARTICLE_LIFETIME * (0.65 + Math.random() * 0.55)
        particlesRef.current.push({
          id: effectIdRef.current,
          x: point.x,
          y: point.y,
          vx,
          vy,
          age: 0,
          life,
          size,
          hue,
          strength,
        })
      }
      if (particlesRef.current.length > 220) {
        particlesRef.current.splice(0, particlesRef.current.length - 220)
      }
    },
    [hypeLevel],
  )

  const triggerBossImpact = useCallback(
    (point: { x: number; y: number }, strength: ImpactStrength) => {
      const anim = bossAnimRef.current
      anim.mood = strength === 'heavy' ? 'stunned' : 'flinch'
      anim.timer = 0
      anim.hitFlash = Math.min(1, STRENGTH_FLASH[strength])
      anim.squash = Math.max(anim.squash, STRENGTH_SQUASH[strength])
      const layout = layoutRef.current
      const bossCenterX = layout?.boss.centerX ?? point.x
      const direction = point.x < bossCenterX ? -1 : 1
      anim.tiltVelocity += direction * (0.012 + STRENGTH_SQUASH[strength] * 0.46)
      screenShakeRef.current = Math.min(
        MAX_SHAKE,
        screenShakeRef.current + STRENGTH_SHAKE[strength],
      )
      spawnShockwave(point, strength)
      spawnParticles(point, strength)
    },
    [spawnParticles, spawnShockwave],
  )

  const clearProjectile = useCallback(() => {
    projectileRef.current = null
    trailRef.current = []
  }, [])

  const scheduleReset = useCallback(() => {
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current)
    }
    resetTimeoutRef.current = window.setTimeout(() => {
      clearProjectile()
      resetTimeoutRef.current = null
    }, RESET_DELAY_MS)
  }, [clearProjectile])

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    clearProjectile()
    resetBossAnimation()
  }, [boss.id, throwable.id, clearProjectile, resetBossAnimation])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const pixelRatio = window.devicePixelRatio || 1
      const width = parent.clientWidth
      const height = Math.min(380, Math.max(300, Math.round(parent.clientWidth * 0.58)))
      canvas.width = width * pixelRatio
      canvas.height = height * pixelRatio
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      layoutRef.current = computeStageLayout(width, height, bossAspectRatioRef.current)
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useAnimationFrame(
    (time) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const lastTime = lastFrameRef.current ?? time
      const rawDelta = time - lastTime
      const deltaMs = Number.isFinite(rawDelta) ? Math.max(8, Math.min(64, rawDelta || 16)) : 16
      lastFrameRef.current = time
      const deltaFactor = deltaMs / 16.6667

      const pixelRatio = window.devicePixelRatio || 1
      const width = canvas.width / pixelRatio
      const height = canvas.height / pixelRatio
      const layout = computeStageLayout(width, height, bossAspectRatioRef.current)
      layoutRef.current = layout

      updateBossAnimation(bossAnimRef.current, deltaMs)
      updateShockwaves(shockwavesRef.current, deltaMs)
      updateParticles(particlesRef.current, deltaMs, layout, deltaFactor)

      screenShakeRef.current *= Math.pow(SHAKE_DECAY, deltaFactor)
      if (screenShakeRef.current < 0.05) {
        screenShakeRef.current = 0
      }

      ctx.save()
      ctx.scale(pixelRatio, pixelRatio)

      const shake = screenShakeRef.current
      if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.6)
      }

      const hype = clamp01(hypeLevel)
      drawBackdrop(ctx, width, height, hype, time, bossAnimRef.current.wobbleSeed)
      drawCrowd(ctx, layout, hype, time, bossAnimRef.current.wobbleSeed)
      drawGround(ctx, layout, hype)

      drawCatapult(ctx, layout, catapultSprite, width)
      drawBoss(ctx, layout, bossVisual, bossAnimRef.current, hype, time)

      const slingPoint =
        isDraggingRef.current && hoverRef.current ? hoverRef.current : layout.slingRestPoint
      drawSling(ctx, layout, slingPoint)

      if (isDraggingRef.current && hoverRef.current) {
        const launchPreview = resolveLaunch(layout, hoverRef.current, aimAssist, throwable)
        if (launchPreview) {
          const prediction = simulateTrajectory(launchPreview, layout)
          drawPrediction(ctx, prediction, hype)
        }
      }

      const projectile = projectileRef.current

      if (!projectile || !projectile.active) {
        drawLoadedProjectile(ctx, slingPoint, projectileSprite, projectileSpriteSize)
        trailRef.current = []
      }

      if (projectile && projectile.active) {
        const wobbleX = projectile.wobble
          ? Math.sin(projectile.age * 0.35) * projectile.wobble * 6
          : 0
        const wobbleY = projectile.wobble
          ? Math.cos(projectile.age * 0.25) * projectile.wobble * 4
          : 0
        projectile.age += deltaFactor
        projectile.vx *= 1 - projectile.drag * deltaFactor
        projectile.vy += (GRAVITY - projectile.lift) * deltaFactor
        projectile.x += projectile.vx + wobbleX * 0.4
        projectile.y += projectile.vy + wobbleY

        const trail = trailRef.current
        trail.push({ x: projectile.x, y: projectile.y })
        if (trail.length > MAX_TRAIL_POINTS) {
          trail.shift()
        }

        drawTrail(ctx, trail, hype)
        drawFlyingProjectile(ctx, projectile, projectileSprite, projectileSpriteSize)

        if (isCollidingWithBoss(projectile, layout.boss)) {
          projectile.active = false
          triggerBossImpact({ x: projectile.x, y: projectile.y }, throwable.style)
          onHit?.({
            bossId: boss.id,
            impactPoint: { x: projectile.x, y: projectile.y },
            strength: throwable.style,
            throwableId: throwable.id,
            timestamp: Date.now(),
          })
          scheduleReset()
        } else if (projectile.y >= layout.groundY - 4) {
          projectile.active = false
          scheduleReset()
        }
      }

      drawShockwaves(ctx, shockwavesRef.current, hype)
      drawParticles(ctx, particlesRef.current)

      ctx.restore()
    },
    true,
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ensureLayout = (rect: DOMRect) => {
      const layout = computeStageLayout(rect.width, rect.height, bossAspectRatioRef.current)
      layoutRef.current = layout
      return layout
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (projectileRef.current?.active) return
      onDrawStart?.()
      const rect = canvas.getBoundingClientRect()
      const layout = ensureLayout(rect)
      const point = clampSlingPoint(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        layout,
      )
      hoverRef.current = point
      isDraggingRef.current = true
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) return
      const rect = canvas.getBoundingClientRect()
      const layout = ensureLayout(rect)
      const point = clampSlingPoint(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        layout,
      )
      hoverRef.current = point
      event.preventDefault()
    }

    const releasePointer = (event: PointerEvent, shouldLaunch: boolean) => {
      if (!isDraggingRef.current) return
      const rect = canvas.getBoundingClientRect()
      const layout = ensureLayout(rect)
      const releasePoint = hoverRef.current ?? layout.slingRestPoint
      canvas.releasePointerCapture(event.pointerId)
      isDraggingRef.current = false
      if (shouldLaunch) {
        const launch = resolveLaunch(layout, releasePoint, aimAssist, throwable)
        if (launch) {
          projectileRef.current = {
            x: launch.startX,
            y: launch.startY,
            vx: launch.vx,
            vy: launch.vy,
            lift: launch.lift,
            drag: launch.drag,
            wobble: launch.wobble,
            age: 0,
            active: true,
          }
          trailRef.current = []
          if (resetTimeoutRef.current !== null) {
            window.clearTimeout(resetTimeoutRef.current)
            resetTimeoutRef.current = null
          }
          onLaunch?.({ strength: throwable.style, throwableId: throwable.id })
        }
      }
      hoverRef.current = null
      event.preventDefault()
    }

    const handlePointerUp = (event: PointerEvent) => releasePointer(event, true)
    const handlePointerCancel = (event: PointerEvent) => releasePointer(event, false)

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerCancel)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [aimAssist, onDrawStart, onLaunch, throwable])

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-3xl border border-slate-800 bg-slate-950/90 shadow-inner shadow-ink-900/40"
      style={{ touchAction: 'none' }}
      role="img"
      aria-label={`Canvas stage with ${boss.name} and equipped ${throwable.name}`}
    />
  )
}

function computeStageLayout(
  width: number,
  height: number,
  bossAspectRatio: number = DEFAULT_BOSS_ASPECT_RATIO,
): StageLayout {
  const groundY = Math.round(height - Math.min(96, height * 0.22))
  const baseX = Math.round(width * 0.22)
  const baseY = groundY - 32
  const baseBossWidth = Math.min(180, width * 0.26)
  const maxBossHeight = Math.min(height * 0.82, groundY - height * 0.04)
  let bossWidth = baseBossWidth
  let bossHeight = bossWidth * bossAspectRatio

  if (maxBossHeight > 0 && bossHeight > maxBossHeight) {
    bossHeight = maxBossHeight
    bossWidth = bossHeight / bossAspectRatio
  }

  if (!Number.isFinite(bossWidth) || bossWidth <= 0) {
    bossWidth = baseBossWidth
    bossHeight = bossWidth * DEFAULT_BOSS_ASPECT_RATIO
  }

  const bossX = Math.round(width * 0.68)
  const bossY = Math.round(groundY - bossHeight)

  return {
    width,
    height,
    groundY,
    baseX,
    baseY,
    slingAnchors: {
      left: { x: baseX - 26, y: baseY - 20 },
      right: { x: baseX + 26, y: baseY - 20 },
    },
    slingRestPoint: { x: baseX - 6, y: baseY - 58 },
    boss: {
      x: bossX,
      y: bossY,
      width: bossWidth,
      height: bossHeight,
      centerX: bossX + bossWidth / 2,
      centerY: bossY + bossHeight / 2,
    },
  }
}

function clampSlingPoint(point: { x: number; y: number }, layout: StageLayout) {
  const maxRadius = Math.min(MAX_PULL_DISTANCE, layout.width * 0.42)
  const dx = point.x - layout.baseX
  const dy = point.y - layout.baseY
  const distance = Math.hypot(dx, dy)
  let clamped = point

  if (distance > maxRadius) {
    const ratio = maxRadius / distance
    clamped = {
      x: layout.baseX + dx * ratio,
      y: layout.baseY + dy * ratio,
    }
  }

  const minX = layout.baseX - maxRadius - 36
  const maxX = layout.baseX + 60
  const minY = layout.baseY - maxRadius * 0.5
  const maxY = layout.baseY + maxRadius * 0.8

  return {
    x: Math.max(minX, Math.min(maxX, clamped.x)),
    y: Math.max(minY, Math.min(maxY, clamped.y)),
  }
}

function resolveLaunch(
  layout: StageLayout,
  point: { x: number; y: number },
  aimAssist: boolean,
  throwable: Throwable,
): LaunchSolution | null {
  const diffX = point.x - layout.baseX
  const diffY = point.y - layout.baseY
  const distance = Math.hypot(diffX, diffY)
  if (distance < MIN_PULL_DISTANCE) {
    return null
  }

  const clampedDistance = Math.min(distance, MAX_PULL_DISTANCE)
  let directionX = diffX / distance
  let directionY = diffY / distance

  const arcTilt =
    throwable.arc === 'high' ? 1.35 : throwable.arc === 'low' ? 0.72 : 1
  const arcHorizontal =
    throwable.arc === 'high' ? 0.88 : throwable.arc === 'low' ? 1.18 : 1
  directionY *= arcTilt
  directionX *= arcHorizontal

  if (aimAssist) {
    const targetVector = {
      x: layout.boss.centerX - layout.baseX,
      y: layout.boss.centerY - layout.baseY,
    }
    const targetMagnitude = Math.hypot(targetVector.x, targetVector.y) || 1
    const blend = 0.32
    directionX = directionX * (1 - blend) + (targetVector.x / targetMagnitude) * blend
    directionY = directionY * (1 - blend) + (targetVector.y / targetMagnitude) * blend
    const norm = Math.hypot(directionX, directionY) || 1
    directionX /= norm
    directionY /= norm
  }

  const weightModifier = throwable.style === 'light' ? 0.9 : throwable.style === 'heavy' ? 1.24 : 1
  const basePower = 0.11
  const power = basePower * weightModifier * throwable.physics.power * clampedDistance
  const vx = -directionX * power
  const vy = -directionY * power

  return {
    startX: layout.baseX + 14,
    startY: layout.baseY - 22,
    vx,
    vy,
    clampedPoint: point,
    lift: throwable.physics.lift,
    drag: throwable.physics.drag,
    wobble: throwable.physics.wobble ?? 0,
  }
}

function simulateTrajectory(launch: LaunchSolution, layout: StageLayout, steps = 60) {
  const points: Array<{ x: number; y: number }> = []
  let x = launch.startX
  let y = launch.startY
  let vx = launch.vx
  let vy = launch.vy
  let age = 0

  for (let i = 0; i < steps; i += 1) {
    age += 1
    vx *= 1 - launch.drag
    vy += GRAVITY - launch.lift
    const wobbleX = launch.wobble ? Math.sin(age * 0.35) * launch.wobble * 6 : 0
    const wobbleY = launch.wobble ? Math.cos(age * 0.25) * launch.wobble * 4 : 0
    x += vx + wobbleX * 0.4
    y += vy + wobbleY
    if (y >= layout.groundY - 2) break
    if (x > layout.width + 120 || x < -120) break
    points.push({ x, y })
  }

  return points
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  hype = 0,
) {
  if (points.length < 2) return
  const gradient = ctx.createLinearGradient(
    points[0].x,
    points[0].y,
    points[points.length - 1].x,
    points[points.length - 1].y,
  )
  const startAlpha = 0.18 + hype * 0.22
  const endAlpha = 0.64 + hype * 0.28
  gradient.addColorStop(0, `rgba(56, 189, 248, ${startAlpha})`)
  gradient.addColorStop(1, `rgba(14, 165, 233, ${endAlpha})`)
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const point of points) {
    ctx.lineTo(point.x, point.y)
  }
  ctx.strokeStyle = gradient
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawPrediction(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  hype = 0,
) {
  if (!points.length) return
  ctx.fillStyle = `rgba(56, 189, 248, ${0.25 + hype * 0.2})`
  points.forEach((point, index) => {
    const alpha = Math.max(0.15, 1 - index / points.length)
    const intensity = Math.min(1, alpha * (0.6 + hype * 0.3))
    ctx.fillStyle = `rgba(56, 189, 248, ${intensity})`
    ctx.beginPath()
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hype: number,
  time: number,
  seed: number,
) {
  const top = lerpColor('#040617', '#210a3b', hype)
  const mid = lerpColor('#0f172a', '#2e2158', hype)
  const bottom = lerpColor('#020617', '#060312', hype * 0.7)
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, top)
  gradient.addColorStop(0.55, mid)
  gradient.addColorStop(1, bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const pulse = 0.08 + hype * 0.2 + Math.sin(time / 1200 + seed) * 0.04
  const beam = ctx.createLinearGradient(width * 0.18, 0, width * 0.82, height)
  beam.addColorStop(0, `rgba(56, 189, 248, ${pulse})`)
  beam.addColorStop(0.5, `rgba(236, 72, 153, ${pulse * 0.7})`)
  beam.addColorStop(1, 'rgba(56, 189, 248, 0)')
  ctx.fillStyle = beam
  ctx.fillRect(0, 0, width, height)
}

function drawCrowd(
  ctx: CanvasRenderingContext2D,
  layout: StageLayout,
  hype: number,
  time: number,
  seed: number,
) {
  const groundY = layout.groundY
  const crowdHeight = Math.min(groundY * 0.45, 120)
  const crest = groundY - crowdHeight
  const segments = 8
  const amplitude = 6 + hype * 10
  ctx.save()
  ctx.fillStyle = `rgba(12, 19, 36, ${0.58 + hype * 0.18})`
  ctx.beginPath()
  ctx.moveTo(0, groundY)
  for (let i = 0; i <= segments; i += 1) {
    const x = (layout.width / segments) * i
    const offset =
      Math.sin(time / 520 + i * 0.9 + seed) * amplitude +
      Math.cos(time / 760 + i * 1.4 + seed * 0.6) * amplitude * 0.45
    const y = crest + offset
    ctx.lineTo(x, y)
  }
  ctx.lineTo(layout.width, groundY)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawGround(ctx: CanvasRenderingContext2D, layout: StageLayout, hype: number) {
  const gradient = ctx.createLinearGradient(0, layout.groundY - 48, 0, layout.height)
  gradient.addColorStop(0, `rgba(15, 23, 42, ${0.88 - hype * 0.16})`)
  gradient.addColorStop(1, '#020617')
  ctx.fillStyle = gradient
  ctx.fillRect(0, layout.groundY - 48, layout.width, layout.height - (layout.groundY - 48))

  ctx.fillStyle = `rgba(2, 6, 23, ${0.68 + hype * 0.12})`
  ctx.fillRect(0, layout.groundY, layout.width, layout.height - layout.groundY)

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = `rgba(56, 189, 248, ${0.12 + hype * 0.28})`
  ctx.beginPath()
  ctx.ellipse(
    layout.boss.centerX,
    layout.groundY - 6,
    layout.boss.width * (0.72 + hype * 0.1),
    18 + hype * 6,
    0,
    0,
    Math.PI * 2,
  )
  ctx.fill()
  ctx.restore()
}

function drawCatapult(
  ctx: CanvasRenderingContext2D,
  layout: StageLayout,
  sprite: HTMLImageElement,
  canvasWidth: number,
) {
  ctx.save()
  if (sprite.complete) {
    const catapultWidth = Math.min(220, canvasWidth * 0.32)
    const catapultHeight = catapultWidth * 0.55
    const catapultX = layout.baseX - catapultWidth * 0.55
    const catapultY = layout.baseY - catapultHeight + 18
    ctx.drawImage(sprite, catapultX, catapultY, catapultWidth, catapultHeight)
  } else {
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(layout.baseX - 34, layout.baseY - 54, 68, 48)
  }
  ctx.restore()
}

function drawBoss(
  ctx: CanvasRenderingContext2D,
  layout: StageLayout,
  visual: BossVisual,
  state: BossAnimationState,
  hype: number,
  time: number,
) {
  const bossRect = layout.boss
  const radius = Math.min(36, bossRect.width * 0.35)
  const idleBob = Math.sin(time / 680 + state.wobbleSeed) * (8 + hype * 6)
  const idleTilt = Math.sin(time / 920 + state.wobbleSeed * 1.3) * 0.035
  const stunLift = state.mood === 'stunned' ? Math.sin(time / 220) * 3 : 0
  const squash = state.squash
  const scaleX = 1 - squash * 0.32
  const scaleY = 1 + squash * 0.58

  ctx.save()
  ctx.translate(bossRect.centerX, bossRect.centerY + idleBob + stunLift)
  ctx.rotate(state.tilt + idleTilt)
  ctx.scale(scaleX, scaleY)
  ctx.translate(-bossRect.width / 2, -bossRect.height / 2)

  ctx.save()
  roundRect(ctx, 0, 0, bossRect.width, bossRect.height, radius)
  ctx.clip()

  if (visual.kind === 'composite') {
    const cleanedBase = getProcessedBaseImage(visual.base, visual.descriptor.face, visual.face)
    if (cleanedBase) {
      ctx.drawImage(cleanedBase, 0, 0, bossRect.width, bossRect.height)
    } else if (visual.base.complete) {
      ctx.drawImage(visual.base, 0, 0, bossRect.width, bossRect.height)
    }
    if (visual.face.complete) {
      drawCompositeFace(ctx, bossRect, visual.descriptor.face, visual.face)
    }
  } else if (visual.image.complete) {
    ctx.drawImage(visual.image, 0, 0, bossRect.width, bossRect.height)
  }
  ctx.restore()

  if (state.mood === 'stunned') {
    ctx.save()
    ctx.translate(bossRect.width * 0.5, -16)
    ctx.rotate(-0.35)
    ctx.fillStyle = 'rgba(249, 168, 212, 0.85)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(16, -18)
    ctx.lineTo(-12, -10)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  } else if (state.mood === 'flinch') {
    ctx.save()
    ctx.translate(bossRect.width * 0.12, bossRect.height * 0.12)
    ctx.fillStyle = 'rgba(248, 113, 113, 0.55)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()

  ctx.save()
  const shadowWidth = bossRect.width * (0.7 + squash * 0.22)
  const shadowHeight = 18 + hype * 6
  const shadowGradient = ctx.createRadialGradient(
    bossRect.centerX,
    layout.groundY - 4,
    6,
    bossRect.centerX,
    layout.groundY - 4,
    shadowWidth,
  )
  shadowGradient.addColorStop(0, `rgba(15, 23, 42, ${0.5 + state.hitFlash * 0.2})`)
  shadowGradient.addColorStop(1, 'rgba(15, 23, 42, 0)')
  ctx.fillStyle = shadowGradient
  ctx.beginPath()
  ctx.ellipse(bossRect.centerX, layout.groundY - 6, shadowWidth, shadowHeight, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawShockwaves(
  ctx: CanvasRenderingContext2D,
  shockwaves: Shockwave[],
  hype: number,
) {
  if (!shockwaves.length) return
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (const wave of shockwaves) {
    const progress = clamp01(wave.age / wave.duration)
    const radius = 18 + progress * STRENGTH_SHOCKWAVE_RADIUS[wave.strength]
    const alpha = (1 - progress) * (0.42 + hype * 0.26)
    const gradient = ctx.createRadialGradient(wave.x, wave.y, 6, wave.x, wave.y, radius)
    gradient.addColorStop(0, `rgba(248, 250, 252, ${alpha})`)
    gradient.addColorStop(0.55, `rgba(244, 114, 182, ${alpha * 0.75})`)
    gradient.addColorStop(1, 'rgba(37, 99, 235, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  if (!particles.length) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const particle of particles) {
    const lifeT = clamp01(particle.age / particle.life)
    const alpha = (1 - lifeT) * 0.9
    const lightness = 58 - lifeT * 30
    const sizeX = Math.max(1.4, particle.size)
    const sizeY = Math.max(1, particle.size * 0.6)
    ctx.fillStyle = `hsla(${particle.hue}, 85%, ${lightness}%, ${alpha})`
    ctx.beginPath()
    ctx.ellipse(particle.x, particle.y, sizeX, sizeY, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function getProcessedBaseImage(
  image: HTMLImageElement,
  descriptor: BossStageComposite['face'],
  faceImage: HTMLImageElement,
) {
  const cacheKey = buildBaseDescriptorKey(descriptor, faceImage)
  const cached = CLEANED_BASE_CACHE.get(image)
  if (cached && cached.key === cacheKey) {
    return cached.canvas
  }

  if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
    return cached?.canvas ?? null
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return cached?.canvas ?? null
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const brightness = (r + g + b) / 3
    const saturation = max - min
    if (a > 0 && brightness > 215 && saturation < 72) {
      data[i + 3] = 0
    }
  }
  ctx.putImageData(imageData, 0, 0)

  removeOriginalHeadFromBase(ctx, canvas, descriptor, faceImage)

  CLEANED_BASE_CACHE.set(image, { canvas, key: cacheKey })
  return canvas
}

function buildBaseDescriptorKey(
  descriptor: BossStageComposite['face'],
  faceImage: HTMLImageElement,
) {
  const rect = descriptor.rect
  const clip = descriptor.clipRadius ?? { x: 0.5, y: 0.68 }
  const values = [
    rect?.x ?? 0,
    rect?.y ?? 0,
    rect?.width ?? 0,
    rect?.height ?? 0,
    clip.x,
    clip.y,
    descriptor.rotation ?? 0,
    faceImage?.naturalWidth || faceImage?.width || 0,
    faceImage?.naturalHeight || faceImage?.height || 0,
  ]
  return values
    .map((value) => {
      if (!Number.isFinite(value)) return '0'
      return value.toFixed(4)
    })
    .join('|')
}

function removeOriginalHeadFromBase(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  descriptor: BossStageComposite['face'],
  faceImage: HTMLImageElement,
) {
  if (!descriptor?.rect) return

  const bossRect = {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    centerX: canvas.width / 2,
    centerY: canvas.height / 2,
  } as StageLayout['boss']

  const placement = resolveCompositeFacePlacement(descriptor, faceImage, bossRect)

  const faceWidth = canvas.width * placement.width
  const faceHeight = canvas.height * placement.height
  const centerX = canvas.width * (placement.x + placement.width / 2)
  const centerY = canvas.height * (placement.y + placement.height / 2)

  const clipX = descriptor.clipRadius?.x ?? 0.5
  const clipY = descriptor.clipRadius?.y ?? 0.68

  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.translate(centerX, centerY)
  if (descriptor.rotation) {
    ctx.rotate(descriptor.rotation)
  }
  ctx.beginPath()
  ctx.ellipse(
    0,
    0,
    faceWidth * clipX * 1.16,
    faceHeight * clipY * 0.8,
    0,
    0,
    Math.PI * 2,
  )
  ctx.fillStyle = '#000'
  ctx.fill()
  ctx.restore()
  ctx.globalCompositeOperation = 'source-over'
}

function deriveBossAspectRatio(visual: BossVisual): number {
  if (visual.kind === 'composite') {
    const width = visual.base.naturalWidth || visual.base.width
    const height = visual.base.naturalHeight || visual.base.height
    if (width > 0 && height > 0) {
      return height / width
    }
  } else {
    const width = visual.image.naturalWidth || visual.image.width
    const height = visual.image.naturalHeight || visual.image.height
    if (width > 0 && height > 0) {
      return height / width
    }
  }
  return DEFAULT_BOSS_ASPECT_RATIO
}

function resolveCompositeFacePlacement(
  descriptor: BossStageComposite['face'],
  faceImage: HTMLImageElement,
  bossRect: StageLayout['boss'],
) {
  const rect = descriptor.rect
  const faceAspect =
    faceImage.naturalWidth > 0 && faceImage.naturalHeight > 0
      ? faceImage.naturalHeight / faceImage.naturalWidth
      : 1.1
  const baseReference = rect.width ?? 0.44
  const width = clamp(baseReference * 1.24, 0.5, 0.68)
  const projectedHeight = width * faceAspect * (bossRect.width / bossRect.height || 1)
  const height = clamp(projectedHeight * 1.08, 0.34, 0.6)

  const rawCenter = (rect.x ?? 0.48) + (rect.width ?? baseReference) / 2
  const center = clamp(rawCenter, 0.43, 0.57)
  const x = clamp(center - width / 2 - 0.2, 0.06 + 0.1 , 0.94 - width + 0.1)

  const rawBaseline = (rect.y ?? 0.02) + (rect.height ?? baseReference)
  const baseline = clamp(rawBaseline + 0.06, 0.42, 0.66)
  const y = clamp(baseline - height, -0.02, 0.22)

  return { x, y, width, height }
}

function drawCompositeFace(
  ctx: CanvasRenderingContext2D,
  bossRect: StageLayout['boss'],
  descriptor: BossStageComposite['face'],
  faceImage: HTMLImageElement,
) {
  const placement = resolveCompositeFacePlacement(descriptor, faceImage, bossRect)
  const faceWidth = bossRect.width * placement.width
  const faceHeight = bossRect.height * placement.height
  const faceX = bossRect.width * placement.x
  const faceY = bossRect.height * placement.y
  const radiusX = faceWidth * (descriptor.clipRadius?.x ?? 0.5)
  const radiusY = faceHeight * (descriptor.clipRadius?.y ?? 0.5)

  ctx.save()
  ctx.translate(faceX + faceWidth / 2, faceY + faceHeight / 2)
  if (descriptor.rotation) {
    ctx.rotate(descriptor.rotation)
  }
  ctx.beginPath()
  ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(faceImage, -faceWidth / 2, -faceHeight / 2, faceWidth, faceHeight)
  ctx.restore()
}

function drawSling(ctx: CanvasRenderingContext2D, layout: StageLayout, slingPoint: { x: number; y: number }) {
  const { left, right } = layout.slingAnchors
  ctx.lineWidth = 6
  ctx.strokeStyle = '#fbbf24'
  ctx.beginPath()
  ctx.moveTo(left.x, left.y)
  ctx.quadraticCurveTo((left.x + slingPoint.x) / 2, slingPoint.y - 16, slingPoint.x, slingPoint.y)
  ctx.quadraticCurveTo((right.x + slingPoint.x) / 2, slingPoint.y - 16, right.x, right.y)
  ctx.stroke()

  ctx.lineWidth = 2
  ctx.strokeStyle = '#fde68a'
  ctx.beginPath()
  ctx.moveTo(left.x + 4, left.y - 2)
  ctx.lineTo(slingPoint.x, slingPoint.y)
  ctx.lineTo(right.x - 4, right.y - 2)
  ctx.stroke()
}

function drawLoadedProjectile(
  ctx: CanvasRenderingContext2D,
  slingPoint: { x: number; y: number },
  sprite: HTMLImageElement,
  spriteSize?: { width: number; height: number },
) {
  ctx.save()
  ctx.translate(slingPoint.x, slingPoint.y)
  ctx.rotate(-Math.PI / 10)
  const width = spriteSize?.width ?? 32
  const height = spriteSize?.height ?? 32
  if (sprite.complete) {
    ctx.drawImage(sprite, -width / 2, -height / 2, width, height)
  } else {
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawFlyingProjectile(
  ctx: CanvasRenderingContext2D,
  projectile: Projectile,
  sprite: HTMLImageElement,
  spriteSize?: { width: number; height: number },
) {
  ctx.save()
  ctx.translate(projectile.x, projectile.y)
  ctx.rotate(Math.atan2(projectile.vy, projectile.vx))
  const width = spriteSize?.width ?? 36
  const height = spriteSize?.height ?? 36
  if (sprite.complete) {
    ctx.drawImage(sprite, -width / 2, -height / 2, width, height)
  } else {
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#38bdf8'
    ctx.stroke()
  }
  ctx.restore()
}

function isCollidingWithBoss(projectile: Projectile, boss: StageLayout['boss']) {
  const withinX = projectile.x >= boss.x && projectile.x <= boss.x + boss.width
  const withinY = projectile.y >= boss.y && projectile.y <= boss.y + boss.height
  return withinX && withinY
}

function updateBossAnimation(state: BossAnimationState, deltaMs: number) {
  const deltaFactor = deltaMs / 16.6667
  state.timer += deltaMs
  state.hitFlash = Math.max(0, state.hitFlash - deltaMs / 520)
  state.squash = Math.max(0, state.squash - deltaMs / 680)
  state.tilt += state.tiltVelocity * deltaFactor
  state.tilt *= Math.pow(0.9, deltaFactor)
  state.tiltVelocity *= Math.pow(0.78, deltaFactor)
  if (Math.abs(state.tilt) < 0.002) {
    state.tilt = 0
  }
  if (state.mood === 'flinch' && state.timer > 360) {
    state.mood = 'idle'
    state.timer = 0
  }
  if (state.mood === 'stunned' && state.timer > 1400) {
    state.mood = 'idle'
    state.timer = 0
  }
}

function updateShockwaves(shockwaves: Shockwave[], deltaMs: number) {
  for (let i = shockwaves.length - 1; i >= 0; i -= 1) {
    const wave = shockwaves[i]
    wave.age += deltaMs
    if (wave.age >= wave.duration) {
      shockwaves.splice(i, 1)
    }
  }
}

function updateParticles(
  particles: Particle[],
  deltaMs: number,
  layout: StageLayout,
  deltaFactor: number,
) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i]
    particle.age += deltaMs
    if (particle.age >= particle.life) {
      particles.splice(i, 1)
      continue
    }
    particle.vy += PARTICLE_GRAVITY * deltaFactor
    particle.vx *= Math.pow(0.985, deltaFactor)
    particle.vy *= Math.pow(0.982, deltaFactor)
    particle.x += particle.vx * deltaFactor
    particle.y += particle.vy * deltaFactor
    if (particle.y >= layout.groundY - 6) {
      particle.y = layout.groundY - 6
      if (Math.abs(particle.vy) > 0.45) {
        particle.vy *= -0.35
        particle.vx *= 0.72
        particle.size *= 0.88
      } else {
        particles.splice(i, 1)
      }
    }
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function lerpColor(from: string, to: string, t: number) {
  const start = hexToRgb(from)
  const end = hexToRgb(to)
  const clamped = clamp01(t)
  const r = Math.round(lerp(start.r, end.r, clamped))
  const g = Math.round(lerp(start.g, end.g, clamped))
  const b = Math.round(lerp(start.b, end.b, clamped))
  return `rgb(${r}, ${g}, ${b})`
}

function hexToRgb(hex: string) {
  let normalized = hex.replace('#', '')
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('')
  }
  const value = parseInt(normalized, 16)
  if (Number.isNaN(value)) {
    return { r: 0, g: 0, b: 0 }
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function useBossVisual(boss: Boss, parodyMode: boolean): BossVisual {
  return useMemo(() => {
    const fallbackSprite = parodyMode ? boss.parodyImage : boss.image
    const faceSrc =
      boss.stageComposite?.face?.src ??
      boss.assets?.face ??
      fallbackSprite

    if (faceSrc) {
      const descriptor: BossStageComposite = {
        base: UNIVERSAL_BODY_SPRITE,
        face: {
          src: faceSrc,
          rect: { ...UNIVERSAL_FACE_RECT },
          clipRadius: { ...UNIVERSAL_FACE_CLIP },
          rotation: UNIVERSAL_FACE_ROTATION,
        },
      }
      return {
        kind: 'composite',
        base: createImage(descriptor.base),
        face: createImage(descriptor.face.src),
        descriptor,
      }
    }

    return {
      kind: 'sprite',
      image: createImage(fallbackSprite),
    }
  }, [boss, parodyMode])
}

function useCatapultSprite() {
  return useMemo(() => {
    const image = new Image()
    image.src = '/img/catapult.svg'
    image.crossOrigin = 'anonymous'
    return image
  }, [])
}

function useThrowableSprite(imageUrl: string) {
  return useMemo(() => {
    const image = new Image()
    image.src = imageUrl
    image.crossOrigin = 'anonymous'
    return image
  }, [imageUrl])
}

function createImage(src: string) {
  const image = new Image()
  image.src = src
  image.crossOrigin = 'anonymous'
  return image
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export type { CollisionResult }
