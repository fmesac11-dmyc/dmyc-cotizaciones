import {
  getSetting, setSetting,
  putQuote, getQuote, deleteQuote, listQuotes, replaceAllQuotes
} from "./db.js";

const IVA_RATE = 0.19;
const MIN_SEQ = 401;

const el = (id) => document.getElementById(id);

// Permite escribir 2,41 o 2.41
function parseNum(v) {
  if (v == null) return 0;
  const s = String(v).trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const normalize4 = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 4) || "XXXX";

function money(n, cur) {
  const decimals = (cur === "CLP") ? 0 : 2;
  const rounded = (cur === "CLP") ? Math.round(Number(n || 0)) : Number(n || 0);
  const opt = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return (cur === "USD" ? "US$ " : "$ ") + rounded.toLocaleString("es-CL", opt);
}

const pct = (n) => `${Number(n || 0).toFixed(2)}%`;

let editingId = null;

function todayISO() { return new Date().toISOString().slice(0, 10); }
function plusDaysISO(d) { return new Date(Date.now() + d * 86400000).toISOString().slice(0, 10); }

// Convierte YYYY-MM-DD a "día de mes de año" en español
function formatDateES(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                 "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const m = parseInt(month, 10) - 1;
  const d = parseInt(day, 10);
  const y = parseInt(year, 10);
  return `${d} de ${meses[m]} de ${y}`;
}

async function nextQuoteCode(clientName) {
  let seq = await getSetting("seq", MIN_SEQ);
  seq = Math.max(Number(seq || 0), MIN_SEQ);
  const code = `COT-${String(seq).padStart(4,'0')}-${normalize4(clientName)}`;
  return { seq, code };
}

// Margen sobre precio de venta:
// Precio = Costo / (1 - margen)
function unitPriceFromCostAndMargin(cost, marginPct) {
  const c = parseNum(cost);
  const m = parseNum(marginPct);
  if (c <= 0) return 0;
  if (m < 0 || m >= 100) return 0;
  return c / (1 - (m / 100));
}

// Para compatibilidad si viene unitPrice antiguo:
// margen% = (P - C) / P
function marginPctFromCostAndPrice(cost, unitPrice) {
  const c = parseNum(cost);
  const p = parseNum(unitPrice);
  if (p <= 0) return 0;
  return ((p - c) / p) * 100;
}

function formatInputNumber(n, cur) {
  if (!n) return "";
  return cur === "CLP" ? String(Math.round(n)) : Number(n).toFixed(2);
}

function readLines() {
  const cur = el("currency").value;
  const rows = [...document.querySelectorAll("[data-line]")];

  return rows.map(r => {
    const qty = parseNum(r.querySelector(".qty")?.value);
    const unitType = (r.querySelector(".unitType")?.value || "").trim();
    const name = (r.querySelector(".name")?.value || "").trim();
    const cost = parseNum(r.querySelector(".cost")?.value);
    const marginPct = parseNum(r.querySelector(".marginPct")?.value);

    let unitPrice = unitPriceFromCostAndMargin(cost, marginPct);
    if (cur === "CLP") unitPrice = Math.round(unitPrice);

    return { qty, unitType, name, cost, marginPct, unitPrice };
  }).filter(x => x.name && x.qty > 0);
}

function calc(lines) {
  const cur = el("currency").value;

  let sub = lines.reduce((a, l) => a + (l.qty * l.unitPrice), 0);
  if (cur === "CLP") sub = Math.round(sub);

  let iva = sub * IVA_RATE;
  if (cur === "CLP") iva = Math.round(iva);

  let tot = sub + iva;
  if (cur === "CLP") tot = Math.round(tot);

  return { cur, sub, iva, tot };
}

