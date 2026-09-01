import { useState } from 'react'
import { supabase } from '../../../lib/supabase'

const fmt = n => Number(n || 0).toLocaleString('id-ID')

// Read-only preview of what a historical stock rebuild would change.
// Applying the adjustments requires a manager PIN.
export default function InvRebuildPreview() {
  const [rows,      setRows]      = useState([])
  const [message,   setMessage]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [applying,  setApplying]  = useState(false)
  const [applied,   setApplied]   = useState(false)

  // PIN approval state
  const [pinStep,   setPinStep]   = useState(false)
  const [pin,       setPin]       = useState('')
  const [pinError,  setPinError]  = useState('')

  async function preview() {
    setLoading(true); setMessage(''); setRows([]); setApplied(false); setPinStep(false)
    const [{ data: sessions }, { data: ingredients }, { data: movements }] = await Promise.all([
      supabase.from('stock_opname').select('*').gte('date', '2026-08-01').order('date').limit(1),
      supabase.from('ingredients').select('id,name,unit,stock'),
      supabase.from('stock_movements').select('ingredient_id,qty,date').gte('date', '2026-08-01'),
    ])
    const baseline = sessions?.[0]
    if (!baseline) {
      setMessage('No stock opname on or after 1 Aug was found. No rebuild can be proposed.')
      setLoading(false); return
    }
    const base = Object.fromEntries((baseline.items || []).map(i => [i.ingredient_id, Number(i.actual_qty || 0)]))
    const moved = {}
    ;(movements || []).filter(m => m.date > baseline.date).forEach(m => {
      moved[m.ingredient_id] = (moved[m.ingredient_id] || 0) + Number(m.qty || 0)
    })
    const computed = (ingredients || []).map(i => {
      const opening    = base[i.id]
      const calculated = opening == null ? null : opening + (moved[i.id] || 0)
      return { ...i, opening, calculated, delta: calculated == null ? null : calculated - Number(i.stock || 0) }
    }).filter(r => r.delta !== 0 || r.opening == null)

    setRows(computed)
    setMessage(`Preview uses ${baseline.id} (${baseline.date}). ${computed.length} ingredient(s) differ from current stock.`)
    setLoading(false)
  }

  async function applyRebuild() {
    const { data: settings } = await supabase.from('settings').select('pos_behaviour').maybeSingle()
    const managerPin = settings?.pos_behaviour?.manager_pin || '9999'
    if (pin !== managerPin) { setPinError('PIN salah. Coba lagi.'); setPin(''); return }

    setPinStep(false); setPin(''); setPinError('')
    setApplying(true)

    const toApply = rows.filter(r => r.calculated != null && r.delta !== 0)
    const date = new Date().toISOString().slice(0, 10)
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

    const movements = toApply.map((r, idx) => ({
      id: `MOV-REBUILD-${Date.now()}-${idx}`,
      type: 'Adjustment',
      ingredient_id: r.id,
      ingredient_name: r.name,
      qty: r.delta,
      unit: r.unit,
      ref: 'REBUILD-AUG',
      note: `Rebuild dari opname Agustus (${r.stock || 0} → ${r.calculated})`,
      date, time,
      stock_before: r.stock || 0,
      stock_after: Math.max(0, r.calculated),
      source_event: 'adjustment',
      actor: 'Manager (Rebuild Approval)',
    }))

    await Promise.all([
      ...toApply.map(r => supabase.from('ingredients').update({ stock: Math.max(0, r.calculated) }).eq('id', r.id)),
      movements.length ? supabase.from('stock_movements').insert(movements) : Promise.resolve(),
    ])

    setApplying(false); setApplied(true)
    setMessage(`✅ ${toApply.length} ingredient(s) adjusted. Semua perubahan tercatat di stock_movements.`)
    setRows([])
  }

  const hasApplicable = rows.some(r => r.calculated != null && r.delta !== 0)

  return (
    <div>
      <div className="bo-card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Historical Rebuild Preview</div>
        <div style={{ fontSize: 12, color: 'var(--ink4)', marginBottom: 12 }}>
          Replays recorded movements after the first stock opname on/after 1 Aug.
          Missing baseline items remain flagged for review. Applying adjustments requires manager PIN.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="bo-btn bo-btn-primary" onClick={preview} disabled={loading || applying}>
            {loading ? 'Calculating…' : 'Generate Preview'}
          </button>
          {hasApplicable && !applied && (
            <button className="bo-btn bo-btn-danger" onClick={() => { setPinStep(true); setPin(''); setPinError('') }} disabled={applying}>
              {applying ? 'Applying…' : `Apply ${rows.filter(r => r.calculated != null && r.delta !== 0).length} Adjustments`}
            </button>
          )}
          {applied && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>✅ Applied</span>}
        </div>
        {message && (
          <div style={{ marginTop: 10, fontSize: 12, color: applied ? 'var(--green)' : 'var(--ink4)' }}>
            {message}
          </div>
        )}
      </div>

      {!!rows.length && (
        <div className="bo-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="bo-table">
            <thead><tr>
              <th>Ingredient</th><th>Unit</th><th>Opening (opname)</th>
              <th>Replayed</th><th>Current</th><th>Proposed Delta</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{r.unit}</td>
                  <td>{r.opening ?? <span style={{ color: 'var(--red)', fontWeight: 700 }}>Missing</span>}</td>
                  <td>{r.calculated != null ? fmt(r.calculated) : '—'}</td>
                  <td>{fmt(r.stock)}</td>
                  <td style={{ fontWeight: 700, color: r.delta == null ? 'var(--ink4)' : r.delta > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {r.delta == null
                      ? <span style={{ color: 'var(--amber)' }}>Review</span>
                      : (r.delta > 0 ? '+' : '') + fmt(r.delta)
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manager PIN modal */}
      {pinStep && (
        <div style={{ position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:360, width:'100%', boxShadow:'0 20px 60px rgba(9,30,66,0.3)', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔐</div>
            <div style={{ fontSize:16, fontWeight:800, color:'#0A1628', marginBottom:4 }}>Konfirmasi Manager</div>
            <div style={{ fontSize:13, color:'#6B7A8D', marginBottom:20 }}>
              Masukkan PIN manager untuk menerapkan penyesuaian stok
            </div>
            <input
              type="password" maxLength={8} value={pin} autoFocus
              onChange={e => { setPin(e.target.value); setPinError('') }}
              onKeyDown={e => e.key === 'Enter' && applyRebuild()}
              placeholder="PIN Manager"
              style={{ width:'100%', boxSizing:'border-box', padding:'11px 14px', borderRadius:10, border:`1.5px solid ${pinError ? '#DC2626' : '#E2E8F0'}`, fontSize:18, textAlign:'center', letterSpacing:6, outline:'none', marginBottom:8 }}
            />
            {pinError && <div style={{ color:'#DC2626', fontSize:13, marginBottom:8, fontWeight:600 }}>{pinError}</div>}
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button onClick={() => { setPinStep(false); setPin(''); setPinError('') }}
                style={{ flex:1, padding:12, borderRadius:10, border:'none', background:'#F1F5F9', fontWeight:700, cursor:'pointer' }}>
                Batal
              </button>
              <button onClick={applyRebuild} disabled={!pin}
                style={{ flex:1, padding:12, borderRadius:10, border:'none', background:'#DC2626', color:'#fff', fontWeight:700, cursor:'pointer', opacity: pin ? 1 : 0.4 }}>
                Terapkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
