
import { useState } from "react";

const ROLES = [
  { id: "receipt",  label: "Receipt Printer" },
  { id: "kitchen1", label: "Kitchen Station 1" },
  { id: "kitchen2", label: "Kitchen Station 2" },
];

export default function PrinterSettings({ hook }) {
  const { printers, scanning, scanAndPair, connect, disconnect, removePrinter, updatePrinter, testPrint } = hook;
  const [error, setError]   = useState("");
  const [busyId, setBusyId] = useState(null);
  const [editName, setEditName] = useState({});
  const btSupported = !!navigator.bluetooth;

  async function handleScan() {
    setError("");
    try { await scanAndPair("receipt"); }
    catch (e) { setError(e.message); }
  }

  async function handleConnect(id) {
    setError(""); setBusyId(id);
    try { await connect(id); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  }

  async function handleDisconnect(id) {
    setBusyId(id);
    try { await disconnect(id); }
    finally { setBusyId(null); }
  }

  async function handleTest(id) {
    setError(""); setBusyId(id);
    try { await testPrint(id); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  }

  function handleRename(id, name) {
    setEditName(prev => ({ ...prev, [id]: name }));
  }

  function saveRename(id) {
    const name = editName[id];
    if (name && name.trim()) updatePrinter(id, { name: name.trim() });
    setEditName(prev => { const n = {...prev}; delete n[id]; return n; });
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

      {!btSupported && (
        <div style={s.warn}>
          Web Bluetooth is not supported on this browser. Please use Chrome on Android or Chrome desktop.
        </div>
      )}

      <button onClick={handleScan} disabled={!btSupported || scanning} style={s.scanBtn}>
        {scanning ? "Scanning..." : "Add Printer via Bluetooth"}
      </button>

      {error && <div style={s.error}>{error}</div>}

      {printers.length === 0 && (
        <div style={s.empty}>No printers added yet.</div>
      )}

      {printers.map(p => {
        const busy    = busyId === p.id;
        const editing = editName[p.id] !== undefined;
        return (
          <div key={p.id} style={s.card}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <div style={{ ...s.dot, background: p.connected ? "#00875A" : "#C1C7D0" }} />
              <span style={s.connLabel}>{p.connected ? "Connected" : "Disconnected"}</span>
            </div>

            {/* Name */}
            <div style={s.fieldRow}>
              <label style={s.label}>Name</label>
              {editing ? (
                <div style={{ display:"flex", gap:6, flex:1 }}>
                  <input
                    value={editName[p.id]}
                    onChange={e => handleRename(p.id, e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveRename(p.id)}
                    style={s.input}
                    autoFocus
                  />
                  <button onClick={() => saveRename(p.id)} style={s.saveBtn}>Save</button>
                </div>
              ) : (
                <div style={{ display:"flex", gap:6, flex:1, alignItems:"center" }}>
                  <span style={s.value}>{p.name}</span>
                  <button onClick={() => setEditName(prev => ({ ...prev, [p.id]: p.name }))} style={s.editBtn}>Rename</button>
                </div>
              )}
            </div>

            {/* Role */}
            <div style={s.fieldRow}>
              <label style={s.label}>Assign as</label>
              <select value={p.role} onChange={e => updatePrinter(p.id, { role: e.target.value })} style={s.select}>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>

            {/* Paper */}
            <div style={s.fieldRow}>
              <label style={s.label}>Paper size</label>
              <select value={p.paperSize} onChange={e => updatePrinter(p.id, { paperSize: e.target.value })} style={s.select}>
                <option value="80mm">80mm</option>
                <option value="58mm">58mm</option>
              </select>
            </div>

            {/* Actions */}
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              {p.connected ? (
                <>
                  <button onClick={() => handleTest(p.id)} disabled={busy} style={s.ghostBtn}>{busy ? "Printing..." : "Test Print"}</button>
                  <button onClick={() => handleDisconnect(p.id)} disabled={busy} style={s.ghostBtn}>{busy ? "..." : "Disconnect"}</button>
                </>
              ) : (
                <button onClick={() => handleConnect(p.id)} disabled={busy} style={s.primaryBtn}>{busy ? "Connecting..." : "Connect"}</button>
              )}
              <button onClick={() => removePrinter(p.id)} style={{ ...s.ghostBtn, marginLeft:"auto", color:"#DE350B" }}>Remove</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const s = {
  scanBtn:    { width:"100%", padding:"11px 0", background:"#0066FF", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" },
  warn:       { padding:"10px 12px", background:"#FFF7E6", border:"1px solid #FFE0B2", borderRadius:8, fontSize:12, color:"#7D5A00", lineHeight:1.6 },
  error:      { padding:"10px 12px", background:"#FFEBE6", border:"1px solid #FFBDAD", borderRadius:8, fontSize:12, color:"#DE350B" },
  empty:      { textAlign:"center", fontSize:12, color:"#97A0AF", padding:"16px 0" },
  card:       { background:"#F4F5F7", borderRadius:10, padding:"12px 14px", border:"1px solid #DFE1E6" },
  dot:        { width:9, height:9, borderRadius:"50%", flexShrink:0 },
  connLabel:  { fontSize:11, fontWeight:600, color:"#6B778C" },
  fieldRow:   { display:"flex", alignItems:"center", gap:10, marginBottom:8 },
  label:      { fontSize:12, fontWeight:600, color:"#42526E", width:72, flexShrink:0 },
  value:      { fontSize:13, color:"#091E42", flex:1 },
  input:      { flex:1, padding:"6px 10px", border:"1.5px solid #0066FF", borderRadius:7, fontSize:13, color:"#091E42", outline:"none" },
  select:     { flex:1, padding:"6px 8px", border:"1px solid #DFE1E6", borderRadius:7, fontSize:13, color:"#091E42", background:"#fff" },
  primaryBtn: { padding:"7px 14px", background:"#0066FF", color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer" },
  ghostBtn:   { padding:"7px 14px", background:"#fff", color:"#091E42", border:"1px solid #DFE1E6", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer" },
  saveBtn:    { padding:"6px 12px", background:"#00875A", color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer" },
  editBtn:    { padding:"4px 10px", background:"#fff", color:"#0066FF", border:"1px solid #DFE1E6", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer" },
};
