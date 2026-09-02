import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../shared/constants'
import { qr } from '../../lib/quickRead'
import { dbWrite } from '../../shared/dbWrite'
import { explodeOrderPayments } from '../../shared/orderPricing'
import { printShiftReport, printProductSoldReport } from '../hooks/usePrinter'

export default function ShiftModal({ staff, shift, onOpen, onClose, onDismiss, onLogout, onOpenDailyStock, printer }) {
  const [float, setFloat]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [report, setReport]       = useState(null)
  const [note, setNote]           = useState('')
  const [actualCash, setActualCash] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [productData, setProductData] = useState(null)

  useEffect(() => {
    if (shift) loadReport()
  }, [shift])

  async function loadReport() {
    const today = new Date().toISOString().slice(0, 10)
    const [orders, cashLogs, openBills, notClockedOut] = await Promise.all([
      qr(supabase.from('orders').select('total,pay,payments,status').eq('date', today).eq('status', 'Paid'), { ms:5000 }),
      qr(supabase.from('cash_logs').select('*').eq('date', today), { ms:5000 }),
      qr(supabase.from('orders').select('id,table,total').eq('date', today).eq('status', 'Open'), { ms:5000 }),
      qr(supabase.from('attendance').select('id,staff_name,clock_in').eq('date', today).not('clock_in', 'is', null).is('clock_out', null), { ms:5000 }),
    ])

    const sales = {}
    let totalSales = 0
    ;(orders||[]).forEach(o => {
      explodeOrderPayments(o).forEach(({ method, amount }) => {
        sales[method] = (sales[method] || 0) + amount
      })
      totalSales += o.total
    })

    const cashSales   = sales['Cash'] || 0
    const expenses    = (cashLogs||[]).filter(l=>l.type==='expense').reduce((a,l)=>a+l.amount,0)
    const returns     = (cashLogs||[]).filter(l=>l.type==='return').reduce((a,l)=>a+l.amount,0)
    const topups      = (cashLogs||[]).filter(l=>l.type==='topup').reduce((a,l)=>a+l.amount,0)
    const expectedCash = (shift.float_open||0) + cashSales + topups - expenses + returns

    setReport({ sales, totalSales, cashSales, expenses, returns, topups, expectedCash, cashLogs: cashLogs||[], orderCount: orders?.length||0, openBills: openBills||[], notClockedOut: notClockedOut||[] })
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
    await dbWrite('shifts', 'insert', s)
    onOpen(s)
    // Non-blocking clock-in reminder
    setTimeout(() => {
      const toast = document.createElement('div')
      toast.innerHTML = 'Reminder: Clock in via Staff portal to record attendance'
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0052CC;color:#fff;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:90vw;text-align:center'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 5000)
    }, 1000)
    setSaving(false)
  }

  async function closeShift() {
    if (!confirmed) { setConfirmed(true); return }

    // Re-query live state — report could be seconds old. Short timeout with a fallback
    // to the already-loaded report (cache-backed) so a flaky connection doesn't block
    // closing the shift entirely — the guard still applies, just against slightly
    // staler data if the live re-check can't complete.
    const today = new Date().toISOString().slice(0, 10)
    const [stillOpen, stillClockedIn] = await Promise.all([
      qr(supabase.from('orders').select('id,table,total').eq('date', today).eq('status', 'Open'), { ms:4000 }),
      qr(supabase.from('attendance').select('id,staff_name').eq('date', today).not('clock_in', 'is', null).is('clock_out', null), { ms:4000 }),
    ])
    const openBillsCheck = stillOpen ?? report?.openBills ?? []
    const notClockedOutCheck = stillClockedIn ?? report?.notClockedOut ?? []
    if (openBillsCheck.length > 0 || notClockedOutCheck.length > 0) {
      setConfirmed(false)
      await loadReport()
      return
    }

    setSaving(true)
    const parsedActual = actualCash !== '' ? parseInt(actualCash) : null
    await dbWrite('shifts', 'update', {
      clock_out:         new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }),
      float_close:       report?.expectedCash || 0,
      actual_cash:       parsedActual,
      cash_discrepancy:  parsedActual !== null ? parsedActual - (report?.expectedCash || 0) : null,
      sales:             report?.totalSales || 0,
      notes:             note || null,
    }, { id: shift.id })
    // Print shift closing report if printer is connected
    if (printer) {
      try {
        const rp = printer.printers?.find(p => p.role === 'receipt')
        if (rp) await printShiftReport({ shift, report, paperSize: rp.paperSize })
      } catch (_) { /* print failure should not block logout */ }
    }

    // Fetch sold items to offer product report print
    try {
      const { data: paidOrders } = await supabase
        .from('orders').select('items').eq('date', today).eq('status', 'Paid')
      const itemMap = {}
      ;(paidOrders || []).forEach(order => {
        ;(order.items || []).forEach(item => {
          const key = (item.cat || 'Lainnya') + '||' + item.name
          if (!itemMap[key]) itemMap[key] = { name: item.name, cat: item.cat || 'Lainnya', qty: 0, mods: {} }
          itemMap[key].qty += item.qty || 1
          Object.values(item.modifiers || {}).forEach(mod => {
            if (mod) itemMap[key].mods[mod] = (itemMap[key].mods[mod] || 0) + (item.qty || 1)
          })
        })
      })
      setSaving(false)
      setProductData(itemMap)
      // Stay open — wait for cashier's choice in the product print prompt
    } catch (_) {
      setSaving(false)
      onClose()
    }
  }

  async function printProductReport() {
    if (printer && productData) {
      try {
        const rp = printer.printers?.find(p => p.role === 'receipt')
        if (rp) await printProductSoldReport({ shift, productData, paperSize: rp.paperSize })
      } catch (_) { /* print failure should not block close */ }
    }
    onClose()
  }

  if (productData) return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={{ padding:28, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🖨️</div>
          <div style={{ fontSize:16, fontWeight:900, color:'#0A1628', marginBottom:8 }}>Shift Berhasil Ditutup</div>
          <div style={{ fontSize:13, color:'#6B7A8D', marginBottom:24 }}>Cetak laporan produk terjual hari ini?</div>
          {!printer?.printers?.find(p => p.role === 'receipt') && (
            <div style={{ fontSize:12, color:'#F59E0B', marginBottom:16, padding:'8px 12px', background:'#FFFBEB', borderRadius:8 }}>
              Printer tidak terhubung — laporan tidak akan tercetak
            </div>
          )}
          <button onClick={printProductReport}
            style={{ ...S.primaryBtn, marginBottom:10 }}>
            Ya, Cetak Laporan Produk
          </button>
          <button onClick={onClose} style={S.ghostBtn}>Tidak, Lanjutkan</button>
        </div>
      </div>
    </div>
  )

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
          <button onClick={onDismiss} style={S.closeBtn}>x</button>
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

              {onOpenDailyStock && (
                <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'12px 14px', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:800, color:'#1E40AF' }}>📦 Hitung Stok Harian</div>
                    <div style={{ fontSize:11, color:'#3B82F6' }}>Cocokkan sisa sate, ayam, telur & daging hari ini</div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenDailyStock}
                    style={{ padding:'7px 14px', background:'#2563EB', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}
                  >
                    Buka Hitungan
                  </button>
                </div>
              )}

              {/* ── Open bill blocker ───────────────────── */}
              {report.openBills?.length > 0 && (
                <div style={{ background:'#FEF2F2', border:'1.5px solid #FCA5A5', borderRadius:12, padding:14, marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:18 }}>🚫</span>
                    <div style={{ fontSize:13, fontWeight:800, color:'#DC2626' }}>
                      {report.openBills.length} Tagihan Belum Dibayar
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:10 }}>
                    {report.openBills.map(b => (
                      <div key={b.id} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#B91C1C', background:'rgba(255,255,255,0.6)', borderRadius:8, padding:'6px 10px' }}>
                        <span style={{ fontWeight:700 }}>{b.table || 'Walk-in'}</span>
                        <span>{fmt(b.total)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:'#991B1B', fontWeight:700, textAlign:'center' }}>
                    Selesaikan semua tagihan sebelum menutup shift.
                  </div>
                </div>
              )}

              {/* ── Clock-out blocker ───────────────────── */}
              {report.notClockedOut?.length > 0 && (
                <div style={{ background:'#FFFBEB', border:'1.5px solid #FCD34D', borderRadius:12, padding:14, marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:18 }}>⏱️</span>
                    <div style={{ fontSize:13, fontWeight:800, color:'#B45309' }}>
                      {report.notClockedOut.length} Karyawan Belum Clock Out
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:10 }}>
                    {report.notClockedOut.map(a => (
                      <div key={a.id} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#92400E', background:'rgba(255,255,255,0.6)', borderRadius:8, padding:'6px 10px' }}>
                        <span style={{ fontWeight:700 }}>{a.staff_name}</span>
                        <span>{a.clock_in ? 'Masuk: ' + new Date(a.clock_in).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) : ''}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:'#92400E', fontWeight:700, textAlign:'center' }}>
                    Minta semua karyawan clock out sebelum menutup shift.
                  </div>
                </div>
              )}

              <div style={{ background:'#F0FDF4', borderRadius:12, padding:'12px 14px', marginBottom:10 }}>
                <div style={{ ...S.row, marginBottom:0 }}>
                  <span style={{ fontSize:13, color:'#16A34A', fontWeight:700 }}>Ekspektasi Kas (sistem)</span>
                  <span style={{ fontSize:16, fontWeight:900, color:'#16A34A' }}>{fmt(report.expectedCash)}</span>
                </div>
              </div>

              {/* Actual cash counted */}
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.5px', display:'block', marginBottom:6 }}>Kas Aktual (Hitung Manual)</label>
                <input
                  type="number"
                  value={actualCash}
                  onChange={e=>setActualCash(e.target.value)}
                  placeholder={String(report.expectedCash)}
                  style={{ ...S.input, marginBottom:0, fontWeight:700, fontSize:15 }}
                />
              </div>

              {/* Variance display */}
              {actualCash !== '' && (() => {
                const variance = parseInt(actualCash) - (report.expectedCash || 0)
                return (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderRadius:10, marginBottom:10,
                    background: variance === 0 ? '#F0FDF4' : variance > 0 ? '#F0FDF4' : '#FEF2F2',
                    border: `1.5px solid ${variance === 0 ? '#86EFAC' : variance > 0 ? '#86EFAC' : '#FCA5A5'}` }}>
                    <span style={{ fontSize:13, fontWeight:700, color: variance === 0 ? '#16A34A' : variance > 0 ? '#16A34A' : '#DC2626' }}>
                      {variance === 0 ? '✓ Kas sesuai' : variance > 0 ? '↑ Over' : '↓ Short'}
                    </span>
                    <span style={{ fontSize:16, fontWeight:900, color: variance === 0 ? '#16A34A' : variance > 0 ? '#16A34A' : '#DC2626' }}>
                      {variance >= 0 ? '+' : ''}{fmt(variance)}
                    </span>
                  </div>
                )
              })()}

              <input value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Catatan (opsional, misal: ada selisih Rp X)" style={S.input} />
              {confirmed && (
                <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:12, marginBottom:12, fontSize:13, color:'#B45309', fontWeight:600 }}>
                  Konfirmasi tutup shift? Tekan sekali lagi untuk menutup.
                </div>
              )}
              <button onClick={closeShift} disabled={saving || report.openBills?.length > 0 || report.notClockedOut?.length > 0}
                style={{ ...S.primaryBtn, background: (report.openBills?.length > 0 || report.notClockedOut?.length > 0) ? '#94A3B8' : '#DC2626', opacity: saving ? 0.5 : 1, cursor: (report.openBills?.length > 0 || report.notClockedOut?.length > 0) ? 'not-allowed' : 'pointer' }}>
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
