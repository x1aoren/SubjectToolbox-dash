import { useCallback, useEffect, useState } from 'react'
import { put } from './api'
import { useApi } from './useApi'
import type { ConfigPayload, RemoteConfig } from './types'

export function useDraftConfig() {
  const { data, loading, error, reload } = useApi<ConfigPayload>('/api/config')
  const [draft, setDraft] = useState<RemoteConfig | null>(null)
  const [baseline, setBaseline] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data) return
    setDraft(structuredClone(data.draft))
    setBaseline(JSON.stringify(data.draft))
  }, [data])

  const dirty = Boolean(draft) && JSON.stringify(draft) !== baseline

  const save = useCallback(async (): Promise<void> => {
    if (!draft) return
    setSaving(true)
    try {
      await put<ConfigPayload>('/api/config/draft', { config: draft })
      setBaseline(JSON.stringify(draft))
      reload()
    } finally {
      setSaving(false)
    }
  }, [draft, reload])

  const reset = useCallback(() => {
    if (data) {
      setDraft(structuredClone(data.draft))
      setBaseline(JSON.stringify(data.draft))
    }
  }, [data])

  return { payload: data, draft, setDraft, dirty, saving, save, reset, reload, loading, error }
}