function refreshLineTotals() {
  const cur = el("currency").value;

  [...document.querySelectorAll("[data-line]")].forEach(r => {
    const qty = parseNum(r.querySelector(".qty")?.value);
    const cost = parseNum(r.querySelector(".cost")?.value);
    const marginPct = parseNum(r.querySelector(".marginPct")?.value);

    let unitPrice = unitPriceFromCostAndMargin(cost, marginPct);
    if (cur === "CLP") unitPrice = Math.round(unitPrice);

    let lineTotal = qty * unitPrice;
    if (cur === "CLP") lineTotal = Math.round(lineTotal);

    const unitPriceEl = r.querySelector(".unitPrice");
    if (unitPriceEl) unitPriceEl.value = formatInputNumber(unitPrice, cur);

    const lineTotalEl = r.querySelector(".lineTotal");
    if (lineTotalEl) lineTotalEl.textContent = money(lineTotal, cur);
  });
}

function renderTotals() {
  const lines = readLines();
  const { cur, sub, iva, tot } = calc(lines);
  el("subTotalCell").textContent = money(sub, cur);
  el("ivaCell").textContent = money(iva, cur);
  el("totalCell").textContent = money(tot, cur);
  el("pillCurrency").textContent = `Moneda: ${cur}`;
}

function addLine(pref = {}) {
  const tr = document.createElement("tr");
  tr.setAttribute("data-line", "1");

  tr.innerHTML = `
    <td><input class="qty" type="number" step="0.01" value="${pref.qty ?? ""}"></td>

    <td>
      <select class="unitType">
        <option value="UN" ${pref.unitType === "UN" ? "selected" : ""}>UN</option>
        <option value="HRS" ${pref.unitType === "HRS" ? "selected" : ""}>HRS</option>
        <option value="M2" ${pref.unitType === "M2" ? "selected" : ""}>M2</option>
        <option value="M3" ${pref.unitType === "M3" ? "selected" : ""}>M3</option>
        <option value="KG" ${pref.unitType === "KG" ? "selected" : ""}>KG</option>
        <option value="GL" ${pref.unitType === "GL" ? "selected" : ""}>GL</option>
      </select>
    </td>

    <td><input class="name" placeholder="Descripción del producto" value="${(pref.name ?? "").replaceAll('"', "&quot;")}"></td>

    <td><input class="cost" type="text" inputmode="decimal" value="${pref.cost ?? ""}" placeholder="Ej: 25000 o 2,41"></td>

    <td><input class="marginPct" type="text" inputmode="decimal" value="${pref.marginPct ?? 15}" placeholder="Ej: 15"></td>

    <td><input class="unitPrice" type="text" inputmode="decimal" value="${pref.unitPrice ?? ""}" readonly></td>

    <td class="lineTotal rightAlign"></td>

    <td><button class="btn btnD" type="button">X</button></td>
  `;

  tr.querySelector(".btnD").addEventListener("click", () => {
    tr.remove();
    refreshLineTotals();
    renderTotals();
  });

  ["qty", "unitType", "name", "cost", "marginPct"].forEach(cls =>
    tr.querySelector("." + cls).addEventListener("input", () => {
      refreshLineTotals();
      renderTotals();
    })
  );

  el("linesTbody").appendChild(tr);
  refreshLineTotals();
  renderTotals();
}

