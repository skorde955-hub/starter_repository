import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { bossApi } from '../api/BossApi'
import type { Boss, CreateBossRequest } from '../models/Boss'

interface BossContextValue {
  bosses: Boss[]
  loading: boolean
  error: string | null
  addBoss: (payload: CreateBossRequest) => Promise<Boss>
  recordHit: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

const BossContext = createContext<BossContextValue | undefined>(undefined)

export function BossProvider({ children }: { children: ReactNode }) {
  const [bosses, setBosses] = useState<Boss[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await bossApi.list()
      setBosses(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load bosses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addBoss = useCallback(
    async (payload: CreateBossRequest) => {
      const boss = await bossApi.create(payload)
      setBosses((current) => [...current, boss])
      return boss
    },
    [setBosses],
  )

  const recordHit = useCallback(async (id: string) => {
    try {
      const updated = await bossApi.recordHit(id)
      setBosses((current) =>
        current.map((boss) => (boss.id === updated.id ? updated : boss)),
      )
    } catch (err) {
      console.warn('Failed to record hit', err)
    }
  }, [])

  const value = useMemo<BossContextValue>(
    () => ({
      bosses,
      loading,
      error,
      addBoss,
      recordHit,
      refresh,
    }),
    [bosses, loading, error, addBoss, recordHit, refresh],
  )

  return <BossContext.Provider value={value}>{children}</BossContext.Provider>
}

export function useBosses() {
  const ctx = useContext(BossContext)
  if (!ctx) {
    throw new Error('useBosses must be used within a BossProvider')
  }
  return ctx
}
