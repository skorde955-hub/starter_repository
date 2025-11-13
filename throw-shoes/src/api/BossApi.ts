import type { Boss, CreateBossRequest } from '../models/Boss'

interface BossListResponse {
  bosses: Boss[]
}

interface BossResponse {
  boss: Boss
}

const DEFAULT_API_BASE = '/api'
const apiBaseUrl = (() => {
  const raw = import.meta?.env?.VITE_API_BASE_URL ?? DEFAULT_API_BASE
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_API_BASE
  return raw.replace(/\/+$/, '') || DEFAULT_API_BASE
})()

class BossApi {
  private readonly baseUrl = `${apiBaseUrl}/bosses`

  async list(): Promise<Boss[]> {
    const response = await fetch(this.baseUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch bosses (${response.status})`)
    }
    const payload = (await response.json()) as BossListResponse
    return payload.bosses
  }

  async create(payload: CreateBossRequest): Promise<Boss> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const message = await this.safeReadError(response)
      throw new Error(message ?? 'Unable to add boss')
    }
    const data = (await response.json()) as BossResponse
    return data.boss
  }

  async recordHit(id: string): Promise<Boss> {
    const response = await fetch(`${this.baseUrl}/${id}/hit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to record hit for ${id}`)
    }
    const data = (await response.json()) as BossResponse
    return data.boss
  }

  private async safeReadError(response: Response): Promise<string | null> {
    try {
      const payload = await response.json()
      if (typeof payload.error === 'string') {
        return payload.error
      }
      return null
    } catch {
      return null
    }
  }
}

export const bossApi = new BossApi()
