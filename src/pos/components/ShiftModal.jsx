import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../shared/constants'

export default function ShiftModal({ staff, shift, onOpen, onClose, onLogout }) {
  const [float, setFloat]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [report, setReport]   = useState(null)
  const [note, setNote]       = useState('')
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (shift) loadReport()
  }, [shift])

  async function loadReport() {
    const today = new Date().toISOString().slice(0, 10)
    const [{ data: orders }, { data: cashLogs }] = await Promise.all([
      supabase.from('orders').select('total,pay,status').eq('date', today).eq('status', 'Paid'),
      supabase.from('cash_logs').select('*').eq('date', today),
    ])

    const sales = {}
    let totalSales = 0
    ;(orders||[]).forEach(o => {
      sales[o.pay] = (sales[o.pay] || 0) + o.total
      totalSales += o.total
    })

    const cashSales   = sales['Cash'] || 0
    const expenses    = (cashLogs||[]).filter(l=>l.type==='expense').reduce((a,l)=>a+l.amount,0)
    const returns     = (cashLogs||[]).filter(l=>l.type==='return').reduce((a,l)=>a+l.amount,0)
    const topups      = (cashLogs||[]).filter(l=>l.type==='topup').reduce((a,l)=>a+l.amount,0)
    const expectedCash = (shift.float_open||0) + cashSales + topups - expenses + returns

    setReport({ sales, totalSales, cashSales, expenses, returns, topups, expectedCash, cashLogs: cashLogs||[], orderCount: orders?.length||0 })
  }

  async function openShift() {
    if (!float) return
    setSaving(true)
    const s = {
      id:         'SHIFT-' + Date.now(),
      staff:      staff.name,
      date:       new Date().toISOString().slice(0, 10),
      clock_in:   new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }),
      float_open: parseInt(float),
      sales:      0,
    }
    await supabase.from('shifts').insert(s)
    onOpen(s)
    setSaving(false)
  }

  async function closeShift() {
    if (!confirmed) { setConfirmed(true); return }
    setSaving(true)
    await supabase.from('shifts').update({
      clock_out:    new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }),
      float_close:  report?.expectedCash || 0,
      sales:        report?.totalSales || 0,
      notes:        note || null,
    }).eq('id', shift.id)
    onLogout()
    setSaving(false)
  }

  if (!shift) return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={{ textAlign:'center', padding:'28px 24px' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>Selamat Datang</div>
          <div style={{ fontSize:18, fontWeight:900, color:'#0A1628', marginBottom:4 }}>Buka Shift</div>
          <div style={{ fontSize:13, color:'#6B7A8D', marginBottom:20 }}>{staff.name} — masukkan modal awal kas</div>
          <input type="number" value={float} onChange={e=>setFloat(e.target.value)}
            placeholder="Modal awal (Rp)" style={S.input} autoFocus
            onKeyDown={e=>e.key==='Enter'&&openShift()} />
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', justifyContent:'center' }}>
            {[100000,200000,300000,500000].map(v => (
              <button key={v} onClick={()=>setFloat(String(v))} style={S.quickBtn}>{fmt(v)}</button>
            ))}
          </div>
          <button onClick={openShift} disabled={saving||!float} style={S.primaryBtn}>
            {saving ? 'Membuka...' : 'Buka Shift'}
          </button>
          <button onClick={onLogout} style={S.ghostBtn}>Kembali ke Login</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <div>
            <div style={{ fontSize:16, fontWeight:900 }}>Laporan Kasir</div>
            <div style={{ fontSize:12, color:'#6B7A8D' }}>{staff.name} · Buka: {shift.clock_in} · Modal: {fmt(shift.float_open)}</div>
          </div>
          <button onClick={onLogout} style={S.closeBtn}>x</button>
        </div>

        <div style={{ overflowY:'auto', flex:1 }}>
          {!report ? (
            <div style={{ textAlign:'center', padding:40, color:'#94A3B8' }}>Memuat laporan...</div>
          ) : <>
            {/* Sales summary */}
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #E2E8F0' }}>
              <div style={S.sectionLabel}>Penjualan ({report.orderCount} order)</div>
              {Object.entries(report.sales).map(([pay, amt]) => (
                <div key={pay} style={S.row}>
                  <span style={{ fontSize:13 }}>{pay}</span>
                  <span style={{ fontWeight:700, fontSize:13 }}>{fmt(amt)}</span>
                </div>
              ))}
              <div style={{ ...S.row, fontWeight:900, fontSize:15, marginTop:6, paddingTop:6, borderTop:'1px solid #E2E8F0' }}>
                <span>Total Penjualan</span>
                <span style={{ color:'#16A34A' }}>{fmt(report.totalSales)}</span>
              </div>
            </div>

            {/* Cash flow */}
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #E2E8F0' }}>
              <div style={S.sectionLabel}>Arus Kas</div>
              <div style={S.row}><span style={{ fontSize:13 }}>Modal Awal</span><span style={{ fontWeight:600 }}>{fmt(shift.float_open)}</span></div>
              <div style={S.row}><span style={{ fontSize:13 }}>Penjualan Cash</span><span style={{ fontWeight:600, color:'#16A34A' }}>+{fmt(report.cashSales)}</span></div>
              {report.topups > 0 && <div style={S.row}><span style={{ fontSize:13 }}>Top-up Float</span><span style={{ fontWeight:600, color:'#16A34A' }}>+{fmt(report.topups)}</span></div>}
              {report.expenses > 0 && <div style={S.row}><span style={{ fontSize:13 }}>Pengeluaran</span><span style={{ fontWeight:600, color:'#DC2626' }}>-{fmt(report.expenses)}</span></div>}
              {report.returns > 0 && <div style={S.row}><span style={{ fontSize:13 }}>Kembalian Belanja</span><span style={{ fontWeight:600, color:'#F59E0B' }}>+{fmt(report.returns)}</span></div>}
              <div style={{ ...S.row, fontWeight:900, fontSize:15, marginTop:6, paddingTop:6, borderTop:'2px solid #0A1628' }}>
                <span>Ekspektasi Kas</span>
                <span style={{ color:'#0A1628' }}>{fmt(report.expectedCash)}</span>
              </div>
            </div>

            {/* Cash log detail */}
            {report.cashLogs.length > 0 && (
              <div style={{ padding:'14px 20px', borderBottom:'1px solid #E2E8F0' }}>
                <div style={S.sectionLabel}>Detail Kas Operasional</div>
                {report.cashLogs.map(l => (
                  <div key={l.id} style={S.row}>
                    <span style={{ fontSize:12, color:'#6B7A8D' }}>{l.time} {l.reason}</span>
                    <span style={{ fontSize:12, fontWeight:700, color: l.type==='expense'?'#DC2626':l.type==='return'?'#F59E0B':'#10B981' }}>
                      {l.type==='expense'?'-':'+'}{fmt(l.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Close section */}
            <div style={{ padding:'14px 20px' }}>
              <div style={S.sectionLabel}>Tutup Shift</div>
              <div style={{ background:'#F0FDF4', borderRadius:12, padding:14, marginBottom:14, textAlign:'center' }}>
                <div style={{ fontSize:12, color:'#16A34A' }}>Kas yang seharusnya ada di laci</div>
                <div style={{ fontSize:28, fontWeight:900, color:'#16A34A' }}>{fmt(report.expectedCash)}</div>
                <div style={{ fontSize:11, color:'#6B7A8D', marginTop:4 }}>Sistem menghitung otomatis — tidak perlu input manual</div>
              </div>
              <input value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Catatan (opsional, misal: ada selisih Rp X)" style={S.input} />
              {confirmed && (
                <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:12, marginBottom:12, fontSize:13, color:'#B45309', fontWeight:600 }}>
                  Konfirmasi tutup shift? Tekan sekali lagi untuk menutup.
                </div>
              )}
              <button onClick={closeShift} disabled={saving}
                style={{ ...S.primaryBtn, background:'#DC2626', opacity:saving?0.5:1 }}>
                {saving ? 'Menutup...' : confirmed ? 'Ya, Tutup Shift Sekarang' : 'Tutup Shift'}
              </button>
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:      { position:'fixed', inset:0, background:'rgba(9,30,66,0.8)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:2000 },
  modal:        { background:'white', borderRadius:20, width:'100%', maxWidth:440, maxHeight:'90vh', overflow:'hidden', boxShadow:'0 20px 60px rgba(9,30,66,0.4)', display:'flex', flexDirection:'column' },
  hd:           { padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 },
  closeBtn:     { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer' },
  sectionLabel: { fontSize:10, fontWeight:800, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 },
  row:          { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 },
  input:        { width:'100%', padding:'11px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:12 },
  quickBtn:     { padding:'6px 12px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'white', fontSize:12, cursor:'pointer', fontWeight:600 },
  primaryBtn:   { width:'100%', padding:14, borderRadius:12, border:'none', background:'#0A1628', color:'white', fontSize:14, fontWeight:800, cursor:'pointer', marginBottom:10 },
  ghostBtn:     { width:'100%', padding:12, borderRadius:12, border:'1.5px solid #E2E8F0', background:'white', color:'#6B7A8D', fontSize:13, fontWeight:600, cursor:'pointer' },
}
