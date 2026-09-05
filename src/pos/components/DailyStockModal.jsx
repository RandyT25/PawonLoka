import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { qr } from '../../lib/quickRead'
import { fmt } from '../../shared/constants'

const DEFAULT_CRITICAL_ITEMS = [
  'ING-1780245811602', // Ayam Bumbu Kuning (sub) (Ayam Ungkep)
  'ING-007',           // Ayam Taliwang (sub)
  'ING-1781766220889', // Sop Ayam (sub)
  'ING-183',           // Telor
  'ING-154',           // Sate Kambing (sub)
  'ING-155',           // Sate Ayam (sub)
  'ING-170',           // Sop Iga Kambing (sub)
  'ING-200',           // Tulang Iga Kambing
  'ING-201',           // Tulang Kambing
  'ING-046'            // Daging Kambing
]

export default function DailyStockModal({ show, onClose, staff, shift }) {
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [items, setItems]           = useState([])
  const [counts, setCounts]         = useState({})
  const [notes, setNotes]           = useState('')
  const [expandedItem, setExpandedItem] = useState(null)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [manualAdded, setManualAdded] = useState({})
  const [onlineWarningChecked, setOnlineWarningChecked] = useState(false)

  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }, [])

  useEffect(() => {
    if (show) {
      loadData()
    }
  }, [show])

  async function loadData() {
    setLoading(true)
    setSavedSuccess(false)
    try {
      const [
        settings,
        allIngredients,
        recipes,
        todayOrders,
        todayMovements,
        existingRecon
      ] = await Promise.all([
        qr(supabase.from('app_settings').select('pos_behaviour').eq('id', 'main').single(), { ms: 5000 }),
        qr(supabase.from('ingredients').select('id, name, unit, stock, cost_per_unit').order('name'), { ms: 5000 }),
        qr(supabase.from('recipes').select('product_id, ingredient_id, qty, unit, ingredient_name'), { ms: 5000 }),
        qr(supabase.from('orders').select('id, items, status').eq('date', today).eq('status', 'Paid'), { ms: 5000 }),
        qr(supabase.from('stock_movements').select('ingredient_id, type, qty, date').eq('date', today), { ms: 5000 }),
        qr(supabase.from('staff_submissions').select('*').eq('type', 'daily_recon').order('submitted_at', { ascending: false }).limit(30), { ms: 5000 })
      ])

      const trackedIds = settings?.pos_behaviour?.daily_stock_items?.length
        ? settings.pos_behaviour.daily_stock_items
        : DEFAULT_CRITICAL_ITEMS

      const ingredientsMap = {}
      ;(allIngredients || []).forEach(ing => {
        ingredientsMap[ing.id] = ing
      })

      // Calculate sold quantity and breakdown per ingredient from today's paid orders
      const salesUsage = {} // ingId -> { total, breakdown }
      ;(todayOrders || []).forEach(order => {
        ;(order.items || []).forEach(item => {
          const itemSku = item.sku
          const itemQty = item.qty || 1
          const itemRecipes = (recipes || []).filter(r => r.product_id === itemSku)

          itemRecipes.forEach(rec => {
            const ingId = rec.ingredient_id
            if (!salesUsage[ingId]) {
              salesUsage[ingId] = { total: 0, breakdown: {} }
            }
            const usedForThisItem = (parseFloat(rec.qty) || 0) * itemQty
            salesUsage[ingId].total += usedForThisItem
            
            if (!salesUsage[ingId].breakdown[item.name]) {
              salesUsage[ingId].breakdown[item.name] = {
                orderQty: 0,
                portionQty: parseFloat(rec.qty) || 0,
                totalUsed: 0,
                unit: rec.unit || ''
              }
            }
            salesUsage[ingId].breakdown[item.name].orderQty += itemQty
            salesUsage[ingId].breakdown[item.name].totalUsed += usedForThisItem
          })
        })
      })

      // Calculate additions and waste for today
      const additions = {}
      const waste = {}
      const production_deductions = {}
      ;(todayMovements || []).forEach(mov => {
        const ingId = mov.ingredient_id
        const qty = parseFloat(mov.qty) || 0
        if (mov.type === 'Sale') return
        
        if (qty > 0) {
          additions[ingId] = (additions[ingId] || 0) + Math.abs(qty)
        } else if (qty < 0 && mov.type === 'Production') {
          production_deductions[ingId] = (production_deductions[ingId] || 0) + Math.abs(qty)
        } else if (qty < 0) {
          waste[ingId] = (waste[ingId] || 0) + Math.abs(qty)
        }
      })

      // Find previous day's daily_recon to establish true opening stock for today
      const prevDayRecon = (existingRecon || []).find(r => r.data?.date && r.data.date < today)
      const prevCountsMap = {}
      if (prevDayRecon?.data?.items) {
        prevDayRecon.data.items.forEach(it => {
          if (it.actual_qty !== undefined) prevCountsMap[it.ingredient_id] = it.actual_qty
        })
      }

      // Check if there is already a count for today in existingRecon
      const todayExisting = (existingRecon || []).find(r => r.data?.date === today)
      const initialCounts = {}
      if (todayExisting?.data?.items) {
        todayExisting.data.items.forEach(it => {
          initialCounts[it.ingredient_id] = it.actual_qty !== undefined ? String(it.actual_qty) : ''
        })
        if (todayExisting.data.notes) setNotes(todayExisting.data.notes)
      }

      // Build item list
      const rows = trackedIds.map(ingId => {
        const ing = ingredientsMap[ingId]
        if (!ing) return null

        const sold = salesUsage[ingId]?.total || 0
        const breakdown = salesUsage[ingId]?.breakdown || {}
        const added = additions[ingId] || 0
        const wasted = waste[ingId] || 0
        const prodDed = production_deductions[ingId] || 0
        
        const currentLiveStock = parseFloat(ing.stock) || 0
        const openingStock = prevCountsMap[ingId] !== undefined
          ? prevCountsMap[ingId]
          : Math.max(0, currentLiveStock + sold + wasted + prodDed - added)
        const expectedSisa = Math.max(0, openingStock + added - sold - wasted - prodDed)

        return {
          id: ing.id,
          name: ing.name,
          unit: ing.unit,
          cost_per_unit: ing.cost_per_unit || 0,
          opening_stock: Math.round(openingStock * 100) / 100,
          auto_added_qty: Math.round(added * 100) / 100,
        added_qty: Math.round(added * 100) / 100,
          sold_qty: Math.round(sold * 100) / 100,
          waste_qty: Math.round(wasted * 100) / 100,
          production_qty: Math.round(prodDed * 100) / 100,
          expected_sisa: Math.round(expectedSisa * 100) / 100,
          sales_breakdown: breakdown
        }
      }).filter(Boolean)

      setItems(rows)
      setCounts(initialCounts)
    } catch (err) {
      console.error('Error loading daily stock data:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleCountChange(ingId, val) {
    setCounts(prev => ({ ...prev, [ingId]: val }))
  }

  function setAllToExpected() {
    const next = {}
    items.forEach(it => {
      next[it.id] = String(it.expected_sisa)
    })
    setCounts(next)
  }

  function adjustCount(ingId, delta, defaultVal) {
    const curVal = counts[ingId] !== undefined && counts[ingId] !== ''
      ? parseFloat(String(counts[ingId]).replace(',', '.'))
      : defaultVal
    const next = Math.max(0, Math.round((curVal + delta) * 100) / 100)
    setCounts(prev => ({ ...prev, [ingId]: String(next) }))
  }

  async function handleSubmit() {
    if (!onlineWarningChecked) {
      alert("⚠️ Tunggu! Pastikan Anda sudah mencentang konfirmasi bahwa semua pesanan online sudah diinput.");
      return;
    }
    setSaving(true)
    try {
      let totalVarianceValue = 0
      const movementsToInsert = [];
    let stockUpdates = [];
    const recordedItems = items.map(item => {
      const finalAdded = manualAdded[item.id] !== undefined ? (parseFloat(manualAdded[item.id]) || 0) : item.added_qty;
      
      // expected_sisa MUST use auto_added_qty (True System Math), NOT finalAdded (Nita's claim)!
      // This ensures that if Nita fakes a +Masuk to hide a shortage, the Teori still catches it!
      const expected_sisa = Math.max(0, item.opening_stock + item.auto_added_qty - item.sold_qty - item.waste_qty - (item.production_qty||0));

      
      // REMOVED AUTO-INJECTION: We no longer magically create stock movements based on Nita's input.
      // Her input is just a CLAIM that will be cross-checked against true system production.
      const extraMasuk = finalAdded - item.auto_added_qty;

        const rawActual = counts[item.id]
        const actualQty = rawActual !== undefined && rawActual !== ''
          ? parseFloat(String(rawActual).replace(',', '.'))
          : expected_sisa
        
        const diff = Math.round((actualQty - expected_sisa) * 100) / 100
        const diffValue = diff < 0 ? Math.abs(diff) * (item.cost_per_unit || 0) : 0
        totalVarianceValue += diffValue

        return {
          ingredient_id: item.id,
          name: item.name,
          unit: item.unit,
          cost_per_unit: item.cost_per_unit,
          opening_stock: item.opening_stock,
          added_qty: finalAdded,
          sold_qty: item.sold_qty,
          waste_qty: item.waste_qty,
          production_qty: item.production_qty,
          expected_qty: expected_sisa,
          actual_qty: actualQty,
          diff_qty: diff,
          diff_value: Math.round(diffValue),
          sales_breakdown: Object.entries(item.sales_breakdown || {}).map(([menuName, info]) => ({
            menu: menuName,
            orders: info.orderQty,
            per_portion: info.portionQty,
            total_used: info.totalUsed,
            unit: info.unit
          }))
        }
      })

      const submissionId = 'SS-RECON-' + Date.now()
      
      // Update missing movements if any
      if (movementsToInsert.length > 0) {
        await supabase.from("stock_movements").insert(movementsToInsert);
        for (const up of stockUpdates) {
          const { data: ingData } = await supabase.from("ingredients").select("stock").eq("id", up.id).maybeSingle();
          if (ingData) {
            await supabase.from("ingredients").update({ stock: (parseFloat(ingData.stock)||0) + up.qty }).eq("id", up.id);
          }
        }
      }
      
      const payload = {
        id: submissionId,
        type: 'daily_recon',
        status: 'submitted',
        submitted_by: staff?.name || 'Kasir',
        submitted_at: new Date().toISOString(),
        data: {
          date: today,
          shift_id: shift?.id || null,
          staff_name: staff?.name || 'Kasir',
          notes: notes || '',
          total_variance_value: Math.round(totalVarianceValue),
          items: recordedItems
        }
      }

      const { error } = await supabase.from('staff_submissions').insert(payload)
      if (error) throw error

      setSavedSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      alert('Gagal menyimpan hitungan stok: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!show) return null

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>📦</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0A1628' }}>Rekonsiliasi Stok Harian</div>
              <div style={{ fontSize: 12, color: '#6B7A8D' }}>
                Hitung sisa fisik bahan kritis hari ini ({today}) · Kasir: <b>{staff?.name || 'Kasir'}</b>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6B7A8D' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
              <div style={{ fontWeight: 600 }}>Memuat daftar bahan & penjualan hari ini...</div>
            </div>
          ) : savedSuccess ? (
            <div style={{ padding: 50, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#00875A' }}>Stok Harian Berhasil Disimpan!</div>
              <div style={{ fontSize: 13, color: '#6B7A8D', marginTop: 4 }}>Laporan audit telah dikirim ke Backoffice.</div>
            </div>
          ) : (
            <>
              {/* Quick Fill Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 10, marginBottom: 14, border: '1px solid #E2E8F0', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  💡 <b>Tips:</b> Klik <b>"Sesuai Teori"</b> jika fisik cocok, atau klik <b>[+] / [-]</b> untuk menyesuaikan.
                </div>
                <button
                  type="button"
                  onClick={setAllToExpected}
                  style={styles.quickFillAllBtn}
                >
                  ⚡ Isi Semua Sesuai Teori
                </button>
              </div>

              {/* Items Table */}
              <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, textAlign: 'left' }}>Bahan / Item</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>Awal</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>+Masuk</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>-Terjual</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>-Waste/Adj</th>
                      <th style={{ ...styles.th, textAlign: 'center', background: '#F1F5F9' }}>Sisa Teori</th>
                      <th style={{ ...styles.th, textAlign: 'center', width: 190, background: '#EFF6FF' }}>Sisa Fisik (Input)</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>Selisih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const rawVal = counts[item.id]
                      const actualQty = rawVal !== undefined && rawVal !== ''
                        ? parseFloat(String(rawVal).replace(',', '.'))
                        : null
                      
                      const hasInput = actualQty !== null && !isNaN(actualQty)
                      const diff = hasInput ? Math.round((actualQty - expected_sisa) * 100) / 100 : 0
                      const hasBreakdown = Object.keys(item.sales_breakdown || {}).length > 0
                      const isExpanded = expandedItem === item.id

                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={styles.td}>
                            <div style={{ fontWeight: 800, color: '#0A1628', fontSize: 13.5 }}>{item.name}</div>
                            <div style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <span>Satuan: <b>{item.unit}</b></span>
                              {hasBreakdown && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                                  style={styles.breakdownBtn}
                                >
                                  {isExpanded ? '▲ Tutup' : '▼ Menu Terjual'}
                                </button>
                              )}
                            </div>
                            {isExpanded && hasBreakdown && (
                              <div style={{ marginTop: 8, padding: '8px 10px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                                  📋 Penjualan Resep:
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {Object.entries(item.sales_breakdown).map(([menuName, info]) => (
                                    <div key={menuName} style={styles.breakdownChip}>
                                      <span style={{ fontWeight: 700 }}>{menuName}:</span>
                                      <span>{info.orderQty} porsi × {info.portionQty} = <b>{info.totalUsed} {info.unit}</b></span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', color: '#64748B' }}>{item.opening_stock}</td>
                          <td style={{ ...styles.td, textAlign: 'center', color: item.added_qty > 0 ? '#00875A' : '#94A3B8' }}>
                            <input 
                              type="number" 
                              value={manualAdded[item.id] !== undefined ? manualAdded[item.id] : item.added_qty}
                              onChange={e => setManualAdded(prev => ({...prev, [item.id]: e.target.value}))}
                              style={{ ...styles.input, width: 60, padding: '4px', borderColor: '#86EFAC', color: '#166534', background: '#DCFCE7' }}
                              placeholder={String(item.auto_added_qty)}
                            />
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', color: item.sold_qty > 0 ? '#DE350B' : '#94A3B8', fontWeight: 600 }}>
                            {item.sold_qty > 0 ? `-${item.sold_qty}` : '0'}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', color: item.waste_qty > 0 ? '#9A3412' : '#94A3B8', fontWeight: 600 }}>
                            {item.waste_qty > 0 ? `-${item.waste_qty}` : '0'}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', fontWeight: 800, color: '#1E293B', background: '#F8FAFC' }}>
                            {expected_sisa} {item.unit}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', background: '#F0F9FF', padding: '6px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <button
                                type="button"
                                onClick={() => adjustCount(item.id, -1, expected_sisa)}
                                style={styles.stepperBtn}
                              >
                                -
                              </button>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={counts[item.id] ?? ''}
                                onChange={e => handleCountChange(item.id, e.target.value)}
                                placeholder={String(expected_sisa)}
                                style={styles.input}
                              />
                              <button
                                type="button"
                                onClick={() => adjustCount(item.id, 1, expected_sisa)}
                                style={styles.stepperBtn}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCountChange(item.id, String(expected_sisa))}
                                title="Isi sesuai sisa teori"
                                style={styles.matchBtn}
                              >
                                =
                              </button>
                            </div>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>
                            {!hasInput ? (
                              <span style={{ fontSize: 11, color: '#94A3B8' }}>—</span>
                            ) : diff === 0 ? (
                              <span style={{ ...styles.badge, background: '#DCFCE7', color: '#166534' }}>✓ Cocok</span>
                            ) : diff < 0 ? (
                              <span style={{ ...styles.badge, background: '#FEE2E2', color: '#991B1B' }}>
                                {diff} {item.unit}
                              </span>
                            ) : (
                              <span style={{ ...styles.badge, background: '#FEF3C7', color: '#92400E' }}>
                                +{diff} {item.unit}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Catatan Kasir (Opsional):
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Contoh: Sate kambing sisa 119 di chiller bawah, 5 sate rusak saat ditusuk..."
                  style={styles.notesInput}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!savedSuccess && !loading && (
          <div style={styles.footer}>
            <button onClick={onClose} style={styles.cancelBtn}>Tutup</button>
            <button onClick={handleSubmit} disabled={saving} style={styles.submitBtn}>
              {saving ? 'Menyimpan...' : '💾 Simpan Hitungan Stok Harian'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(9,22,48,0.7)',
    zIndex: 2500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16
  },
  modal: {
    background: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 820,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 40px rgba(0,0,0,0.25)'
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #E2E8F0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#F8FAFC'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    color: '#64748B',
    cursor: 'pointer',
    padding: 4
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13
  },
  th: {
    padding: '10px 12px',
    fontWeight: 700,
    color: '#475569',
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    borderBottom: '2px solid #E2E8F0'
  },
  td: {
    padding: '10px 12px',
    verticalAlign: 'middle'
  },
  input: {
    width: 64,
    padding: '7px 4px',
    borderRadius: 8,
    border: '1.5px solid #0284C7',
    fontSize: 14.5,
    fontWeight: 800,
    textAlign: 'center',
    color: '#0369A1',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box'
  },
  stepperBtn: {
    width: 28,
    height: 32,
    background: '#E0F2FE',
    border: '1px solid #BAE6FD',
    borderRadius: 6,
    color: '#0369A1',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0
  },
  matchBtn: {
    height: 32,
    padding: '0 8px',
    background: '#DCFCE7',
    border: '1px solid #86EFAC',
    borderRadius: 6,
    color: '#15803D',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickFillAllBtn: {
    padding: '6px 12px',
    background: '#0284C7',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 11.5,
    fontWeight: 700,
    cursor: 'pointer'
  },
  badge: {
    fontSize: 11.5,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 12,
    display: 'inline-block'
  },
  breakdownBtn: {
    background: 'none',
    border: 'none',
    color: '#0284C7',
    fontSize: 10.5,
    fontWeight: 700,
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline'
  },
  breakdownChip: {
    background: '#fff',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    padding: '3px 6px',
    fontSize: 10.5,
    color: '#334155',
    display: 'inline-flex',
    gap: 4
  },
  notesInput: {
    width: '100%',
    padding: '10px 14px',
    border: '1.5px solid #CBD5E1',
    borderRadius: 8,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box'
  },
  footer: {
    padding: '14px 20px',
    borderTop: '1px solid #E2E8F0',
    background: '#F8FAFC',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10
  },
  cancelBtn: {
    padding: '10px 18px',
    borderRadius: 8,
    border: '1px solid #CBD5E1',
    background: '#fff',
    fontSize: 13,
    fontWeight: 600,
    color: '#475569',
    cursor: 'pointer'
  },
  submitBtn: {
    padding: '10px 22px',
    borderRadius: 8,
    border: 'none',
    background: '#0066FF',
    color: '#fff',
    fontSize: 13.5,
    fontWeight: 800,
    cursor: 'pointer'
  }
}
