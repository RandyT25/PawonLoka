import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../shared/constants'

export default function CustomerSearch({ onSelect, onClose }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [allCustomers, setAll]  = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('list') // list | add
  // Add form
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [email, setEmail]       = useState('')
  const [dob, setDob]           = useState('')
  const [address, setAddress]   = useState('')
  const [adding, setAdding]     = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('name')
    setAll(data || [])
    setResults(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!query.trim()) { setResults(allCustomers); return }
    setResults(allCustomers.filter(c =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      (c.phone||'').includes(query)
    ))
  }, [query, allCustomers])

  async function addCustomer() {
    if (!name.trim()) { setAddError('Nama wajib diisi'); return }
    if (!phone.trim()) { setAddError('No. HP wajib diisi'); return }
    setAdding(true)
    const { data: maxRow } = await supabase.from('customers').select('id').order('id', { ascending: false }).limit(1).single()
    const newId = (maxRow?.id || 180) + 1
    const customer = {
      id: newId, name: name.trim(), phone: phone.trim(),
      email: email.trim() || null, dob: dob || null,
      address: address.trim() || null,
      points: 0, visits: 0, tier: 'Bronze', totalSpend: 0,
    }
    const { error } = await supabase.from('customers').insert(customer)
    if (error) { setAddError('Gagal: ' + error.message); setAdding(false); return }
    onSelect(customer)
    onClose()
  }

  function tierColor(tier) {
    if (tier === 'Gold') return '#F59E0B'
    if (tier === 'Silver') return '#94A3B8'
    return '#CD7F32'
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.hd}>
          <span style={{ fontSize:15, fontWeight:800 }}>Pelanggan</span>
          <button onClick={onClose} style={S.closeBtn}>x</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid #E2E8F0' }}>
          {[['list','Daftar'],['add','+ Tambah Baru']].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:'10px 0', border:'none', background:'none', fontSize:13,
                fontWeight:700, cursor:'pointer', color:tab===t?'#0A1628':'#6B7A8D',
                borderBottom:tab===t?'2px solid #0A1628':'2px solid transparent' }}>
              {l}
            </button>
          ))}
        </div>

        {tab === 'list' && (
          <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
            <div style={{ padding:'10px 16px', borderBottom:'1px solid #E2E8F0' }}>
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Cari nama atau nomor HP..."
                style={S.input} />
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {loading && <div style={S.hint}>Memuat...</div>}
              {!loading && results.length === 0 && <div style={S.hint}>Tidak ada pelanggan</div>}
              {results.map(c => (
                <button key={c.id} onClick={() => onSelect(c)} style={S.row}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background: tierColor(c.tier)+'22',
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                    fontSize:14, fontWeight:900, color: tierColor(c.tier) }}>
                    {c.name[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1, textAlign:'left', minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{c.name}</div>
                    <div style={{ fontSize:11, color:'#6B7A8D' }}>{c.phone}
                      {c.dob ? ' · ' + new Date(c.dob).toLocaleDateString('id-ID',{day:'numeric',month:'short'}) : ''}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color: tierColor(c.tier) }}>{c.tier}</div>
                    <div style={{ fontSize:11, color:'#6B7A8D' }}>{c.points||0} pts</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'add' && (
          <div style={{ padding:16, overflowY:'auto' }}>
            <div style={S.label}>Nama *</div>
            <input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Nama lengkap" style={S.input} />

            <div style={S.label}>No. HP *</div>
            <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="08xxxxxxxxxx" style={S.input} />

            <div style={S.label}>Email</div>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@example.com" style={S.input} />

            <div style={S.label}>Tanggal Lahir</div>
            <input type="date" value={dob} onChange={e=>setDob(e.target.value)} style={S.input} />

            <div style={S.label}>Alamat</div>
            <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Alamat (opsional)" style={S.input} />

            {addError && <div style={{ color:'#DC2626', fontSize:12, marginBottom:8 }}>{addError}</div>}

            <button onClick={addCustomer} disabled={adding}
              style={{ width:'100%', padding:13, background:'#0A1628', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:800, cursor:'pointer', opacity:adding?0.5:1 }}>
              {adding ? 'Menyimpan...' : 'Simpan & Pilih'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  overlay:  { position:'fixed', inset:0, background:'rgba(9,30,66,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:1000 },
  modal:    { background:'white', borderRadius:20, width:'100%', maxWidth:440, height:'80vh', overflow:'hidden', boxShadow:'0 20px 60px rgba(9,30,66,0.3)', display:'flex', flexDirection:'column' },
  hd:       { padding:'14px 20px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  closeBtn: { width:28, height:28, borderRadius:'50%', background:'#F1F5F9', border:'none', cursor:'pointer', fontSize:14 },
  input:    { width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:10 },
  hint:     { textAlign:'center', color:'#94A3B8', fontSize:13, padding:'20px 0' },
  row:      { width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 16px', border:'none', background:'white', cursor:'pointer', borderBottom:'1px solid #F1F5F9' },
  label:    { fontSize:11, fontWeight:800, color:'#6B7A8D', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 },
}
