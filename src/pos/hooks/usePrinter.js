import { useState, useEffect, useCallback } from "react";
import { registerPlugin } from "@capacitor/core";

export const PrintBridge = registerPlugin("PrintBridge");

// Shift / close-of-day report printing — passed as JSON to Kotlin EscPosBuilder
export async function printShiftReport({ shift, report, paperSize = "80mm" }) {
  await PrintBridge.printTicket({
    station: "receipt",
    type: "shift",
    payload: JSON.stringify({ shift, report, paperSize }),
  });
}

export async function printProductSoldReport({ shift, productData, paperSize = "80mm" }) {
  await PrintBridge.printTicket({
    station: "receipt",
    type: "productsold",
    payload: JSON.stringify({ shift, productData, paperSize }),
  });
}

const isNative = () => !!window?.Capacitor?.isNativePlatform?.();

// no-op on web — Kotlin handles logo via URL in payload
export function prefetchLogo() {}

function fmt(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function buildReceiptPayload(order, opts = {}, paperSize = "80mm") {
  const { outlet, tax, service } = opts;
  const items = (order.items || []).map(i => ({
    name: i.name || "",
    qty: i.qty || 1,
    price: Math.round(i.price || 0),
    modifiers: i.modifiers || null,
    note: i.note || null,
    sku: i.sku || null,
    itemDisc: Math.round(i.itemDisc || i.discount || 0),
    itemDiscLabel: i.itemDiscLabel || null,
  }));

  // Prefer the order's own persisted subtotal/tax — recomputing tax from the raw
  // (pre-discount) subtotal here used to print a different tax figure than what was
  // actually charged and saved, even though the total line below already trusted
  // order.total — so the printed lines didn't add up to the printed total. Recomputing
  // is only a fallback for a pre-payment bill preview, where the order isn't saved yet.
  const rawSubtotal = items.reduce((s, i) => s + i.price * i.qty - i.itemDisc, 0);
  const subtotal = order.subtotal ?? rawSubtotal;
  const taxAmt   = order.tax ?? (tax?.enabled ? Math.round(subtotal * (tax.rate / 100)) : 0);
  const svcAmt   = service?.enabled ? Math.round(subtotal * (service.rate / 100)) : 0;
  const discount = Math.round(order.discount || 0);
  const total    = order.total ?? (subtotal + taxAmt + svcAmt - discount);
  const change   = Math.round(order.change || 0);

  const now = order.created_at ? new Date(order.created_at) : new Date();
  const datetime = now.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });

  return {
    orderId:  order.id || "",
    code:     order.code || null,
    items,
    subtotal,
    tax:      taxAmt,
    service:  svcAmt,
    discount,
    total,
    change,
    payments: (order.payments || []).map(p => ({ method: p.method || "", amount: Math.round(p.amount || 0) })),
    outlet:   outlet || {},
    taxSettings:     tax     ? { enabled: !!tax.enabled,     rate: tax.rate / 100,     label: tax.label || "PPN" } : null,
    serviceSettings: service ? { enabled: !!service.enabled, rate: service.rate / 100 } : null,
    table:    order.table || null,
    staff:    order.staff || order.cashier || null,
    datetime,
    paperSize,
  };
}

function buildPreBillPayload(order, opts = {}, paperSize = "80mm") {
  return {
    ...buildReceiptPayload(order, opts, paperSize),
    preBillNote:  opts.preBillNote  || "Ini bukan struk pembayaran",
    preBillNote2: opts.preBillNote2 || "",
    payments: [],
    change: 0,
  };
}

export function usePrinter() {
  const [printers, setPrinters]   = useState([]);
  const [printError, setPrintError] = useState(null);

  useEffect(() => {
    if (!isNative()) return;
    loadPrinters();
    const iv = setInterval(loadPrinters, 5000);
    return () => clearInterval(iv);
  }, []);

  async function loadPrinters() {
    try {
      const cfg = await PrintBridge.getPrinterConfig();
      const list = Object.entries(cfg)
        .filter(([, v]) => v?.mac)
        .map(([station, v]) => ({
          id: station,
          role: station,
          name: v.name || v.mac,
          mac: v.mac,
          connected: !!v.connected,
          paperSize: v.paperSize || "80mm",
        }));
      setPrinters(list);
    } catch (_) {}
  }

  const getPaperSize = useCallback((role) => {
    return printers.find(p => p.role === role)?.paperSize || "80mm";
  }, [printers]);

  const printReceipt = useCallback(async (order, opts = {}) => {
    if (!isNative()) throw new Error("Native printer only available on Android APK");
    const paperSize = getPaperSize("receipt");
    const payload = JSON.stringify(buildReceiptPayload(order, opts, paperSize));
    await PrintBridge.printTicket({ station: "receipt", type: "receipt", payload });
  }, [getPaperSize]);

  const printPreBill = useCallback(async (order, opts = {}) => {
    if (!isNative()) throw new Error("Native printer only available on Android APK");
    const paperSize = getPaperSize("receipt");
    const payload = JSON.stringify(buildPreBillPayload(order, opts, paperSize));
    await PrintBridge.printTicket({ station: "receipt", type: "prebill", payload });
  }, [getPaperSize]);

  const printKitchenTicket = useCallback(async (ticket) => {
    if (!isNative()) throw new Error("Native printer only available on Android APK");
    const station   = ticket.stationRole || "kitchen";
    const paperSize = getPaperSize(station) || ticket.paperSize || "80mm";
    const payload = JSON.stringify({ ...ticket, paperSize });
    await PrintBridge.printTicket({ station, type: "kitchen", payload });
  }, [getPaperSize]);

  const testPrint = useCallback(async (station) => {
    if (!isNative()) throw new Error("Native printer only available on Android APK");
    await PrintBridge.testPrint({ station: station || "receipt" });
  }, []);

  // In native mode the foreground service manages reconnection automatically.
  // This is exposed for UI compatibility but just re-starts the service if needed.
  const connect = useCallback(async () => {
    if (!isNative()) return;
    try { await PrintBridge.startService(); } catch (_) {}
  }, []);

  return {
    printers,
    printError,
    clearPrintError: () => setPrintError(null),
    printReceipt,
    printPreBill,
    printKitchenTicket,
    testPrint,
    connect,
    // stubs for web-bluetooth paths that no longer exist:
    scanning: false,
    loading: false,
    scanAndPair: async () => { throw new Error("Pair printers via Android Bluetooth Settings"); },
    reconnect: connect,
    disconnect: async () => {},
    removePrinter: async () => {},
    reloadPrinters: loadPrinters,
  };
}