function readForm() {
  const lines = readLines();
  return {
    currency: el("currency").value,
    usdRate: parseNum(el("usdRate").value),
    state: el("state").value,
    quoteDate: el("quoteDate").value,
    validUntil: el("validUntil").value,
    nextContact: el("nextContact").value,

    clientName: el("clientName").value.trim(),
    clientCompany: el("clientCompany").value.trim(),
    clientRut: el("clientRut").value.trim(),
    clientEmail: el("clientEmail").value.trim(),
    clientPhone: el("clientPhone").value.trim(),
    clientAddress: el("clientAddress").value.trim(),
    clientCity: el("clientCity").value.trim(),
    notes: el("notes").value.trim(),

    optMakeExcel: el("optMakeExcel").checked,
    optMakePDF: el("optMakePDF").checked,

    lines,
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ===== helpers imagen -> base64 para jsPDF ===== */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function imageUrlToDataURL(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar imagen: " + url);
  const blob = await res.blob();
  return blobToDataURL(blob);
}

// Detecta formato desde el DataURL para pasar "PNG" o "JPEG" a addImage
function dataUrlToJsPdfFormat(dataUrl) {
  const m = String(dataUrl || "").match(/^data:image\/(png|jpeg|jpg);/i);
  const t = (m?.[1] || "").toLowerCase();
  if (t === "png") return "PNG";
  return "JPEG";
}

/*
  PDF: estilo DMYC
  - Logo centrado al inicio del header
  - Fechas en formato "día de mes de año"
  - Ajustes de espaciado para evitar superposición
*/
async function makePDFBlob(quote) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  const cur = quote.currency;
  const { sub, iva, tot } = quote.totals;

  // Paleta DMYC
  const naranja = "#FF5B00";
  const negro = "#1B1B1B";
  const turquesa = "#098F96";
  const gris = "#9E9EA0";
  const grisClaro = "#F4F4F4";

  const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    const bigint = parseInt(h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  };

  const setFillHex = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    doc.setFillColor(r, g, b);
  };

  const setTextHex = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    doc.setTextColor(r, g, b);
  };

  // ===== HEADER (aumentado a 22mm para más espacio) =====
  setFillHex(turquesa);
  doc.rect(0, 0, 210, 22, "F");

  // Bloque naranja derecho
  setFillHex(naranja);
  doc.rect(155, 0, 55, 22, "F");

  // Texto empresa (izquierda)
  setTextHex("#FFFFFF");
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("DMYC spa · 76.935.323-2", 14, 7);
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.text("Cerro el plomo 5931 of 1213, Las Condes", 14, 11);
  doc.text("Región Metropolitana", 14, 14);

 // ===== LOGO AL CENTRO (PNG, GRANDE Y PROPORCIONAL) =====
const LOGO_URL = "./DMYC_logotipo_Mesa-de-trabajo-1.png";

