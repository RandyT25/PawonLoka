import { useState, useEffect } from 'react'

export default function OfflineBar({ pendingCount = 0, syncing = false, onSyncNow }) {
  const [offline, setOffline] = useState(!navigator.onLine)
  const [showBack, setShowBack] = useState(false)
  const [backTimer, setBackTimer] = useState(null)

  useEffect(() => {
    function goOffline() { setOffline(true); setShowBack(false); clearTimeout(backTimer) }
    function goOnline()  {
      setOffline(false); setShowBack(true)
      const t = setTimeout(() => setShowBack(false), 4000)
      setBackTimer(t)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      clearTimeout(backTimer)
    }
  }, [])

  // Also show whenever something is queued, even if the browser still thinks
  // it's "online" — on a bad-but-technically-connected signal, the offline/online
  // events often never fire, so pendingCount is the only reliable signal left.
  const visible = offline || showBack || syncing || pendingCount > 0

  if (!visible) return null

  let bg      = offline ? '#DE350B' : '#00875A'
  let icon    = offline ? '📵' : syncing ? '🔄' : '✅'
  let message = offline
    ? `Offline${pendingCount > 0 ? ` — ${pendingCount} pesanan tersimpan, akan sync otomatis` : ' — pesanan akan tersimpan otomatis'}`
    : syncing
      ? `Menyinkronkan ${pendingCount > 0 ? pendingCount + ' item' : ''}...`
      : pendingCount > 0
        ? `${pendingCount} pesanan tertunda, akan sync otomatis`
        : 'Sinkronisasi selesai ✓'

  if (syncing) bg = '#F59E0B'
  else if (!offline && pendingCount > 0) bg = '#F59E0B'

  return (
    <div style={{
      background: bg, color: '#fff', fontSize: 12, fontWeight: 700,
      textAlign: 'center', padding: '6px 16px', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      transition: 'background 0.3s',
    }}>
      <span>{icon}</span> {message}
      {pendingCount > 0 && !syncing && onSyncNow && (
        <button onClick={onSyncNow}
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontWeight: 800,
            fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer' }}>
          Sync Sekarang
        </button>
      )}
    </div>
  )
}
