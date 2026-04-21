import { useState, useEffect, useCallback } from "react";

const VENDOR = {
  name: "Estuata Corp",
  email: "sales@estuata.com",
  address: "2059 NW 79th Ave Doral, FL 33122 US",
  phone: "(786) 728-8881",
  bank: { account: "9135580544", aba: "266086554", swift: "CITIUS33", bank: "Citibank" }
};

const MESSAGE_IDS = [
  "AAMkAGYxZDYxZmE0LTBkNDAtNDg2MS1iZWM5LWUyYjc2M2IyMTgxYQBGAAAAAACE8D5tPe_tRKSQhV3uKQgGBwCh4qUK6x_RTIOsEjzTMCzMAAAAZ1B6AACh4qUK6x_RTIOsEjzTMCzMAAPdmTg8AAA=",
  "AAMkAGYxZDYxZmE0LTBkNDAtNDg2MS1iZWM5LWUyYjc2M2IyMTgxYQBGAAAAAACE8D5tPe_tRKSQhV3uKQgGBwCh4qUK6x_RTIOsEjzTMCzMAAAAZ1B6AACh4qUK6x_RTIOsEjzTMCzMAAPdmTg7AAA=",
  "AAMkAGYxZDYxZmE0LTBkNDAtNDg2MS1iZWM5LWUyYjc2M2IyMTgxYQBGAAAAAACE8D5tPe_tRKSQhV3uKQgGBwCh4qUK6x_RTIOsEjzTMCzMAAAAZ1B6AACh4qUK6x_RTIOsEjzTMCzMAAPdmTg6AAA=",
  "AAMkAGYxZDYxZmE0LTBkNDAtNDg2MS1iZWM5LWUyYjc2M2IyMTgxYQBGAAAAAACE8D5tPe_tRKSQhV3uKQgGBwCh4qUK6x_RTIOsEjzTMCzMAAAAZ1B6AACh4qUK6x_RTIOsEjzTMCzMAAPdmTg5AAA=",
  "AAMkAGYxZDYxZmE0LTBkNDAtNDg2MS1iZWM5LWUyYjc2M2IyMTgxYQBGAAAAAACE8D5tPe_tRKSQhV3uKQgGBwCh4qUK6x_RTIOsEjzTMCzMAAAAZ1B6AACh4qUK6x_RTIOsEjzTMCzMAAPcde4hAAA="
];

function parseInvoiceHTML(html, isUnread) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const subjectEl = doc.querySelector("b");
  let invoiceNum = "?";
  const asuntoMatch = html.match(/Invoice (\d+) from/i);
  if (asuntoMatch) invoiceNum = asuntoMatch[1];
  const depositEl = doc.querySelector(".depositSection");
  let total = 0;
  if (depositEl) {
    const m = depositEl.textContent.match(/[\d,]+\.?\d*/);
    if (m) total = parseFloat(m[0].replace(/,/g, ""));
  }
  const items = [];
  doc.querySelectorAll(".line-item-container").forEach(block => {
    const descEl = block.querySelector(".itemDesc div");
    const detailEl = block.querySelector(".itemDetails td");
    const amountEl = block.querySelector(".itemAmount");
    if (!descEl) return;
    const fullDesc = descEl.textContent.trim();
    const skuMatch = fullDesc.match(/^([A-Z0-9][A-Z0-9\-]+)\s/);
    const sku = skuMatch ? skuMatch[1] : "";
    const desc = sku ? fullDesc.replace(sku, "").trim() : fullDesc;
    let qty = 1, unitPrice = 0, lineTotal = 0;
    if (detailEl) {
      const m = detailEl.textContent.match(/(\d+)\s*X\s*USD\s*([\d,]+\.?\d*)/i);
      if (m) { qty = parseInt(m[1]); unitPrice = parseFloat(m[2].replace(/,/g, "")); }
    }
    if (amountEl) {
      const m = amountEl.textContent.match(/[\d,]+\.?\d*/);
      if (m) lineTotal = parseFloat(m[0].replace(/,/g, ""));
    }
    if (sku || desc) items.push({ sku, desc, qty, unitPrice, lineTotal });
  });
  const billToEl = doc.querySelector(".billToContent div");
  const client = billToEl ? billToEl.textContent.split("\n")[0].trim() : "ANYX SRL";
  const termsEl = doc.querySelector(".shippingContent");
  const terms = termsEl ? termsEl.textContent.trim().replace(/\s+/g, " ") : "2 días";
  const incoEl = doc.querySelector(".customFieldText div");
  const incoterms = incoEl ? incoEl.textContent.trim() : "FOB";
  return { invoiceNum, client, total, items, date: new Date().toISOString().split("T")[0], terms, incoterms, isUnread };
}