try {
  const logoDataUrl = await imageUrlToDataURL(LOGO_URL);

  // Más grande, pero sin salirse del header (22mm)
  const maxW = 65;
  const maxH = 19;

  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = logoDataUrl;
  });

  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;

  const scale = Math.min(maxW / iw, maxH / ih);
  const w = iw * scale;
  const h = ih * scale;

  const x = (210 - w) / 2;
  const y = (22 - h) / 2;

  doc.addImage(logoDataUrl, "PNG", x, y, w, h); // addImage(imgData, format, x, y, w, h) [web:11]
} catch {
  // Si no carga, seguimos sin logo
}



  // Título (derecha, ajustado hacia arriba)
  setTextHex("#FFFFFF");
  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.text("COTIZACIÓN", 160, 8);
  doc.setFontSize(10);
  doc.text(`N° ${quote.code}`, 160, 14);

  // ===== FECHA / VALIDEZ (con más espacio) =====
  setTextHex(negro);
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");

  let y = 30;
  const fechaFormato = formatDateES(quote.quoteDate);
  const validaFormato = formatDateES(quote.validUntil);

  doc.text(`FECHA: ${fechaFormato}`, 14, y);
  doc.text(`PRESUPUESTO VÁLIDO HASTA: ${validaFormato}`, 100, y);

  // ===== CLIENTE =====
  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("PRESUPUESTO PARA:", 14, y);

  y += 6;
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");

  const clientData = [
    `Contacto: ${quote.clientName || ""}`,
    `Empresa: ${quote.clientCompany || ""}`,
    `Rut: ${quote.clientRut || ""}`,
    `Dirección: ${quote.clientAddress || ""}`,
    `Ciudad: ${quote.clientCity || ""}`,
    `Teléfono: ${quote.clientPhone || ""}`,
    `Email: ${quote.clientEmail || ""}`,
  ];

  clientData.forEach(line => {
    doc.text(line, 14, y);
    y += 4;
  });

  // ===== AUTOR / VENDEDOR / TÉRMINOS (derecha, mejor espaciado) =====
  const xr = 125;
  const xv = 155;
  const y0 = 40;

  doc.setFontSize(10);

  doc.setFont(undefined, "bold");
  doc.text("AUTOR:", xr, y0);
  doc.setFont(undefined, "normal");
  doc.text("FMC", xv, y0);

  doc.setFont(undefined, "bold");
  doc.text("VENDEDOR:", xr, y0 + 9);
  doc.setFont(undefined, "normal");
  doc.text("FMC", xv, y0 + 9);

  doc.setFont(undefined, "bold");
  doc.text("TÉRMINOS:", xr, y0 + 18);
  doc.setFont(undefined, "normal");
  doc.text("Pago Transferencia", xv, y0 + 18);

  // ===== TABLA =====
  y = 80;

  // Encabezado tabla
  setFillHex(turquesa);
  doc.rect(14, y - 4, 182, 7, "F");

  setTextHex("#FFFFFF");
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("CANTIDAD", 16, y);
  doc.text("DESCRIPCIÓN", 34, y);
  doc.text("PRECIO POR UNIDAD", 132, y, { align: "right" });
  doc.text("UNIDAD", 150, y);
  doc.text("TOTAL", 196, y, { align: "right" });

  // Filas
  y += 9;
  setTextHex(negro);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");

  quote.lines.forEach((line, idx) => {
    if (idx % 2 === 0) {
      setFillHex(grisClaro);
      doc.rect(14, y - 5, 182, 8, "F");
    }

    const qty = String(line.qty ?? "");
    const unit = (line.unitType || "UN").toString();
    const desc = (line.name || "").toString();

    doc.text(qty, 16, y);
    doc.text(desc, 34, y, { maxWidth: 92 });
    doc.text(money(line.unitPrice, cur), 132, y, { align: "right" });
    doc.text(unit, 150, y);
    doc.text(money((line.qty || 0) * (line.unitPrice || 0), cur), 196, y, { align: "right" });

    y += 8;

    if (y > 230) y = 230;
  });

  // Línea separadora
  const { r: gr, g: gg, b: gb } = hexToRgb(gris);
  doc.setDrawColor(gr, gg, gb);
  doc.line(14, y, 196, y);

  // TOTALES (más ancho para valores)
const xLabel = 135;     // textos más a la izquierda
const xValue = 196;     // valores al borde derecho
const xBar = 132;       // barra TOTAL más larga
const wBar = 64;        // ancho barra TOTAL

y += 8;
doc.setFontSize(11);
doc.setFont(undefined, 'normal');

setTextHex(gris);
doc.text('SUBTOTAL', xLabel, y);
setTextHex(negro);
doc.text(money(sub, cur), xValue, y, { align: 'right' });

y += 8;
setTextHex(gris);
doc.text('MONTO IVA (19%)', xLabel, y);
setTextHex(negro);
doc.text(money(iva, cur), xValue, y, { align: 'right' });

y += 10;
setFillHex(naranja);
doc.rect(xBar, y - 7, wBar, 10, 'F');
setTextHex('FFFFFF');
doc.setFont(undefined, 'bold');
doc.text('TOTAL', xLabel, y);
doc.text(money(tot, cur), xValue, y, { align: 'right' });


  // ===== OBS =====
  y += 16;
  setTextHex(negro);
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("OBS:", 14, y);

  doc.setFont(undefined, "normal");
  doc.setFontSize(9);

  const obsText = (quote.notes || "").trim() || "—";
  const obsLines = doc.splitTextToSize(obsText, 182);
  doc.text(obsLines, 24, y);

  // ===== FOOTER =====
  let fy = 268;

  setTextHex(gris);
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.text(
    "Si tiene cualquier tipo de pregunta acerca de esta oferta, póngase en contacto indicando número de cotización.",
    14, fy, { maxWidth: 182 }
  );

  fy += 8;
  setTextHex(negro);
  doc.setFont(undefined, "bold");
  doc.text("TRANSFERENCIA:", 14, fy);
  doc.setFont(undefined, "normal");
  doc.text("DMYC Spa · Banco BCI · Cta. Cte. 95148019 · INFO@DMYC.CL", 14, fy + 4);

  // Barra final
  setFillHex(turquesa);
  doc.rect(0, 285, 210, 12, "F");
  setTextHex("#FFFFFF");
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("GRACIAS POR SU CONFIANZA.", 105, 292, { align: "center" });

  return doc.output("blob");
}

