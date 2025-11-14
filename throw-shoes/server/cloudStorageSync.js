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
  constructor({ bucket, objectName }) {
    this.bucket = bucket
    this.objectName = objectName || 'bosses.json'
  }

  get isEnabled() {
    return Boolean(this.bucket)
  }

  async restore(destination) {
    if (!this.isEnabled) return false
    try {
      const token = await fetchAccessToken()
      const url = this.buildMediaUrl()
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
      const url = this.buildUploadUrl()
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

  buildMediaUrl() {
    return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(this.objectName)}?alt=media`
  }

  buildUploadUrl() {
    return `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?uploadType=media&name=${encodeURIComponent(this.objectName)}`
  }
}
