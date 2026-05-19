import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AddCustomerModal({ onAdd, onClose }) {
  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Nama wajib diisi'); return }
    if (!phone.trim()) { setError('No. HP wajib diisi'); return }
    setSaving(true)

    // Get max id
    const { data: maxRow } = await supabase
      .from('customers')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    const newId = (maxRow?.id || 180) + 1
    const customer = {
      id: newId,
      name: name.trim(),
      phone: phone.trim(),
      points: 0,
      visits: 0,
      tier: 'Bronze',
      totalSpend: 0,
    }

    const { error: err } = await supabase.from('customers').insert(customer)
    if (err) { setError('Gagal simpan: ' + err.message); setSaving(false); return }

    onAdd(customer)
    onClose()
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <span style={{ fontWeight:800, fontSize:15 }}>+ Pelanggan Baru</span>
          <button onClick={onClose} style={S.close}>x</button>
        </div>
        <div style={{ padding:20 }}>
          <div style={S.label}>Nama *</div>
          <input autoFocus value={name} onChange={e=>setName(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleSave()}
            placeholder="Nama pelanggan" style={S.input} />

          <div style={S.label}>No. HP *</div>
          <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleSave()}
            placeholder="08xxxxxxxxxx" style={S.input} />

          {error && <div style={{ color:'#DC2626', fontSize:12, marginTop:8 }}>{error}</div>}

          <div style={{ display:'flex', gap:8, marginTop:20 }}>
            <button onClick={onClose} style={S.cancelBtn}>Batal</button>
            <button onClick={handleSave} disabled={saving}
              style={{ ...S.saveBtn, opacity:saving?0.5:1 }}>
              {saving ? 'Menyimpan...' : 'Simpan & Pilih'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:   { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1100 },
  modal:     { background:'white', borderRadius:20, width:'100%', maxWidth:360, boxShadow:'0 20px 60px rgba(9,30,66,0.3)' },
  hd:        { padding:'16px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' },
  close:     { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer' },
  label:     { fontSize:11, fontWeight:800, color:'#6B7A8D', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6, marginTop:14 },
  input:     { width:'100%', padding:'11px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', boxSizing:'border-box' },
  cancelBtn: { flex:1, padding:12, background:'#F1F5F9', border:'none', borderRadius:10, fontWeight:700, cursor:'pointer' },
  saveBtn:   { flex:2, padding:12, background:'#0A1628', color:'white', border:'none', borderRadius:10, fontWeight:700, cursor:'pointer' },
}
