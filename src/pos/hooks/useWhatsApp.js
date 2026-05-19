
import { useCallback } from "react";

const RECEIPT_BASE = "https://pawonloka.pages.dev/receipt";

function fmt(n) { return "Rp " + Number(n || 0).toLocaleString("id-ID"); }

function cleanPhone(phone) {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0"))  p = "62" + p.slice(1);
  if (p.startsWith("+"))  p = p.slice(1);
  if (!p.startsWith("62")) p = "62" + p;
  return p;
}

export function useWhatsApp() {
  const sendReceipt = useCallback((order, customer, outlet = {}) => {
    if (!customer?.phone) throw new Error("No customer phone number");
    const phone      = cleanPhone(customer.phone);
    const total      = fmt(order.total);
    const code       = order.code || order.id;
    const table      = order.table || "Walk-in";
    const outletName = outlet.name || "PawonLoka";
    const receiptUrl = RECEIPT_BASE + "?id=" + order.id;
    const text =
      "Halo " + (customer.name || "Kak") + "!\n\n" +
      "Terima kasih sudah makan di " + outletName + "!\n\n" +
      "*Struk Digital*\n" +
      "No. Order : " + code + "\n" +
      "Meja      : " + table + "\n" +
      "Total     : " + total + "\n\n" +
      "Lihat struk lengkap:\n" +
      receiptUrl + "\n\n" +
      "Sampai jumpa lagi!";
    const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
    window.open(url, "_blank");
  }, []);

  const resendReceipt = useCallback((order, customer, outlet) => {
    sendReceipt(order, customer, outlet);
  }, [sendReceipt]);

  return { sendReceipt, resendReceipt };
}
