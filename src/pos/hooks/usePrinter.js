
import { useState, useCallback, useRef } from "react";

const PRINTER_STORAGE_KEY = "pl_printers";

function loadPrinters() {
  try { return JSON.parse(localStorage.getItem(PRINTER_STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function savePrinters(p) {
  localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(p));
}

const ESC = 0x1B, GS = 0x1D;

function escpos(cmds) {
  const bytes = [];
  for (const cmd of cmds) {
    if (typeof cmd === "number") bytes.push(cmd);
    else if (typeof cmd === "string") {
      for (let i = 0; i < cmd.length; i++) bytes.push(cmd.charCodeAt(i) & 0xFF);
    } else if (Array.isArray(cmd)) bytes.push(...cmd);
  }
  return new Uint8Array(bytes);
}

const CMD = {
  INIT:      [ESC, 0x40],
  ALIGN_L:   [ESC, 0x61, 0x00],
  ALIGN_C:   [ESC, 0x61, 0x01],
  ALIGN_R:   [ESC, 0x61, 0x02],
  BOLD_ON:   [ESC, 0x45, 0x01],
  BOLD_OFF:  [ESC, 0x45, 0x00],
  DOUBLE_ON: [GS,  0x21, 0x11],
  DOUBLE_OFF:[GS,  0x21, 0x00],
  LF:        [0x0A],
  CUT:       [GS,  0x56, 0x41, 0x03],
  BEEP:      [ESC, 0x42, 0x03, 0x02],
  DRAWER:    [ESC, 0x70, 0x00, 0x19, 0xFA],
};

function line(left, right, width = 42) {
  const r = String(right ?? "");
  const l = String(left ?? "").slice(0, width - r.length);
  return l.padEnd(width - r.length, " ") + r;
}
function divider(char = "-", width = 42) { return char.repeat(width); }

export function buildReceiptData({ order, outlet, tax, service }) {
  const fmt = n => "Rp " + Number(n || 0).toLocaleString("id-ID");
  const w = 42;
  const lines = [];
  lines.push({ cmd: "ALIGN_C" }, { cmd: "BOLD_ON" }, { cmd: "DOUBLE_ON" });
  lines.push({ text: (outlet?.name || "PawonLoka") + "\n" });
  lines.push({ cmd: "DOUBLE_OFF" }, { cmd: "BOLD_OFF" });
  if (outlet?.address) lines.push({ text: outlet.address + "\n" });
  if (outlet?.phone)   lines.push({ text: outlet.phone + "\n" });
  lines.push({ text: divider() + "\n" });
  lines.push({ cmd: "ALIGN_L" });
  lines.push({ text: "Order : " + (order.code || order.id) + "\n" });
  lines.push({ text: "Meja  : " + (order.table || "Walk-in") + "\n" });
  lines.push({ text: "Kasir : " + (order.cashier || "-") + "\n" });
  lines.push({ text: "Waktu : " + new Date(order.created_at).toLocaleString("id-ID") + "\n" });
  lines.push({ text: divider() + "\n" });
  for (const item of (order.items || [])) {
    lines.push({ cmd: "BOLD_ON" });
    lines.push({ text: item.name + "\n" });
    lines.push({ cmd: "BOLD_OFF" });
    lines.push({ text: line("  " + item.qty + " x " + fmt(item.price), fmt(item.qty * item.price), w) + "\n" });
    if (item.note)     lines.push({ text: "  * " + item.note + "\n" });
    if (item.discount) lines.push({ text: line("  Diskon", "-" + fmt(item.discount), w) + "\n" });
  }
  lines.push({ text: divider() + "\n" });
  const subtotal = (order.items || []).reduce((s, i) => s + (i.qty * i.price) - (i.discount || 0), 0);
  const taxAmt   = tax?.enabled     ? Math.round(subtotal * (tax.rate / 100))     : 0;
  const svcAmt   = service?.enabled ? Math.round(subtotal * (service.rate / 100)) : 0;
  const total    = subtotal + taxAmt + svcAmt - (order.discount || 0);
  lines.push({ text: line("Subtotal", fmt(subtotal), w) + "\n" });
  if (taxAmt) lines.push({ text: line((tax.label || "PPN") + " " + tax.rate + "%", fmt(taxAmt), w) + "\n" });
  if (svcAmt) lines.push({ text: line("Service " + service.rate + "%", fmt(svcAmt), w) + "\n" });
  if (order.discount) lines.push({ text: line("Diskon", "-" + fmt(order.discount), w) + "\n" });
  lines.push({ cmd: "BOLD_ON" });
  lines.push({ text: line("TOTAL", fmt(total), w) + "\n" });
  lines.push({ cmd: "BOLD_OFF" });
  lines.push({ text: divider() + "\n" });
  for (const pay of (order.payments || [])) {
    lines.push({ text: line(pay.method, fmt(pay.amount), w) + "\n" });
  }
  if (order.change > 0) lines.push({ text: line("Kembali", fmt(order.change), w) + "\n" });
  lines.push({ text: divider() + "\n" });
  lines.push({ cmd: "ALIGN_C" });
  lines.push({ text: (outlet?.thankYou || "Terima kasih!") + "\n" });
  if (outlet?.wifi) lines.push({ text: "WiFi: " + outlet.wifi + "\n" });
  lines.push({ text: "\n\n\n" });
  lines.push({ cmd: "CUT" });
  return lines;
}

export function buildKitchenData({ ticket, width = 42 }) {
  const lines = [];
  lines.push({ cmd: "ALIGN_C" }, { cmd: "BOLD_ON" }, { cmd: "DOUBLE_ON" });
  lines.push({ text: "*** " + (ticket.stationName || "KITCHEN") + " ***\n" });
  lines.push({ cmd: "DOUBLE_OFF" }, { cmd: "BOLD_OFF" });
  lines.push({ text: "Meja: " + ticket.table + "  |  " + ticket.orderType + "\n" });
  lines.push({ text: new Date().toLocaleTimeString("id-ID") + "\n" });
  lines.push({ text: "=".repeat(width) + "\n" });
  lines.push({ cmd: "ALIGN_L" });
  for (const item of ticket.items) {
    lines.push({ cmd: "BOLD_ON" }, { cmd: "DOUBLE_ON" });
    lines.push({ text: item + "\n" });
    lines.push({ cmd: "DOUBLE_OFF" }, { cmd: "BOLD_OFF" });
  }
  lines.push({ text: "=".repeat(width) + "\n" });
  lines.push({ text: "\n\n\n" }, { cmd: "CUT" });
  return lines;
}

function renderToBytes(lines) {
  const chunks = [escpos([CMD.INIT])];
  for (const l of lines) {
    if (l.cmd && CMD[l.cmd])   chunks.push(escpos([CMD[l.cmd]]));
    else if (l.text)           chunks.push(escpos([l.text]));
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export function usePrinter() {
  const [printers, setPrinters] = useState(loadPrinters);
  const [scanning, setScanning] = useState(false);
  const deviceRefs = useRef({});
  const charRefs   = useRef({});

  const refresh = useCallback(next => {
    setPrinters(next);
    savePrinters(next);
  }, []);

  const scanAndPair = useCallback(async (role = "receipt") => {
    if (!navigator.bluetooth) throw new Error("Web Bluetooth not supported. Use Chrome on Android or desktop.");
    setScanning(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ["000018f0-0000-1000-8000-00805f9b34fb"] },
          { namePrefix: "Epson" }, { namePrefix: "Star" },
          { namePrefix: "MUNBYN" }, { namePrefix: "Rongta" },
          { namePrefix: "RPP" }, { namePrefix: "MTP" },
          { namePrefix: "PT" }, { namePrefix: "Sewoo" },
        ],
        optionalServices: [
          "000018f0-0000-1000-8000-00805f9b34fb",
          "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
          "49535343-fe7d-4ae5-8fa9-9fafd205e455",
        ],
      });
      const existing = printers.find(p => p.deviceId === device.id);
      const np = {
        id:        existing?.id || crypto.randomUUID(),
        name:      device.name || "Unknown Printer",
        deviceId:  device.id,
        role,
        paperSize: "80mm",
        connected: false,
      };
      deviceRefs.current[np.id] = device;
      const next = existing
        ? printers.map(p => p.id === existing.id ? { ...p, name: device.name || p.name } : p)
        : [...printers, np];
      refresh(next);
      return np;
    } finally { setScanning(false); }
  }, [printers, refresh]);

  const connect = useCallback(async (printerId) => {
    const printer = printers.find(p => p.id === printerId);
    if (!printer) throw new Error("Printer not found");
    let device = deviceRefs.current[printerId];
    if (!device) {
      if (navigator.bluetooth?.getDevices) {
        const devs = await navigator.bluetooth.getDevices();
        device = devs.find(d => d.id === printer.deviceId);
      }
      if (!device) throw new Error("Device not found. Please re-pair.");
      deviceRefs.current[printerId] = device;
    }
    const server = await device.gatt.connect();
    let characteristic;
    const uuids = [
      "000018f0-0000-1000-8000-00805f9b34fb",
      "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
      "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    ];
    for (const uuid of uuids) {
      try {
        const svc  = await server.getPrimaryService(uuid);
        const chars = await svc.getCharacteristics();
        characteristic = chars.find(c => c.properties.writeWithoutResponse || c.properties.write);
        if (characteristic) break;
      } catch { continue; }
    }
    if (!characteristic) throw new Error("No writable characteristic found.");
    charRefs.current[printerId] = characteristic;
    device.addEventListener("gattserverdisconnected", () => {
      refresh(printers.map(p => p.id === printerId ? { ...p, connected: false } : p));
      delete charRefs.current[printerId];
    });
    refresh(printers.map(p => p.id === printerId ? { ...p, connected: true } : p));
    return characteristic;
  }, [printers, refresh]);

  const disconnect = useCallback(async (printerId) => {
    const device = deviceRefs.current[printerId];
    if (device?.gatt?.connected) device.gatt.disconnect();
    delete charRefs.current[printerId];
    delete deviceRefs.current[printerId];
    refresh(printers.map(p => p.id === printerId ? { ...p, connected: false } : p));
  }, [printers, refresh]);

  const removePrinter  = useCallback(id => { disconnect(id); refresh(printers.filter(p => p.id !== id)); }, [printers, disconnect, refresh]);
  const updatePrinter  = useCallback((id, changes) => { refresh(printers.map(p => p.id === id ? { ...p, ...changes } : p)); }, [printers, refresh]);

  const printBytes = useCallback(async (printerId, bytes) => {
    let char = charRefs.current[printerId];
    if (!char) char = await connect(printerId);
    const CHUNK = 512;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk = bytes.slice(i, i + CHUNK);
      if (char.properties.writeWithoutResponse) await char.writeValueWithoutResponse(chunk);
      else await char.writeValue(chunk);
      await new Promise(r => setTimeout(r, 50));
    }
  }, [connect]);

  const printReceipt = useCallback(async (order, { outlet, tax, service } = {}) => {
    const printer = printers.find(p => p.role === "receipt" && p.connected);
    if (!printer) throw new Error("No receipt printer connected");
    await printBytes(printer.id, renderToBytes(buildReceiptData({ order, outlet, tax, service })));
  }, [printers, printBytes]);

  const printKitchenTicket = useCallback(async (ticket) => {
    const role = ticket.stationRole || "kitchen1";
    const printer = printers.find(p => p.role === role && p.connected)
                 || printers.find(p => (p.role === "kitchen1" || p.role === "kitchen2") && p.connected);
    if (!printer) throw new Error("No kitchen printer connected for " + role);
    await printBytes(printer.id, renderToBytes(buildKitchenData({ ticket })));
  }, [printers, printBytes]);

  const testPrint = useCallback(async (printerId) => {
    const lines = [
      { cmd: "ALIGN_C" }, { cmd: "BOLD_ON" }, { cmd: "DOUBLE_ON" },
      { text: "PawonLoka POS\n" },
      { cmd: "DOUBLE_OFF" }, { cmd: "BOLD_OFF" },
      { text: "Test Print\n" },
      { text: new Date().toLocaleString("id-ID") + "\n" },
      { text: "-------------------------------\n" },
      { text: "Printer OK!\n" },
      { text: "\n\n\n" }, { cmd: "CUT" },
    ];
    await printBytes(printerId, renderToBytes(lines));
  }, [printBytes]);

  return { printers, scanning, scanAndPair, connect, disconnect, removePrinter, updatePrinter, printReceipt, printKitchenTicket, testPrint };
}
