import fs from 'fs'
import path from 'path'

const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'
const METADATA_HEADERS = { 'Metadata-Flavor': 'Google' }
const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write'

let cachedToken = null
let metadataUnavailable = false

async function fetchAccessToken() {
  if (metadataUnavailable) {
    throw new Error('metadata server unavailable')
  }
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }
  const response = await fetch(`${METADATA_TOKEN_URL}?scopes=${encodeURIComponent(STORAGE_SCOPE)}`, {
    headers: METADATA_HEADERS,
  })
  if (!response.ok) {
    metadataUnavailable = true
    throw new Error(`metadata token request failed (${response.status})`)
  }
  const payload = await response.json()
  cachedToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max((payload.expires_in ?? 0) - 60, 30) * 1000,
  }
  return cachedToken.token
}

export class CloudStorageSync {
  constructor({ bucket, objectName = 'bosses.json' }) {
    this.bucket = bucket
    this.objectName = objectName
  }

  get isEnabled() {
    return Boolean(this.bucket)
  }

  async restore(destination) {
    if (!this.isEnabled) return false
    try {
      const token = await fetchAccessToken()
      const url = this.buildMediaUrl(this.objectName)
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 404) {
        return false
      }
      if (!response.ok) {
        throw new Error(`download failed (${response.status})`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      await fs.promises.mkdir(path.dirname(destination), { recursive: true })
      await fs.promises.writeFile(destination, buffer)
      return true
    } catch (error) {
      console.warn('[storage-sync] restore skipped:', error.message)
      return false
    }
  }

  async backup(source) {
    if (!this.isEnabled) return false
    try {
      const token = await fetchAccessToken()
      const body = await fs.promises.readFile(source)
      const url = this.buildUploadUrl(this.objectName)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body,
      })
      if (!response.ok) {
        throw new Error(`upload failed (${response.status})`)
      }
      return true
    } catch (error) {
      console.warn('[storage-sync] backup skipped:', error.message)
      return false
    }
  }

  async restoreUploads(localDir) {
    if (!this.isEnabled) return false
    try {
      const token = await fetchAccessToken()
      await fs.promises.mkdir(localDir, { recursive: true })
      const objects = await this.listObjects(token, 'uploads/')
      await Promise.all(
        objects.map(async (item) => {
          const relative = item.name.replace(/^uploads\//, '')
          if (!relative) return
          const target = path.join(localDir, relative)
          await fs.promises.mkdir(path.dirname(target), { recursive: true })
          const response = await fetch(this.buildMediaUrl(item.name), {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!response.ok) {
            throw new Error(`download failed (${response.status}) for ${item.name}`)
          }
          const buffer = Buffer.from(await response.arrayBuffer())
          await fs.promises.writeFile(target, buffer)
        }),
      )
      return true
    } catch (error) {
      console.warn('[storage-sync] restore uploads skipped:', error.message)
      return false
    }
  }

  async syncUploads(localDir) {
    if (!this.isEnabled) return false
    try {
      const token = await fetchAccessToken()
      const files = await collectFiles(localDir)
      await Promise.all(
        files.map(async (file) => {
          const relative = path.relative(localDir, file).replace(/\\/g, '/')
          const objectName = `uploads/${relative}`
          const body = await fs.promises.readFile(file)
          const response = await fetch(this.buildUploadUrl(objectName), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': detectContentType(file),
            },
            body,
          })
          if (!response.ok) {
            throw new Error(`upload failed (${response.status}) for ${objectName}`)
          }
        }),
      )
      return true
    } catch (error) {
      console.warn('[storage-sync] sync uploads skipped:', error.message)
      return false
    }
  }

  async listObjects(token, prefix) {
    const results = []
    let pageToken
    do {
      const params = new URLSearchParams({ prefix })
      if (pageToken) params.set('pageToken', pageToken)
      const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o?${params.toString()}`
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        throw new Error(`list failed (${response.status})`)
      }
      const payload = await response.json()
      const items = payload.items ?? []
      results.push(...items)
      pageToken = payload.nextPageToken
    } while (pageToken)
    return results
  }

  buildMediaUrl(objectName) {
    return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(objectName)}?alt=media`
  }

  buildUploadUrl(objectName) {
    return `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`
  }
}

async function collectFiles(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return collectFiles(full)
      }
      return [full]
    }),
  )
  return files.flat()
}

function detectContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.json':
      return 'application/json'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}
