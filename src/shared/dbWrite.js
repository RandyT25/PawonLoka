import { supabase } from '../lib/supabase'
import { offlineStore } from '../lib/offlineStore'

// Offline-safe write: always queues on any network failure, 5s hard timeout.
// Shared across apps (POS, customer self-order) so every write to Supabase
// gets the same offline-queue safety net, not just the ones written from POS.
export async function dbWrite(table, op, payload, match = null) {
  function isNetworkError(e) {
    if (!navigator.onLine) return true
    const msg = (e?.message || '').toLowerCase()
    return msg.includes('timeout') || msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch') || msg.includes('connection')
  }

  // Fast path: definitely offline
  if (!navigator.onLine) {
    await offlineStore.enqueue({ table, op, payload, match })
    window.dispatchEvent(new Event('offline-queue-updated'))
    return true
  }

  try {
    // Hard 5s timeout — if no internet (WiFi with no data), never hang
    const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
    let q = supabase.from(table)[op](payload)
    if (match) Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v) })
    const { error } = await Promise.race([q, timer])
    if (error) throw error
    return true
  } catch(e) {
    if (isNetworkError(e)) {
      // No real internet — queue for later sync
      await offlineStore.enqueue({ table, op, payload, match })
      window.dispatchEvent(new Event('offline-queue-updated'))
      return true
    }
    console.error('[dbWrite]', table, op, e?.message || e)
    return false // real DB error (column missing, RLS, etc.)
  }
}