async function fetchInvoices(setStatus) {
  const results = [];
  for (let i = 0; i < MESSAGE_IDS.length; i++) {
    setStatus(`Procesando factura ${i + 1} de ${MESSAGE_IDS.length}…`);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `Sos un extractor de datos de facturas QuickBooks. Lee el email de Outlook con el mensaje ID dado y extraé los datos. Responde SOLO JSON sin backticks:
{"invoiceNum":"XXXX","client":"nombre","date":"YYYY-MM-DD","total":0.00,"terms":"X","incoterms":"X","isUnread":true,"items":[{"sku":"","desc":"","qty":1,"unitPrice":0.00,"lineTotal":0.00}]}`,
          mcp_servers: [{ type: "url", url: "https://microsoft365.mcp.claude.com/mcp", name: "microsoft365" }],
          messages: [{ role: "user", content: `Leé el email de Outlook con URI: mail:///messages/${MESSAGE_IDS[i]} y extraé todos los datos de la factura. Devolvé solo el JSON.` }]
        })
      });
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) results.push(JSON.parse(jsonMatch[0]));
    } catch (e) { console.warn("Error procesando", i, e); }
  }
  return results;
}

function buildQBPayload(inv) {
  return {
    VendorRef: { name: VENDOR.name },
    POStatus: "Open",
    TxnDate: inv.date,
    DocNumber: `OC-${inv.invoiceNum}`,
    Memo: `Basado en Invoice #${inv.invoiceNum} de Estuata Corp. ${inv.incoterms} · ${inv.terms}. Wire: ${VENDOR.bank.bank} Acc#${VENDOR.bank.account} ABA:${VENDOR.bank.aba} SWIFT:${VENDOR.bank.swift}`,
    Line: inv.items.map((it, i) => ({
      Id: String(i + 1),
      LineNum: i + 1,
      Description: `${it.sku ? it.sku + " - " : ""}${it.desc}`,
      Amount: it.lineTotal,
      DetailType: "ItemBasedExpenseLineDetail",
      ItemBasedExpenseLineDetail: {
        ItemRef: { name: it.sku || it.desc.substring(0, 30) },
        Qty: it.qty,
        UnitPrice: it.unitPrice,
        BillableStatus: "NotBillable"
      }
    })),
    ShipAddr: {
      Line1: "Av. SAN ISIDRO LABRADOR 4471",
      City: "Buenos Aires",
      CountrySubDivisionCode: "BA",
      PostalCode: "1429",
      Country: "AR"
    }
  };
}