async function makeXLSXBlob(quote) {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const fechaFormato = formatDateES(quote.quoteDate);
  const validaFormato = formatDateES(quote.validUntil);

  const header = [
    ["COTIZACIÓN", quote.code],
    ["Fecha", fechaFormato],
    ["Válida hasta", validaFormato],
    ["Cliente", quote.clientName],
    ["Empresa", quote.clientCompany],
    ["RUT", quote.clientRut],
    ["Email", quote.clientEmail],
    ["Teléfono", quote.clientPhone],
    ["Dirección", quote.clientAddress],
    ["Ciudad", quote.clientCity],
    ["Moneda", quote.currency],
    ["Estado", quote.state],
    ["Observaciones", quote.notes],
    [],
    ["Cantidad", "Unidad", "Descripción", "Costo", "Margen %", "Precio Unit", "Total Línea"],
  ];

  const isCLP = quote.currency === "CLP";

  const lines = quote.lines.map(l => {
    const cost = isCLP ? Math.round(l.cost) : l.cost;
    const unitPrice = isCLP ? Math.round(l.unitPrice) : l.unitPrice;
    const totalLine = isCLP ? Math.round((l.qty || 0) * unitPrice) : ((l.qty || 0) * unitPrice);
    return ([
      l.qty,
      l.unitType || "UN",
      l.name,
      cost,
      l.marginPct,
      unitPrice,
      totalLine
    ]);
  });

  const totals = [
    [],
    ["SUBTOTAL", isCLP ? Math.round(quote.totals.sub) : quote.totals.sub],
    ["IVA 19%", isCLP ? Math.round(quote.totals.iva) : quote.totals.iva],
    ["TOTAL", isCLP ? Math.round(quote.totals.tot) : quote.totals.tot],
  ];

  const ws = XLSX.utils.aoa_to_sheet([...header, ...lines, ...totals]);
  XLSX.utils.book_append_sheet(wb, ws, "Cotizacion");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function refreshHistory() {
  const all = await listQuotes();
  const term = (el("qSearch").value || "").toLowerCase().trim();

  const rows = all
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .filter(q => {
      if (!term) return true;
      return [q.code, q.clientName, q.clientRut, q.clientCompany].join(" ").toLowerCase().includes(term);
    });

  el("histTbody").innerHTML = rows.map(q => `
    <tr>
      <td>${q.code}</td>
      <td>${formatDateES(q.quoteDate)}</td>
      <td>${q.clientName}</td>
      <td>${q.currency}</td>
      <td class="rightAlign">${money(q.totals.tot, q.currency)}</td>
      <td>${q.state}</td>
      <td>
        <button class="btn btnW" data-edit="${q.id}" type="button">Editar</button>
        <button class="btn btnD" data-del="${q.id}" type="button">Eliminar</button>
        <button class="btn btnS" data-pdf="${q.id}" type="button">PDF</button>
        <button class="btn btnS" data-xlsx="${q.id}" type="button">Excel</button>
      </td>
    </tr>
  `).join("");

  el("histTbody").querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", async () => {
    await loadForEdit(b.getAttribute("data-edit"));
  }));

  el("histTbody").querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    const id = b.getAttribute("data-del");
    if (!confirm("¿Eliminar cotización?")) return;
    await deleteQuote(id);
    await refreshHistory();
  }));

  el("histTbody").querySelectorAll("[data-pdf]").forEach(b => b.addEventListener("click", async () => {
    const q = await getQuote(b.getAttribute("data-pdf"));
    if (!q) return;
    const pdfBlob = await makePDFBlob(q);
    downloadBlob(pdfBlob, `${q.code}.pdf`);
  }));

  el("histTbody").querySelectorAll("[data-xlsx]").forEach(b => b.addEventListener("click", async () => {
    const q = await getQuote(b.getAttribute("data-xlsx"));
    if (!q) return;
    const xlsxBlob = await makeXLSXBlob(q);
    downloadBlob(xlsxBlob, `${q.code}.xlsx`);
  }));
}

