import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { seedDatabase } from './lib/seed'
import POS from './pos/POS'

function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    seedDatabase().then(() => setReady(true))
  }, [])

  if (!ready) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'sans-serif',flexDirection:'column',gap:12}}>
      <div style={{fontSize:40}}>🏠</div>
      <div style={{fontSize:18,fontWeight:700}}>Setting up PawonLoka...</div>
    </div>
  )

  return <POS />
}

export default App