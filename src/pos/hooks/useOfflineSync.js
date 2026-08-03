import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { offlineStore } from '../../lib/offlineStore'

const RETRY_INTERVAL_MS = 30000

export default function useOfflineSync() {
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  const refreshCount = useCallback(async () => {
    const q = await offlineStore.getQueue()
    setPendingCount(q.length)
  }, [])

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return
    const queue = await offlineStore.getQueue()
    if (!queue.length) return
    syncingRef.current = true
    setSyncing(true)
    try {
      for (const entry of queue) {
        try {
          // Hard 5s timeout, mirroring dbWrite.js — on "bad signal" wifi a
          // request can hang instead of erroring, which would otherwise wedge
          // syncingRef true forever and silently break both the 30s poll and
          // every future "Sync Sekarang" click.
          const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
          if (entry.op === 'insert') {
            const { error } = await Promise.race([supabase.from(entry.table).insert(entry.payload), timer])
            // Duplicate key errors mean it was already synced — treat as success
            if (error && !error.message?.includes('duplicate')) throw error
          } else if (entry.op === 'update') {
            let q = supabase.from(entry.table).update(entry.payload)
            if (entry.match) Object.entries(entry.match).forEach(([k, v]) => { q = q.eq(k, v) })
            const { error } = await Promise.race([q, timer])
            if (error) throw error
          } else if (entry.op === 'delete') {
            let q = supabase.from(entry.table).delete()
            if (entry.match) Object.entries(entry.match).forEach(([k, v]) => { q = q.eq(k, v) })
            const { error } = await Promise.race([q, timer])
            if (error) throw error
          } else if (entry.op === 'upsert') {
            const { error } = await Promise.race([supabase.from(entry.table).upsert(entry.payload), timer])
            if (error) throw error
          }
          await offlineStore.dequeue(entry.id)
        } catch(e) {
          console.error('[sync] failed for entry', entry.table, entry.op, e)
          // Keep it queued and quietly retry later — never surfaced to the cashier
          // as an error. The attempt count is just diagnostic breadcrumb for
          // whoever inspects IndexedDB later if something's genuinely stuck.
          await offlineStore.updateEntry({ ...entry, attempts: (entry.attempts || 0) + 1 })
        }
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
    await refreshCount()
  }, [refreshCount])

  useEffect(() => {
    // Read initial pending count, and try to drain any queue left over from
    // a previous session (e.g. the app reloaded while items were still queued —
    // that shouldn't require waiting for another genuine online transition).
    refreshCount()
    syncNow()

    function onOnline() { syncNow() }
    window.addEventListener('online', onOnline)

    // Update badge whenever dbWrite queues something
    window.addEventListener('offline-queue-updated', refreshCount)

    // Fallback retry independent of the `online` event — on "bad signal" (still
    // associated to wifi, but requests to Supabase are failing/timing out) the
    // browser's online/offline events often never fire, so this is the real
    // mechanism that drains the queue in that scenario. syncNow() itself is a
    // cheap no-op when the queue is empty, so this can run unconditionally.
    const interval = setInterval(syncNow, RETRY_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline-queue-updated', refreshCount)
      clearInterval(interval)
    }
  }, [syncNow, refreshCount])

  return { pendingCount, syncing, syncNow }
}