async function loadForEdit(id) {
  const q = await getQuote(id);
  if (!q) return alert("No encontrada");

  editingId = q.id;
  el("pillEditing").textContent = "Modo: Editar";

  el("currency").value = q.currency;
  el("usdRate").value = q.usdRate ?? 950;
  el("state").value = q.state;
  el("quoteDate").value = q.quoteDate;
  el("validUntil").value = q.validUntil;
  el("nextContact").value = q.nextContact ?? "";

  el("clientName").value = q.clientName;
  el("clientCompany").value = q.clientCompany;
  el("clientRut").value = q.clientRut;
  el("clientEmail").value = q.clientEmail;
  el("clientPhone").value = q.clientPhone;
  el("clientAddress").value = q.clientAddress;
  el("clientCity").value = q.clientCity;
  el("notes").value = q.notes;

  el("linesTbody").innerHTML = "";

  (q.lines || []).forEach(l => {
    const cost = parseNum(l.cost);

    const marginPct =
      (l.marginPct != null) ? parseNum(l.marginPct) :
      (l.unitPrice != null) ? marginPctFromCostAndPrice(cost, l.unitPrice) :
      15;

    let unitPrice = unitPriceFromCostAndMargin(cost, marginPct);
    if (q.currency === "CLP") unitPrice = Math.round(unitPrice);

    addLine({
      qty: l.qty ?? 0,
      unitType: l.unitType ?? "UN",
      name: l.name ?? "",
      cost,
      marginPct,
      unitPrice
    });
  });

  el("pillQuoteNo").textContent = q.code;

  refreshLineTotals();
  renderTotals();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  editingId = null;
  el("pillEditing").textContent = "Modo: Nueva";

  el("currency").value = "CLP";
  el("state").value = "Pendiente";
  el("quoteDate").value = todayISO();
  el("validUntil").value = plusDaysISO(5);
  el("nextContact").value = "";

  el("clientName").value = "";
  el("clientCompany").value = "";
  el("clientRut").value = "";
  el("clientEmail").value = "";
  el("clientPhone").value = "";
  el("clientAddress").value = "";
  el("clientCity").value = "";
  el("notes").value = "";

  el("linesTbody").innerHTML = "";
  addLine({ unitType: "UN", marginPct: 15 });

  (async () => {
    let seq = await getSetting("seq", MIN_SEQ);
seq = Math.max(Number(seq || 0), MIN_SEQ);
elpillQuoteNo.textContent = `COT-${String(seq).padStart(4,'0')}-XXXX`;

  })();

  refreshLineTotals();
  renderTotals();
}

