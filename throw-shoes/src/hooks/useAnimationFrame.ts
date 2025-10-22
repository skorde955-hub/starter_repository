import { useEffect, useRef } from 'react'

type Callback = (time: number) => void

export function useAnimationFrame(callback: Callback, active = true) {
  const callbackRef = useRef<Callback>(callback)
  const frameId = useRef<number | null>(null)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!active) {
      if (frameId.current !== null) {
        cancelAnimationFrame(frameId.current)
        frameId.current = null
      }
      return undefined
    }

    const loop = (time: number) => {
      callbackRef.current(time)
      frameId.current = requestAnimationFrame(loop)
    }

    frameId.current = requestAnimationFrame(loop)

    return () => {
      if (frameId.current !== null) {
        cancelAnimationFrame(frameId.current)
        frameId.current = null
      }
    }
  }, [active])
}