const DEMO_INVOICES = [
  {
    invoiceNum: "15116", client: "ANYX SRL 30-68991692-5", date: "2026-04-20",
    total: 1840.00, terms: "2 Days", incoterms: "FOB", isUnread: true,
    items: [
      { sku: "C11CF40202", desc: "Epson LQ-2090II N PTR UPS 24 PIN 132 COL", qty: 1, unitPrice: 900.00, lineTotal: 900.00 },
      { sku: "EF-DX720UBEGUJ", desc: "Samsung Galaxy Tab S9 Funda con Teclado FE Book Slim", qty: 7, unitPrice: 110.00, lineTotal: 770.00 },
      { sku: "830272-B21", desc: "HP 1600W Flex Slot Platinum Power Supply", qty: 1, unitPrice: 170.00, lineTotal: 170.00 }
    ]
  },
  {
    invoiceNum: "15115", client: "ANYX SRL 30-68991692-5", date: "2026-04-20",
    total: 2220.00, terms: "2 Days", incoterms: "FOB", isUnread: false,
    items: [
      { sku: "C11CF40202", desc: "Epson LQ-2090II N PTR UPS 24 PIN 132 COL", qty: 1, unitPrice: 900.00, lineTotal: 900.00 },
      { sku: "KCP556SD8-32", desc: "32GB DDR5 5600MT/s Non-ECC Unbuffered SODIMM", qty: 4, unitPrice: 330.00, lineTotal: 1320.00 }
    ]
  },
  {
    invoiceNum: "15114", client: "ANYX SRL 30-68991692-5", date: "2026-04-20",
    total: 1540.00, terms: "2 Days", incoterms: "FOB", isUnread: false,
    items: [
      { sku: "P44597-B21", desc: "HPE 32GB DDR5-4800 ECC RDIMM Server Memory", qty: 2, unitPrice: 420.00, lineTotal: 840.00 },
      { sku: "867960-B21", desc: "HPE 480GB SATA SSD 2.5in SC Mixed Use", qty: 1, unitPrice: 700.00, lineTotal: 700.00 }
    ]
  },
  {
    invoiceNum: "15113", client: "ANYX SRL 30-68991692-5", date: "2026-04-19",
    total: 980.00, terms: "2 Days", incoterms: "FOB", isUnread: false,
    items: [
      { sku: "JM4800ASE-16G", desc: "Transcend 16GB DDR5 4800MHz SO-DIMM RAM Module", qty: 2, unitPrice: 490.00, lineTotal: 980.00 }
    ]
  }
];

const fmt = (n) => n?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0.00";

