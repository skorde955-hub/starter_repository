import type { Boss, BossStageComposite } from '../models/Boss'

const apiBase =
  (import.meta?.env?.VITE_API_BASE_URL as string | undefined)?.trim() ?? ''
const configuredUploadBase =
  (import.meta?.env?.VITE_UPLOAD_BASE_URL as string | undefined)?.trim() ?? ''

const uploadHost = (() => {
  if (configuredUploadBase) return stripTrailingSlash(configuredUploadBase)
  if (!apiBase) return ''
  const withoutApi = apiBase.replace(/\/api\/?$/, '')
  return stripTrailingSlash(withoutApi)
})()

function stripTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export function resolveAssetUrl(path?: string | null) {
  if (!path) return path ?? undefined
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/uploads') && uploadHost) {
    return `${uploadHost}${path}`
  }
  return path
}

export function normalizeBossAssets(boss: Boss): Boss {
  const normalizedStage = boss.stageComposite
    ? normalizeStageComposite(boss.stageComposite)
    : undefined
  const normalizedAssets = boss.assets
    ? {
        ...boss.assets,
        body: resolveAssetUrl(boss.assets.body) ?? boss.assets.body,
        face: resolveAssetUrl(boss.assets.face) ?? boss.assets.face,
        mugshot: resolveAssetUrl(boss.assets.mugshot) ?? boss.assets.mugshot,
      }
    : undefined

  return {
    ...boss,
    image: resolveAssetUrl(boss.image) ?? boss.image,
    parodyImage: resolveAssetUrl(boss.parodyImage) ?? boss.parodyImage,
    stageComposite: normalizedStage,
    assets: normalizedAssets,
  }
}

function normalizeStageComposite(stage: BossStageComposite): BossStageComposite {
  return {
    ...stage,
    base: resolveAssetUrl(stage.base) ?? stage.base,
    face: {
      ...stage.face,
      src: resolveAssetUrl(stage.face.src) ?? stage.face.src,
    },
  }
}
