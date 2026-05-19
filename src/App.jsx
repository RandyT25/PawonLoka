
import { useEffect, useState } from "react"
import { seedDatabase } from "./lib/seed"
import POS from "./pos/POS"
import Backoffice from "./backoffice/Backoffice"

function App() {
  const [ready, setReady] = useState(false)
  const path = window.location.pathname

  useEffect(() => {
    seedDatabase().then(() => setReady(true))
  }, [])

  if (!ready) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"sans-serif", flexDirection:"column", gap:12 }}>
      <div style={{ fontSize:18, fontWeight:700 }}>Setting up PawonLoka...</div>
    </div>
  )

  if (path === "/backoffice" || path.startsWith("/backoffice/")) return <Backoffice />
  return <POS />
}

export default App