export default function App() {
  const [tab, setTab] = useState("facturas");
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [selectedInv, setSelectedInv] = useState(null);
  const [qbPayload, setQbPayload] = useState(null);
  const [copied, setCopied] = useState(false);
  const [qbStep, setQbStep] = useState(1);

  const totalAmount = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const unreadCount = invoices.filter(i => i.isUnread).length;

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setStatus("Conectando con Outlook…");
    try {
      const data = await fetchInvoices(setStatus);
      setInvoices(data.length ? data : DEMO_INVOICES);
      setStatus(data.length ? `${data.length} facturas cargadas desde Outlook` : "Usando datos de demostración");
    } catch (e) {
      setInvoices(DEMO_INVOICES);
      setStatus("Usando datos de demostración");
    }
    setLoading(false);
  }, []);

  const openQB = (inv) => {
    setSelectedInv(inv);
    setQbPayload(buildQBPayload(inv));
    setQbStep(1);
    setTab("qb");
  };

  const copyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(qbPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace", minHeight: "100vh", background: "var(--color-background-tertiary)", padding: "0" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "1rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#0A2540", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="#00D4AA" strokeWidth="1.5"/><path d="M8 12h8M8 8h5M8 16h3" stroke="#00D4AA" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.3px", color: "var(--color-text-primary)", fontFamily: "'IBM Plex Sans', sans-serif" }}>Estuata Invoice Processor</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Outlook → QuickBooks</div>
          </div>
        </div>
        {invoices.length > 0 && (
          <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "var(--color-text-secondary)" }}>Total procesado</div>
              <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'IBM Plex Sans', sans-serif" }}>USD {fmt(totalAmount)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "var(--color-text-secondary)" }}>Sin procesar</div>
              <div style={{ fontWeight: 600, color: unreadCount > 0 ? "#E8A020" : "var(--color-text-secondary)", fontFamily: "'IBM Plex Sans', sans-serif" }}>{unreadCount} facturas</div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "0 1.5rem", display: "flex", gap: 0 }}>
        {[
          { key: "facturas", label: "Facturas recibidas" },
          { key: "qb", label: "Cargar en QuickBooks" }
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "10px 16px", fontSize: 13, border: "none", background: "none", cursor: "pointer",
            fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: tab === t.key ? 600 : 400,
            color: tab === t.key ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            borderBottom: tab === t.key ? "2px solid var(--color-text-primary)" : "2px solid transparent",
            marginBottom: -1
          }}>{t.label}{t.key === "facturas" && unreadCount > 0 && (
            <span style={{ marginLeft: 6, background: "#E8A020", color: "#fff", fontSize: 10, padding: "1px 6px", borderRadius: 10, fontWeight: 600 }}>{unreadCount}</span>
          )}</button>
        ))}
      </div>

      <div style={{ padding: "1.5rem" }}>

        {/* TAB: FACTURAS */}
        {tab === "facturas" && (
          <div>
            {/* Metrics */}
            {invoices.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Facturas", value: invoices.length },
                  { label: "Sin leer", value: unreadCount, accent: unreadCount > 0 },
                  { label: "Total USD", value: `$${fmt(totalAmount)}` },
                  { label: "Proveedor", value: "Estuata Corp" }
                ].map((m, i) => (
                  <div key={i} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>{m.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: m.accent ? "#E8A020" : "var(--color-text-primary)", fontFamily: "'IBM Plex Sans', sans-serif" }}>{m.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Load button */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button onClick={loadInvoices} disabled={loading} style={{
                padding: "8px 18px", fontSize: 13, border: "0.5px solid var(--color-border-secondary)",
                borderRadius: 8, cursor: loading ? "wait" : "pointer", background: "#0A2540", color: "#fff",
                fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 500, display: "flex", alignItems: "center", gap: 8
              }}>
                {loading ? <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> : "↻"}
                {loading ? status : "Sincronizar desde Outlook"}
              </button>
              {invoices.length > 0 && (
                <button onClick={() => { const unread = invoices.filter(i => i.isUnread); if (unread.length) openQB(unread[0]); }} style={{
                  padding: "8px 18px", fontSize: 13, border: "0.5px solid var(--color-border-secondary)",
                  borderRadius: 8, cursor: "pointer", background: "none", color: "var(--color-text-primary)",
                  fontFamily: "'IBM Plex Sans', sans-serif"
                }}>Procesar nuevas en QuickBooks →</button>
              )}
            </div>

            {/* Invoice list */}
            {invoices.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "4rem", color: "var(--color-text-secondary)", fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📥</div>
                Hacé clic en "Sincronizar desde Outlook" para cargar las facturas de la carpeta <strong>invoice Estuata</strong>
              </div>
            )}

            {invoices.map((inv, idx) => (
              <div key={idx} style={{
                background: "var(--color-background-primary)", border: `0.5px solid ${inv.isUnread ? "#E8A020" : "var(--color-border-tertiary)"}`,
                borderRadius: 10, marginBottom: 8, overflow: "hidden"
              }}>
                <div onClick={() => setExpanded(expanded === idx ? null : idx)} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {inv.isUnread && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8A020", flexShrink: 0 }} />}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>Invoice #{inv.invoiceNum}</span>
                        {inv.isUnread && <span style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E", padding: "1px 7px", borderRadius: 8, fontWeight: 600 }}>NUEVA</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                        {inv.client} · {inv.date} · {inv.incoterms} · {inv.items?.length || 0} ítems
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>USD {fmt(inv.total)}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{inv.terms}</div>
                    </div>
                    <span style={{ color: "var(--color-text-secondary)", fontSize: 18 }}>{expanded === idx ? "−" : "+"}</span>
                  </div>
                </div>

                {expanded === idx && (
                  <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "0 16px 16px" }}>
                    <table style={{ width: "100%", fontSize: 12, marginTop: 12, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ color: "var(--color-text-secondary)", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.5px" }}>
                          <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500 }}>SKU</th>
                          <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 500 }}>Descripción</th>
                          <th style={{ textAlign: "center", padding: "6px 0", fontWeight: 500 }}>Cant</th>
                          <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500 }}>P. Unit.</th>
                          <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 500 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(inv.items || []).map((it, i) => (
                          <tr key={i} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                            <td style={{ padding: "8px 0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#0077CC" }}>{it.sku || "—"}</td>
                            <td style={{ padding: "8px 12px 8px 0", color: "var(--color-text-primary)", fontFamily: "'IBM Plex Sans', sans-serif" }}>{it.desc}</td>
                            <td style={{ textAlign: "center", padding: "8px 0" }}>{it.qty}</td>
                            <td style={{ textAlign: "right", padding: "8px 0" }}>${fmt(it.unitPrice)}</td>
                            <td style={{ textAlign: "right", padding: "8px 0", fontWeight: 600 }}>${fmt(it.lineTotal)}</td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                          <td colSpan={4} style={{ padding: "10px 0", textAlign: "right", fontWeight: 600, fontSize: 13, fontFamily: "'IBM Plex Sans', sans-serif" }}>Total USD</td>
                          <td style={{ textAlign: "right", padding: "10px 0", fontWeight: 700, fontSize: 14, fontFamily: "'IBM Plex Sans', sans-serif" }}>${fmt(inv.total)}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                      <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "var(--color-text-secondary)" }}>
                        Wire transfer: {VENDOR.bank.bank} · Acc# {VENDOR.bank.account} · ABA {VENDOR.bank.aba} · SWIFT {VENDOR.bank.swift}
                      </div>
                      <button onClick={() => openQB(inv)} style={{
                        padding: "8px 18px", background: "#0A2540", color: "#00D4AA", border: "none",
                        borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                        fontFamily: "'IBM Plex Sans', sans-serif", whiteSpace: "nowrap"
                      }}>
                        Crear OC en QB →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* TAB: QUICKBOOKS */}
        {tab === "qb" && (
          <div>
            {!selectedInv ? (
              <div style={{ textAlign: "center", padding: "4rem", color: "var(--color-text-secondary)", fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
                Seleccioná una factura desde la pestaña "Facturas" y hacé clic en <strong>Crear OC en QB →</strong>
              </div>
            ) : (
              <div>
                {/* Steps */}
                <div style={{ display: "flex", gap: 0, marginBottom: 24, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, overflow: "hidden" }}>
                  {[
                    { n: 1, label: "Revisar datos" },
                    { n: 2, label: "JSON para QuickBooks" },
                    { n: 3, label: "Instrucciones QB" }
                  ].map((s, i) => (
                    <button key={s.n} onClick={() => setQbStep(s.n)} style={{
                      flex: 1, padding: "12px", fontSize: 13, border: "none", borderRight: i < 2 ? "0.5px solid var(--color-border-tertiary)" : "none",
                      background: qbStep === s.n ? "#0A2540" : "transparent", color: qbStep === s.n ? "#fff" : "var(--color-text-secondary)",
                      cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: qbStep === s.n ? 600 : 400,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                    }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: qbStep === s.n ? "#00D4AA" : "var(--color-border-secondary)", color: qbStep === s.n ? "#0A2540" : "var(--color-text-secondary)", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{s.n}</span>
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Step 1: Revisar datos */}
                {qbStep === 1 && (
                  <div>
                    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "1.25rem", marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Resumen de la orden</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                        {[
                          { label: "Proveedor QB", value: VENDOR.name },
                          { label: "N° Doc OC", value: `OC-${selectedInv.invoiceNum}` },
                          { label: "Fecha", value: selectedInv.date },
                          { label: "Ref. Factura", value: `#${selectedInv.invoiceNum}` },
                          { label: "Incoterms", value: selectedInv.incoterms },
                          { label: "Condición pago", value: selectedInv.terms }
                        ].map((f, i) => (
                          <div key={i}>
                            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 2 }}>{f.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans', sans-serif" }}>{f.value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12 }}>
                        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ color: "var(--color-text-secondary)", fontSize: 10, textTransform: "uppercase" }}>
                              <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 500 }}>SKU / Item</th>
                              <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 500 }}>Descripción</th>
                              <th style={{ textAlign: "center", fontWeight: 500 }}>Cant</th>
                              <th style={{ textAlign: "right", fontWeight: 500 }}>P.U.</th>
                              <th style={{ textAlign: "right", fontWeight: 500 }}>Monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedInv.items.map((it, i) => (
                              <tr key={i} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                                <td style={{ padding: "8px 0", fontFamily: "'IBM Plex Mono', monospace", color: "#0077CC", fontSize: 11 }}>{it.sku}</td>
                                <td style={{ padding: "8px 12px 8px 0", fontFamily: "'IBM Plex Sans', sans-serif" }}>{it.desc}</td>
                                <td style={{ textAlign: "center" }}>{it.qty}</td>
                                <td style={{ textAlign: "right" }}>${fmt(it.unitPrice)}</td>
                                <td style={{ textAlign: "right", fontWeight: 600 }}>${fmt(it.lineTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ textAlign: "right", marginTop: 10, fontSize: 16, fontWeight: 700, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                          Total: USD {fmt(selectedInv.total)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={() => setQbStep(2)} style={{ padding: "10px 24px", background: "#0A2540", color: "#00D4AA", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                        Ver JSON para QuickBooks →
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: JSON */}
                {qbStep === 2 && (
                  <div>
                    <div style={{ background: "#0D1117", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "0.5px solid #30363D" }}>
                        <span style={{ fontSize: 12, color: "#8B949E", fontFamily: "'IBM Plex Mono', monospace" }}>QuickBooks API · PurchaseOrder payload</span>
                        <button onClick={copyPayload} style={{ padding: "4px 12px", background: "transparent", border: "0.5px solid #30363D", borderRadius: 6, color: copied ? "#00D4AA" : "#8B949E", fontSize: 12, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {copied ? "✓ copiado" : "copiar"}
                        </button>
                      </div>
                      <pre style={{ padding: "16px", color: "#E6EDF3", fontSize: 11, overflow: "auto", maxHeight: 400, margin: 0, lineHeight: 1.6, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {JSON.stringify(qbPayload, null, 2)}
                      </pre>
                    </div>
                    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "1rem", marginBottom: 12, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontFamily: "'IBM Plex Sans', sans-serif" }}>Endpoint QuickBooks API</div>
                      <code style={{ fontSize: 11, background: "var(--color-background-secondary)", padding: "4px 8px", borderRadius: 4, display: "block" }}>
                        POST https://quickbooks.api.intuit.com/v3/company/&#123;realmId&#125;/purchaseorder
                      </code>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <button onClick={() => setQbStep(1)} style={{ padding: "10px 18px", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "'IBM Plex Sans', sans-serif" }}>← Volver</button>
                      <button onClick={() => setQbStep(3)} style={{ padding: "10px 24px", background: "#0A2540", color: "#00D4AA", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                        Ver instrucciones QB →
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Instrucciones */}
                {qbStep === 3 && (
                  <div>
                    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "1.25rem", marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, fontFamily: "'IBM Plex Sans', sans-serif" }}>Cómo cargar la OC en QuickBooks</div>
                      {[
                        { n: "1", title: "Accedé a QuickBooks Online", desc: "Ingresá a tu cuenta en quickbooks.intuit.com" },
                        { n: "2", title: "Nueva Orden de Compra", desc: "Menú principal → + Nuevo → Proveedores → Orden de compra" },
                        { n: "3", title: "Proveedor", desc: `Seleccioná o creá "${VENDOR.name}" (sales@estuata.com)` },
                        { n: "4", title: "Completar los datos", desc: `N° OC: OC-${selectedInv.invoiceNum} · Fecha: ${selectedInv.date} · Dirección de envío: Av. SAN ISIDRO LABRADOR 4471, CABA` },
                        { n: "5", title: "Agregar ítems", desc: "Para cada línea: ingresá SKU en el campo Producto/Servicio, descripción, cantidad y precio unitario" },
                        { n: "6", title: "Memo / Mensaje al proveedor", desc: `Agregá los datos bancarios: Citibank Acc# ${VENDOR.bank.account} · ABA ${VENDOR.bank.aba} · SWIFT ${VENDOR.bank.swift}` },
                        { n: "7", title: "Guardar y enviar", desc: "Verificá que el total coincida con USD " + fmt(selectedInv.total) + " y guardá la OC" }
                      ].map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: i < 6 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#0A2540", color: "#00D4AA", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>{s.n}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, fontFamily: "'IBM Plex Sans', sans-serif" }}>{s.title}</div>
                            <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{s.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ background: "#F0FDF4", border: "0.5px solid #BBF7D0", borderRadius: 10, padding: "1rem", marginBottom: 12, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: "#166534", marginBottom: 4 }}>💡 Automatización futura con QB API</div>
                      <div style={{ color: "#15803D" }}>Con acceso a la API de QuickBooks (OAuth 2.0), el JSON del paso 2 se puede enviar directamente para crear la OC automáticamente sin pasos manuales. El endpoint es <code>POST /v3/company/&#123;realmId&#125;/purchaseorder</code>.</div>
                    </div>

                    <button onClick={() => setQbStep(2)} style={{ padding: "10px 18px", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "'IBM Plex Sans', sans-serif" }}>← Volver al JSON</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
