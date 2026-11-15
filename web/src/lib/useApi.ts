import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from './api'

interface QueryState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
}

export function useApi<T>(path: string | null) {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    error: null,
    loading: Boolean(path),
  })
  const [nonce, setNonce] = useState(0)
  const pathRef = useRef(path)
  pathRef.current = path

  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    setState((previous) => ({ data: previous.data, error: null, loading: true }))
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setState({ data, error: null, loading: false })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        const apiError =
          error instanceof ApiError ? error : new ApiError(0, 'network', '网络异常，请检查服务是否在运行')
        setState({ data: null, error: apiError, loading: false })
      })
    return () => controller.abort()
  }, [path, nonce])

  return {
    ...state,
    reload: () => setNonce((value) => value + 1),
  }
}

export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, size }
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useInterval(callback: () => void, delay: number | null): void {
  const saved = useRef(callback)
  saved.current = callback
  useEffect(() => {
    if (delay === null) return
    const timer = window.setInterval(() => saved.current(), delay)
    return () => window.clearInterval(timer)
  }, [delay])
}
