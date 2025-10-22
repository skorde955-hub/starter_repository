import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { BossProfile } from '../data/bosses'
import type { ImpactStrength, Throwable } from '../data/throwables'
import { useAnimationFrame } from '../hooks/useAnimationFrame'

const GRAVITY = 0.48
const MAX_TRAIL_POINTS = 60
const MIN_PULL_DISTANCE = 12
const MAX_PULL_DISTANCE = 260
const RESET_DELAY_MS = 320

interface CanvasStageProps {
  boss: BossProfile
  throwable: Throwable
  parodyMode: boolean
  aimAssist: boolean
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

  const bossSprite = useBossSprite(boss, parodyMode)
  const catapultSprite = useCatapultSprite()
  const projectileSprite = useThrowableSprite(throwable.image)

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
  }, [boss.id, throwable.id, clearProjectile])

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
      layoutRef.current = computeStageLayout(width, height)
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useAnimationFrame(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pixelRatio = window.devicePixelRatio || 1
    const width = canvas.width / pixelRatio
    const height = canvas.height / pixelRatio
    const layout = computeStageLayout(width, height)
    layoutRef.current = layout

    ctx.save()
    ctx.scale(pixelRatio, pixelRatio)

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#0f172a')
    gradient.addColorStop(1, '#020617')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    // Ground
    ctx.fillStyle = '#111827'
    ctx.fillRect(0, layout.groundY, width, height - layout.groundY)
    ctx.fillStyle = '#0b1220'
    ctx.fillRect(0, layout.groundY + 18, width, height - (layout.groundY + 18))

    // Catapult base
    if (catapultSprite.complete) {
      const catapultWidth = Math.min(220, width * 0.32)
      const catapultHeight = catapultWidth * 0.55
      const catapultX = layout.baseX - catapultWidth * 0.55
      const catapultY = layout.baseY - catapultHeight + 18
      ctx.drawImage(catapultSprite, catapultX, catapultY, catapultWidth, catapultHeight)
    }

    // Boss avatar
    const bossRect = layout.boss
    const bossRadius = Math.min(36, bossRect.width * 0.35)
    ctx.save()
    roundRect(ctx, bossRect.x, bossRect.y, bossRect.width, bossRect.height, bossRadius)
    ctx.clip()
    ctx.fillStyle = '#111827'
    ctx.fillRect(bossRect.x, bossRect.y, bossRect.width, bossRect.height)
    if (bossSprite.complete) {
      ctx.drawImage(bossSprite, bossRect.x, bossRect.y, bossRect.width, bossRect.height)
    }
    ctx.restore()
    ctx.lineWidth = 4
    ctx.strokeStyle = parodyMode ? '#f97316b3' : '#38bdf8b3'
    roundRect(ctx, bossRect.x, bossRect.y, bossRect.width, bossRect.height, bossRadius)
    ctx.stroke()

    // Sling cords
    const slingPoint = isDraggingRef.current && hoverRef.current ? hoverRef.current : layout.slingRestPoint
    drawSling(ctx, layout, slingPoint)

    // Aim preview
    if (isDraggingRef.current && hoverRef.current) {
      const launchPreview = resolveLaunch(layout, hoverRef.current, aimAssist, throwable)
      if (launchPreview) {
        const prediction = simulateTrajectory(launchPreview, layout)
        drawPrediction(ctx, prediction)
      }
    }

    const projectile = projectileRef.current

    if (!projectile || !projectile.active) {
      drawLoadedProjectile(ctx, slingPoint, projectileSprite)
      trailRef.current = []
    }

    if (projectile && projectile.active) {
      projectile.age += 1
      projectile.vx *= 1 - projectile.drag
      projectile.vy += GRAVITY - projectile.lift
      const wobbleX = projectile.wobble ? Math.sin(projectile.age * 0.35) * projectile.wobble * 6 : 0
      const wobbleY = projectile.wobble ? Math.cos(projectile.age * 0.25) * projectile.wobble * 4 : 0
      projectile.x += projectile.vx + wobbleX * 0.4
      projectile.y += projectile.vy + wobbleY

      const trail = trailRef.current
      trail.push({ x: projectile.x, y: projectile.y })
      if (trail.length > MAX_TRAIL_POINTS) {
        trail.shift()
      }

      drawTrail(ctx, trail)
      drawFlyingProjectile(ctx, projectile, projectileSprite)

      if (isCollidingWithBoss(projectile, layout.boss)) {
        projectile.active = false
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

    ctx.restore()
  }, true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ensureLayout = (rect: DOMRect) => {
      const layout = computeStageLayout(rect.width, rect.height)
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

function computeStageLayout(width: number, height: number): StageLayout {
  const groundY = Math.round(height - Math.min(96, height * 0.22))
  const baseX = Math.round(width * 0.22)
  const baseY = groundY - 32
  const bossWidth = Math.min(180, width * 0.26)
  const bossHeight = bossWidth * 1.32
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

function drawTrail(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return
  const gradient = ctx.createLinearGradient(
    points[0].x,
    points[0].y,
    points[points.length - 1].x,
    points[points.length - 1].y,
  )
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.15)')
  gradient.addColorStop(1, 'rgba(56, 189, 248, 0.75)')
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const point of points) {
    ctx.lineTo(point.x, point.y)
  }
  ctx.strokeStyle = gradient
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawPrediction(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
  if (!points.length) return
  ctx.fillStyle = 'rgba(56, 189, 248, 0.35)'
  points.forEach((point, index) => {
    const alpha = Math.max(0.15, 1 - index / points.length)
    ctx.fillStyle = `rgba(56, 189, 248, ${alpha * 0.45})`
    ctx.beginPath()
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2)
    ctx.fill()
  })
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
) {
  ctx.save()
  ctx.translate(slingPoint.x, slingPoint.y)
  ctx.rotate(-Math.PI / 10)
  if (sprite.complete) {
    ctx.drawImage(sprite, -16, -16, 32, 32)
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
) {
  ctx.save()
  ctx.translate(projectile.x, projectile.y)
  ctx.rotate(Math.atan2(projectile.vy, projectile.vx))
  if (sprite.complete) {
    ctx.drawImage(sprite, -18, -18, 36, 36)
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

function useBossSprite(boss: BossProfile, parodyMode: boolean) {
  const spriteUrl = parodyMode ? boss.parodyImage : boss.image
  return useMemo(() => {
    const image = new Image()
    image.src = spriteUrl
    image.crossOrigin = 'anonymous'
    return image
  }, [spriteUrl])
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
