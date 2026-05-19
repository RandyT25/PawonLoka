import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../shared/constants'

const TYPES = {
  expense:  { label: 'Pengeluaran',       icon: '💸', color: '#DC2626', bg: '#FFF1F2', desc: 'Uang keluar kas (beli barang, dll)' },
  return:   { label: 'Kembalian Belanja', icon: '↩️', color: '#F59E0B', bg: '#FFFBEB', desc: 'Kembalian dari pengeluaran — bukan pendapatan' },
  topup:    { label: 'Top-up Float',      icon: '💰', color: '#10B981', bg: '#F0FDF4', desc: 'Penambahan uang kas oleh owner' },
}

export default function CashInOutModal({ staff, onClose }) {
  const [type, setType]     = useState('expense')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [logs, setLogs]     = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [tab, setTab]       = useState('add')

  useEffect(() => { loadLogs() }, [])

  async function loadLogs() {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('cash_logs')
      .select('*')
      .eq('date', today)
      .order('created_at', { ascending: false })
    setLogs(data || [])
  }

  async function handleSave() {
    if (!amount || parseInt(amount) <= 0) { setError('Masukkan jumlah'); return }
    if (!reason.trim()) { setError('Masukkan keterangan'); return }
    setSaving(true)
    const now = new Date()
    const { error: err } = await supabase.from('cash_logs').insert({
      type,
      amount: parseInt(amount),
      reason: reason.trim(),
      staff: staff.name,
      date: now.toISOString().slice(0, 10),
      time: now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }),
    })
    if (err) { setError('Gagal simpan'); setSaving(false); return }
    setAmount(''); setReason(''); setError('')
    setSaving(false)
    loadLogs()
    setTab('log')
  }

  // Summary — only expense and topup affect float, return brings cash back
  const expenses = logs.filter(l => l.type === 'expense').reduce((a,l) => a + l.amount, 0)
  const returns  = logs.filter(l => l.type === 'return').reduce((a,l) => a + l.amount, 0)
  const topups   = logs.filter(l => l.type === 'topup').reduce((a,l) => a + l.amount, 0)
  const netCash  = topups - expenses + returns

  const T = TYPES[type]

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <span style={{ fontWeight:800, fontSize:15 }}>Kas Operasional</span>
          <button onClick={onClose} style={S.close}>x</button>
        </div>

        {/* Summary cards */}
        <div style={{ display:'flex', gap:8, padding:'12px 16px', background:'#F8FAFC', borderBottom:'1px solid #E2E8F0' }}>
          <div style={S.summCard}>
            <div style={{ fontSize:10, color:'#DC2626', fontWeight:700 }}>KELUAR</div>
            <div style={{ fontSize:15, fontWeight:900, color:'#DC2626' }}>{fmt(expenses)}</div>
          </div>
          <div style={S.summCard}>
            <div style={{ fontSize:10, color:'#F59E0B', fontWeight:700 }}>KEMBALI</div>
            <div style={{ fontSize:15, fontWeight:900, color:'#F59E0B' }}>{fmt(returns)}</div>
          </div>
          <div style={S.summCard}>
            <div style={{ fontSize:10, color:'#10B981', fontWeight:700 }}>TOP-UP</div>
            <div style={{ fontSize:15, fontWeight:900, color:'#10B981' }}>{fmt(topups)}</div>
          </div>
          <div style={{ ...S.summCard, borderColor:'#6366F1', background:'#EEF2FF' }}>
            <div style={{ fontSize:10, color:'#6366F1', fontWeight:700 }}>NET KAS</div>
            <div style={{ fontSize:15, fontWeight:900, color:'#6366F1' }}>{fmt(netCash)}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid #E2E8F0' }}>
          {[['add','+ Tambah'],['log','Log Hari Ini']].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:'10px 0', border:'none', background:'none', fontSize:13,
                fontWeight:700, cursor:'pointer', color:tab===t?'#0A1628':'#6B7A8D',
                borderBottom:tab===t?'2px solid #0A1628':'2px solid transparent' }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ padding:16, overflowY:'auto' }}>
          {tab === 'add' && <>
            {/* Type selector */}
            <div style={{ marginBottom:14 }}>
              {Object.entries(TYPES).map(([k,v]) => (
                <button key={k} onClick={() => setType(k)}
                  style={{ ...S.typeRow, background:type===k?v.bg:'white', borderColor:type===k?v.color:'#E2E8F0' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:20 }}>{v.icon}</span>
                    <div style={{ textAlign:'left' }}>
                      <div style={{ fontWeight:700, fontSize:13, color:type===k?v.color:'#0A1628' }}>{v.label}</div>
                      <div style={{ fontSize:11, color:'#94A3B8' }}>{v.desc}</div>
                    </div>
                  </div>
                  <div style={{ width:18, height:18, borderRadius:'50%', border:'2px solid',
                    borderColor:type===k?v.color:'#CBD5E1', background:type===k?v.color:'white',
                    flexShrink:0 }} />
                </button>
              ))}
            </div>

            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
              placeholder="Jumlah (Rp)" style={S.input} />
            <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
              {[10000,20000,50000,100000].map(a => (
                <button key={a} onClick={() => setAmount(String(a))} style={S.quickBtn}>{fmt(a)}</button>
              ))}
            </div>

            <input value={reason} onChange={e=>setReason(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleSave()}
              placeholder="Keterangan (wajib)" style={S.input} />

            {error && <div style={{ color:'#DC2626', fontSize:12, marginBottom:8 }}>{error}</div>}

            <button onClick={handleSave} disabled={saving}
              style={{ ...S.saveBtn, background:T.color, opacity:saving?0.5:1 }}>
              {saving ? 'Menyimpan...' : T.icon + ' ' + T.label}
            </button>
          </>}

          {tab === 'log' && <>
            {logs.length === 0 && (
              <div style={{ textAlign:'center', color:'#94A3B8', padding:30 }}>Belum ada transaksi kas hari ini</div>
            )}
            {logs.map(l => {
              const t = TYPES[l.type] || TYPES.expense
              return (
                <div key={l.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #F1F5F9' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{t.icon} {l.reason}</div>
                    <div style={{ fontSize:11, color:'#6B7A8D' }}>{l.time} · {l.staff} · {t.label}</div>
                  </div>
                  <div style={{ fontWeight:800, color:t.color, fontSize:14 }}>
                    {l.type==='topup'||l.type==='return' ? '+' : '-'}{fmt(l.amount)}
                  </div>
                </div>
              )
            })}
          </>}
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:   { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000 },
  modal:     { background:'white', borderRadius:20, width:'100%', maxWidth:420, maxHeight:'90vh', overflow:'hidden', boxShadow:'0 20px 60px rgba(9,30,66,0.3)', display:'flex', flexDirection:'column' },
  hd:        { padding:'14px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  close:     { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer' },
  summCard:  { flex:1, padding:'8px 10px', borderRadius:10, border:'1.5px solid #E2E8F0', textAlign:'center' },
  typeRow:   { width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', borderRadius:12, border:'1.5px solid #E2E8F0', marginBottom:8, cursor:'pointer', background:'white' },
  input:     { width:'100%', padding:'11px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:10 },
  quickBtn:  { padding:'5px 10px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'white', fontSize:12, cursor:'pointer', fontWeight:600 },
  saveBtn:   { width:'100%', padding:13, color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer' },
}
