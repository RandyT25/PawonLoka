import { useState, memo } from 'react'
import { fmt } from '../../shared/constants'

function MenuGrid({ products, categories, onSelect, bundles }) {
  const [activeTab, setActiveTab] = useState('All')
  const [search,    setSearch]    = useState('')

  const filtered = activeTab === 'Bundles' ? [] : products.filter(p => {
    const matchTab    = activeTab === 'All' || p.cat === activeTab
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch && p.available !== false
  })
  const filteredBundles = activeTab === 'Bundles' ? (bundles||[]).filter(b => b.name.toLowerCase().includes(search.toLowerCase())) : []

  return (
    <div style={S.wrap}>
      <input
        style={S.search}
        placeholder="🔍 Search menu..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div style={S.tabs}>
        {['All', ...(bundles?.length?['Bundles']:[]), ...categories.map(c => c.name)].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ ...S.tab, ...(activeTab === tab ? S.tabActive : {}) }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={S.grid}>
        {filteredBundles.map(b => (
          <div key={b.id} onClick={() => onSelect({ sku:b.id, name:b.name, price:b.price, icon:'📦', cat:'Bundle', isBundle:true, bundleItems:b.items })}
            style={{ ...S.card, border:'2px solid #0052CC', alignItems:'flex-start', padding:'10px 12px', minHeight:160 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6, width:'100%' }}>
              <span style={{ fontSize:20 }}>📦</span>
              <span style={{ fontSize:13, fontWeight:800, color:'#0052CC', lineHeight:1.3 }}>{b.name}</span>
            </div>
            <div style={{ flex:1, width:'100%' }}>
              {(b.items||[]).slice(0,4).map((item,i) => (
                <div key={i} style={{ fontSize:10, color:'#42526E', lineHeight:1.6, display:'flex', justifyContent:'space-between' }}>
                  <span>{item.qty>1?item.qty+'x ':''}{item.name}</span>
                  {item.free && <span style={{ color:'#00875A', fontWeight:700 }}>FREE</span>}
                </div>
              ))}
              {(b.items||[]).length > 4 && <div style={{ fontSize:10, color:'#6B778C' }}>+{b.items.length-4} more</div>}
            </div>
            <div style={{ fontSize:15, fontWeight:900, color:'#0052CC', marginTop:6 }}>Rp {Math.round(b.price).toLocaleString('id-ID')}</div>
          </div>
        ))}
        {filtered.map(p => (
          <button key={p.sku || p.id} onClick={() => onSelect(p)} style={S.card}>

            {/* Photo or emoji */}
            {p.image_url
              ? <img
                  src={p.image_url}
                  alt={p.name}
                  style={S.photo}
                  loading="lazy"
                />
              : <div style={S.emoji}>{categories.find(c=>c.name===p.cat)?.icon || p.icon || '🍽️'}</div>
            }

            <div style={S.name}>{p.name}</div>
            <div style={S.price}>{fmt(p.price)}</div>
          </button>
        ))}

        {filtered.length === 0 && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', padding:40, color:'#94A3B8', fontSize:14 }}>
            No items found
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(MenuGrid)

const S = {
  wrap:     { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:16, gap:10 },
  search:   { padding:'10px 14px', borderRadius:12, border:'1.5px solid #E2E8F0', fontSize:14, outline:'none', background:'white', flexShrink:0 },
  tabs:     { display:'flex', gap:6, overflowX:'auto', flexShrink:0, paddingBottom:2 },
  tab:      { padding:'7px 16px', borderRadius:20, border:'1.5px solid #E2E8F0', background:'white', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', color:'#6B7A8D', flexShrink:0, outline:'none' },
  tabActive:{ background:'#0A1628', borderColor:'#0A1628', color:'white' },
  grid:     { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10, overflowY:'auto', flex:1, alignContent:'start' },
  card:     { background:'white', border:'1.5px solid #E2E8F0', borderRadius:14, padding:0, cursor:'pointer', textAlign:'center', display:'flex', flexDirection:'column', outline:'none', transition:'all 0.15s', overflow:'hidden', height:160 },
  photo:    { width:'100%', height:90, objectFit:'cover', display:'block', flexShrink:0 },
  emoji:    { width:'100%', height:90, display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, background:'#F8FAFC', flexShrink:0 },
  name:     { fontSize:12, fontWeight:700, color:'#0A1628', lineHeight:1.3, padding:'6px 8px 2px', flex:1, display:'flex', alignItems:'center', justifyContent:'center' },
  price:    { fontSize:13, fontWeight:800, color:'#3B82F6', paddingBottom:8, flexShrink:0 },
}
