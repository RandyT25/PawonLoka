import { useState } from 'react'
import { STAFF } from '../../shared/constants'

export default function PinLogin({ onLogin }) {
  const [pin, setPin]     = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  function handlePin(digit) {
    if (pin.length >= 4) return
    const newPin = pin + digit
    setPin(newPin)
    if (newPin.length === 4) {
      const found = STAFF.find(s => s.pin === newPin)
      if (found) {
        onLogin(found)
        setPin('')
      } else {
        setShake(true)
        setError('Wrong PIN')
        setTimeout(() => { setPin(''); setError(''); setShake(false) }, 800)
      }
    }
  }

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={{ fontSize:52, marginBottom:8 }}>🏠</div>
        <div style={{ fontSize:24, fontWeight:900, color:'#0A1628', marginBottom:4 }}>PawonLoka</div>
        <div style={{ fontSize:14, color:'#6B7A8D', marginBottom:28 }}>Enter your PIN to continue</div>

        <div style={{ ...S.dots, animation: shake ? 'shake 0.4s' : 'none' }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width:14, height:14, borderRadius:'50%',
              background: pin.length > i ? '#0A1628' : 'white',
              border: '2px solid ' + (pin.length > i ? '#0A1628' : '#CBD5E1'),
              transition: 'all 0.15s'
            }}/>
          ))}
        </div>

        {error
          ? <div style={{ color:'#EF4444', fontSize:13, fontWeight:600, marginBottom:12, height:20 }}>{error}</div>
          : <div style={{ height:20, marginBottom:12 }}/>
        }

        <div style={S.numpad}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d,i) => (
            <button
              key={i}
              style={{ ...S.key, visibility: d==='' ? 'hidden' : 'visible' }}
              onClick={() => d==='⌫' ? setPin(p => p.slice(0,-1)) : handlePin(d)}
            >{d}</button>
          ))}
        </div>

        <div style={{ marginTop:24, display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center' }}>
          {STAFF.map(s => (
            <button key={s.id} onClick={() => onLogin(s)}
              style={{ fontSize:11, padding:'4px 10px', borderRadius:20, border:'1.5px solid #E2E8F0', background:'white', cursor:'pointer', color:'#6B7A8D', fontWeight:600 }}>
              {s.name}
            </button>
          ))}
        </div>
        <div style={{ fontSize:11, color:'#94A3B8', marginTop:8 }}>Quick login (demo only)</div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  )
}

const S = {
  wrap:   { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'linear-gradient(135deg,#0A1628 0%,#1E3A5F 100%)' },
  card:   { background:'white', borderRadius:24, padding:'32px 28px', width:320, textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' },
  dots:   { display:'flex', justifyContent:'center', gap:12, marginBottom:8 },
  numpad: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 },
  key:    { padding:16, borderRadius:14, border:'1.5px solid #E2E8F0', background:'white', fontSize:20, fontWeight:700, cursor:'pointer', color:'#0A1628', outline:'none', transition:'background 0.1s' },
}
