export default function Integrations() {
  const integrations=[
    {name:"WhatsApp Business",icon:"💬",desc:"Send receipts and notifications via WhatsApp",color:"#25D366"},
    {name:"GoBiz / GoFood",icon:"🟢",desc:"Sync menu and orders with GoFood",color:"#00ADE0"},
    {name:"GrabFood",icon:"🟢",desc:"Sync menu and orders with GrabFood",color:"#00B14F"},
    {name:"ShopeeFood",icon:"🟠",desc:"Sync menu and orders with ShopeeFood",color:"#EE4D2D"},
    {name:"Xero Accounting",icon:"📊",desc:"Export transactions to Xero",color:"#13B5EA"},
    {name:"Google Sheets",icon:"📋",desc:"Auto-export daily reports to Google Sheets",color:"#34A853"},
  ]
  return (
    <div>
      <div style={{marginBottom:16,padding:"12px 16px",background:"var(--amber-lt)",border:"1px solid var(--amber)",borderRadius:"var(--r-xl)",fontSize:13,color:"var(--amber)"}}>
        🚧 Integrations coming soon — connect PawonLoka with third-party platforms.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {integrations.map(i=>(
          <div key={i.name} style={{background:"#fff",border:"1.5px solid var(--surface3)",borderRadius:16,padding:20,opacity:0.75}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
              <div style={{width:44,height:44,borderRadius:12,background:i.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{i.icon}</div>
              <div><div style={{fontSize:14,fontWeight:800}}>{i.name}</div><span className="bo-badge bo-badge-amber" style={{fontSize:10}}>Coming Soon</span></div>
            </div>
            <div style={{fontSize:12,color:"var(--ink5)"}}>{i.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