async function handleSave() {
  const f = readForm();
  if (!f.clientName) return alert("Falta Cliente (nombre).");
  if (!f.lines.length) return alert("Agrega al menos 1 línea.");

  const totals = calc(f.lines);

  let seq, code;
  if (editingId) {
    const prev = await getQuote(editingId);
    seq = prev.seq;
    code = prev.code;
  } else {
    const nx = await nextQuoteCode(f.clientName);
    seq = nx.seq;
    code = nx.code;
  }

  const now = new Date().toISOString();

  const quote = {
    id: editingId || crypto.randomUUID(),
    seq,
    code,
    createdAt: editingId ? (await getQuote(editingId)).createdAt : now,
    updatedAt: now,
    ...f,
    totals
  };

  await putQuote(quote);
  if (!editingId) await setSetting("seq", seq + 1);

  el("pillQuoteNo").textContent = code;

  const jsonBlob = new Blob([JSON.stringify(quote, null, 2)], { type: "application/json" });
  downloadBlob(jsonBlob, `${code}.json`);

  if (f.optMakePDF) {
    const pdfBlob = await makePDFBlob(quote);
    downloadBlob(pdfBlob, `${code}.pdf`);
  }

  if (f.optMakeExcel) {
    const xlsxBlob = await makeXLSXBlob(quote);
    downloadBlob(xlsxBlob, `${code}.xlsx`);
  }

  await refreshHistory();
  alert(editingId ? "Cotización actualizada." : "Cotización guardada.");
  if (!editingId) resetForm();
}

async function exportDB() {
  const quotes = await listQuotes();

  const json = new Blob([JSON.stringify(quotes, null, 2)], { type: "application/json" });
  downloadBlob(json, "BaseDatos-DMYC.json");

  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const rows = quotes
    .sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||""))
    .map(q => ({
      codigo: q.code,
      fecha: formatDateES(q.quoteDate),
      valida_hasta: formatDateES(q.validUntil),
      proximo_contacto: q.nextContact ? formatDateES(q.nextContact) : "",
      estado: q.state,
      moneda: q.currency,
      subtotal: q.totals.sub,
      iva_19: q.totals.iva,
      total: q.totals.tot,
      cliente: q.clientName,
      empresa: q.clientCompany,
      rut: q.clientRut,
      email: q.clientEmail,
      telefono: q.clientPhone,
      direccion: q.clientAddress,
      ciudad: q.clientCity,
      observaciones: q.notes
    }));

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Cotizaciones");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const xlsx = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(xlsx, "BaseDatos-DMYC.xlsx");

  alert("Exportación lista (JSON + Excel).");
}

async function importDB() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch { return alert("JSON inválido."); }
    if (!Array.isArray(data)) return alert("El archivo debe contener un arreglo de cotizaciones.");

    if (!confirm("Esto reemplazará tu base de datos local. ¿Continuar?")) return;

    await replaceAllQuotes(data);

    const maxSeq = data.reduce((m, q) => Math.max(m, Number(q.seq || 0)), 0);
    await setSetting("seq", Math.max(maxSeq + 1, MIN_SEQ));


    await refreshHistory();
    resetForm();
    alert("Importación completada.");
  };
  input.click();
}

async function init() {
  const updateStatus = () => {
    el("statusLine").textContent = navigator.onLine
      ? "Online (sin nube) · guardando local"
      : "Offline · guardando local";
  };
  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  updateStatus();

  el("quoteDate").value = todayISO();
  el("validUntil").value = plusDaysISO(5);

  let seq = await getSetting("seq", MIN_SEQ);
seq = Math.max(Number(seq || 0), MIN_SEQ);
elpillQuoteNo.textContent = `COT-${String(seq).padStart(4,'0')}-XXXX`;


  el("btnAddLine").addEventListener("click", () => addLine({ unitType: "UN", marginPct: 15 }));
  el("btnSave").addEventListener("click", handleSave);
  el("btnNew").addEventListener("click", resetForm);
  el("btnRefresh").addEventListener("click", refreshHistory);
  el("qSearch").addEventListener("input", refreshHistory);

  el("currency").addEventListener("change", () => {
    refreshLineTotals();
    renderTotals();
  });

  el("btnExportDB").addEventListener("click", exportDB);
  el("btnImportDB").addEventListener("click", importDB);

  // Instalación PWA (opcional)
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const b = el("btnInstall");
    if (b) b.style.display = "inline-block";
  });

  const btnInstall = el("btnInstall");
  if (btnInstall) {
    btnInstall.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btnInstall.style.display = "none";
    });
  }

  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }

  resetForm();
  await refreshHistory();
}

init();
