import { getSetting, setSetting, putQuote, getQuote, deleteQuote, listQuotes, replaceAllQuotes } from "./db.js";

const IVA_RATE = 0.19;
const MIN_SEQ = 401;
const LOGO_URL = "./DMYC_logotipo_Mesa-de-trabajo-1.jpg";

const el = (id) => document.getElementById(id);

// Cache elementos (evita ReferenceError)
const elpillQuoteNo = el("pillQuoteNo");
const elpillCurrency = el("pillCurrency");
const elpillIva = el("pillIva");
const elpillEditing = el("pillEditing");
const elstatusLine = el("statusLine");

const elcurrency = el("currency");
const elusdRate = el("usdRate");
const elstate = el("state");

const elquoteDate = el("quoteDate");
const elvalidUntil = el("validUntil");
const elnextContact = el("nextContact");

const elclientName = el("clientName");
const elclientCompany = el("clientCompany");
const elclientRut = el("clientRut");
const elclientEmail = el("clientEmail");
const elclientPhone = el("clientPhone");
const elclientAddress = el("clientAddress");
const elclientCity = el("clientCity");
const elnotes = el("notes");

const eloptMakeExcel = el("optMakeExcel");
const eloptMakePDF = el("optMakePDF");

const elbtnAddLine = el("btnAddLine");
const elbtnSave = el("btnSave");
const elbtnNew = el("btnNew");
const elbtnRefresh = el("btnRefresh");
const elbtnExportDB = el("btnExportDB");
const elbtnImportDB = el("btnImportDB");
const elbtnInstall = el("btnInstall");

const elqSearch = el("qSearch");
const elhistTbody = el("histTbody");

const ellinesTbody = el("linesTbody");
const elsubTotalCell = el("subTotalCell");
const elivaCell = el("ivaCell");
const eltotalCell = el("totalCell");

let editingId = null;

// Helpers
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
  const decimals = cur === "CLP" ? 0 : 2;
  const rounded = cur === "CLP" ? Math.round(Number(n || 0)) : Number(n || 0);
  const opt = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return (cur === "USD" ? "US$ " : "$ ") + rounded.toLocaleString("es-CL", opt);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(d) {
  return new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
}

function formatDateES(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const m = parseInt(month, 10) - 1;
  const dd = parseInt(day, 10);
  const y = parseInt(year, 10);
  return `${dd} de ${meses[m]} de ${y}`;
}

// Correlativo
async function nextQuoteCode(clientName) {
  let seq = await getSetting("seq", MIN_SEQ);
  seq = Math.max(Number(seq || 0), MIN_SEQ);
  const code = `COT-${String(seq).padStart(4, "0")}-${normalize4(clientName)}`;
  return { seq, code };
}

// Precio venta desde costo+margen%
function unitPriceFromCostAndMargin(cost, marginPct) {
  const c = parseNum(cost);
  const m = parseNum(marginPct);
  if (c <= 0) return 0;
  if (m < 0 || m >= 100) return 0;
  return c / (1 - m / 100);
}

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
  const cur = elcurrency.value;
  const rows = [...document.querySelectorAll("[data-line]")];
  return rows
    .map((r) => {
      const qty = parseNum(r.querySelector(".qty")?.value);
      const unitType = (r.querySelector(".unitType")?.value || "").trim();
      const name = (r.querySelector(".name")?.value || "").trim();
      const cost = parseNum(r.querySelector(".cost")?.value);
      const marginPct = parseNum(r.querySelector(".marginPct")?.value);

      let unitPrice = unitPriceFromCostAndMargin(cost, marginPct);
      if (cur === "CLP") unitPrice = Math.round(unitPrice);

      return { qty, unitType, name, cost, marginPct, unitPrice };
    })
    .filter((x) => x.name && x.qty > 0);
}

function calc(lines) {
  const cur = elcurrency.value;
  let sub = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
  if (cur === "CLP") sub = Math.round(sub);

  let iva = sub * IVA_RATE;
  if (cur === "CLP") iva = Math.round(iva);

  let tot = sub + iva;
  if (cur === "CLP") tot = Math.round(tot);

  return { cur, sub, iva, tot };
}

function refreshLineTotals() {
  const cur = elcurrency.value;
  [...document.querySelectorAll("[data-line]")].forEach((r) => {
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
  elsubTotalCell.textContent = money(sub, cur);
  elivaCell.textContent = money(iva, cur);
  eltotalCell.textContent = money(tot, cur);
  elpillCurrency.textContent = `Moneda: ${cur}`;
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
    <td><input class="cost" type="text" inputmode="decimal" placeholder="Ej 25000 o 2,41" value="${pref.cost ?? ""}"></td>
    <td><input class="marginPct" type="text" inputmode="decimal" placeholder="Ej 15" value="${pref.marginPct ?? 15}"></td>
    <td><input class="unitPrice" type="text" inputmode="decimal" value="${pref.unitPrice ?? ""}" readonly></td>
    <td class="lineTotal rightAlign"></td>
    <td><button class="btn btnD btnDel" type="button">X</button></td>
  `;

  tr.querySelector(".btnDel").addEventListener("click", () => {
    tr.remove();
    refreshLineTotals();
    renderTotals();
  });

  ["qty", "unitType", "name", "cost", "marginPct"].forEach((cls) => {
    tr.querySelector("." + cls).addEventListener("input", () => {
      refreshLineTotals();
      renderTotals();
    });
  });

  ellinesTbody.appendChild(tr);
  refreshLineTotals();
  renderTotals();
}

function readForm() {
  const lines = readLines();
  return {
    currency: elcurrency.value,
    usdRate: parseNum(elusdRate.value),
    state: elstate.value,
    quoteDate: elquoteDate.value,
    validUntil: elvalidUntil.value,
    nextContact: elnextContact.value,
    clientName: elclientName.value.trim(),
    clientCompany: elclientCompany.value.trim(),
    clientRut: elclientRut.value.trim(),
    clientEmail: elclientEmail.value.trim(),
    clientPhone: elclientPhone.value.trim(),
    clientAddress: elclientAddress.value.trim(),
    clientCity: elclientCity.value.trim(),
    notes: elnotes.value.trim(),
    optMakeExcel: eloptMakeExcel.checked,
    optMakePDF: eloptMakePDF.checked,
    lines
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

async function blobToDataURL(blob) {
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

function dataUrlToJsPdfFormat(dataUrl) {
  const m = String(dataUrl).match(/^data:image\/(png|jpeg|jpg)/i);
  const t = (m?.[1] || "").toLowerCase();
  return t === "png" ? "PNG" : "JPEG";
}

// PDF
async function makePDFBlob(quote) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  const cur = quote.currency;
  const { sub, iva, tot } = quote.totals;

  const naranja = "FF5B00";
  const negro = "1B1B1B";
  const turquesa = "098F96";
  const gris = "9E9EA0";
  const grisClaro = "F4F4F4";

  const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    const bigint = parseInt(h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  };
  const setFillHex = (hex) => { const {r,g,b} = hexToRgb(hex); doc.setFillColor(r,g,b); };
  const setTextHex = (hex) => { const {r,g,b} = hexToRgb(hex); doc.setTextColor(r,g,b); };

  // Header
  setFillHex(turquesa);
  doc.rect(0, 0, 210, 22, "F");
  setFillHex(naranja);
  doc.rect(155, 0, 55, 22, "F");

  setTextHex("FFFFFF");
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("DMYC spa 76.935.323-2", 14, 7);
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.text("Cerro el plomo 5931 of 1213, Las Condes", 14, 11);
  doc.text("Región Metropolitana", 14, 14);

  // Logo centro
  try {
    const logoDataUrl = await imageUrlToDataURL(LOGO_URL);
    const fmt = dataUrlToJsPdfFormat(logoDataUrl);

    const maxW = 65, maxH = 19;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = logoDataUrl; });

    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const scale = Math.min(maxW / iw, maxH / ih);
    const w = iw * scale;
    const h = ih * scale;
    const x = (210 - w) / 2;
    const y = (22 - h) / 2;
    doc.addImage(logoDataUrl, fmt, x, y, w, h);
  } catch {}

  setTextHex("FFFFFF");
  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.text("COTIZACIÓN", 160, 8);
  doc.setFontSize(10);
  doc.text(`N° ${quote.code}`, 160, 14);

  // Fechas
  setTextHex(negro);
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  let y = 30;

  doc.text(`FECHA: ${formatDateES(quote.quoteDate)}`, 14, y);
  doc.text(`PRESUPUESTO VÁLIDO HASTA: ${formatDateES(quote.validUntil)}`, 100, y);

  // Cliente
  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("PRESUPUESTO PARA", 14, y);

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
    `Email: ${quote.clientEmail || ""}`
  ];
  clientData.forEach((line) => { doc.text(line, 14, y); y += 4; });

  // Autor/Vendedor/Términos
  const xr = 125, xv = 155, y0 = 40;
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("AUTOR", xr, y0);
  doc.setFont(undefined, "normal");
  doc.text("FMC", xv, y0);

  doc.setFont(undefined, "bold");
  doc.text("VENDEDOR", xr, y0 + 9);
  doc.setFont(undefined, "normal");
  doc.text("FMC", xv, y0 + 9);

  doc.setFont(undefined, "bold");
  doc.text("TÉRMINOS", xr, y0 + 18);
  doc.setFont(undefined, "normal");
  doc.text("Pago Transferencia", xv, y0 + 18);

  // Tabla
  y = 80;
  setFillHex(turquesa);
  doc.rect(14, y - 4, 182, 7, "F");
  setTextHex("FFFFFF");
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("CANTIDAD", 16, y);
  doc.text("DESCRIPCIÓN", 34, y);
  doc.text("PRECIO POR UNIDAD", 132, y, { align: "right" });
  doc.text("UNIDAD", 150, y);
  doc.text("TOTAL", 196, y, { align: "right" });

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

  // Línea
  const { r, g, b } = hexToRgb(gris);
  doc.setDrawColor(r, g, b);
  doc.line(14, y, 196, y);

  // Totales (con más espacio)
  const xLabel = 135;
  const xValue = 196;
  const xBar = 132;
  const wBar = 64;

  y += 8;
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");

  setTextHex(gris);
  doc.text("SUBTOTAL", xLabel, y);
  setTextHex(negro);
  doc.text(money(sub, cur), xValue, y, { align: "right" });

  y += 8;
  setTextHex(gris);
  doc.text("MONTO IVA (19%)", xLabel, y);
  setTextHex(negro);
  doc.text(money(iva, cur), xValue, y, { align: "right" });

  y += 10;
  setFillHex(naranja);
  doc.rect(xBar, y - 7, wBar, 10, "F");
  setTextHex("FFFFFF");
  doc.setFont(undefined, "bold");
  doc.text("TOTAL", xLabel, y);
  doc.text(money(tot, cur), xValue, y, { align: "right" });

  // Obs
  y += 16;
  setTextHex(negro);
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("OBS", 14, y);

  doc.setFont(undefined, "normal");
  doc.setFontSize(9);
  const obsText = (quote.notes || "").trim();
  const obsLines = doc.splitTextToSize(obsText, 182);
  doc.text(obsLines, 24, y);

  // Footer
  let fy = 268;
  setTextHex(gris);
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.text("Si tiene cualquier tipo de pregunta acerca de esta oferta, póngase en contacto indicando número de cotización.", 14, fy, { maxWidth: 182 });

  fy += 8;
  setTextHex(negro);
  doc.setFont(undefined, "bold");
  doc.text("TRANSFERENCIA", 14, fy);

  doc.setFont(undefined, "normal");
  doc.text("DMYC Spa Banco BCI Cta. Cte. 95148019 INFODMYC.CL", 14, fy + 4);

  setFillHex(turquesa);
  doc.rect(0, 285, 210, 12, "F");
  setTextHex("FFFFFF");
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("GRACIAS POR SU CONFIANZA.", 105, 292, { align: "center" });

  return doc.output("blob");
}

// Excel
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
    ["Cantidad","Unidad","Descripción","Costo","Margen %","Precio Unit","Total Línea"]
  ];

  const isCLP = quote.currency === "CLP";
  const lines = quote.lines.map(l => {
    const cost = isCLP ? Math.round(l.cost) : l.cost;
    const unitPrice = isCLP ? Math.round(l.unitPrice) : l.unitPrice;
    const totalLine = isCLP ? Math.round((l.qty || 0) * unitPrice) : (l.qty || 0) * unitPrice;
    return [l.qty, l.unitType || "UN", l.name, cost, l.marginPct, unitPrice, totalLine];
  });

  const totals = [
    [],
    ["SUBTOTAL", isCLP ? Math.round(quote.totals.sub) : quote.totals.sub],
    ["IVA 19", isCLP ? Math.round(quote.totals.iva) : quote.totals.iva],
    ["TOTAL", isCLP ? Math.round(quote.totals.tot) : quote.totals.tot]
  ];

  const ws = XLSX.utils.aoa_to_sheet([...header, ...lines, ...totals]);
  XLSX.utils.book_append_sheet(wb, ws, "Cotizacion");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// Historial
async function refreshHistory() {
  const all = await listQuotes();
  const term = (elqSearch.value || "").toLowerCase().trim();

  const rows = all
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .filter(q => {
      if (!term) return true;
      const hay = [q.code, q.clientName, q.clientRut, q.clientCompany].join(" ").toLowerCase();
      return hay.includes(term);
    });

  elhistTbody.innerHTML = rows.map(q => `
    <tr>
      <td>${q.code}</td>
      <td>${formatDateES(q.quoteDate)}</td>
      <td>${q.clientName || ""}</td>
      <td>${q.currency}</td>
      <td class="rightAlign">${money(q.totals?.tot || 0, q.currency)}</td>
      <td>${q.state || ""}</td>
      <td>
        <button class="btn btnW" data-edit="${q.id}" type="button">Editar</button>
        <button class="btn btnD" data-del="${q.id}" type="button">Eliminar</button>
        <button class="btn btnS" data-pdf="${q.id}" type="button">PDF</button>
        <button class="btn btnS" data-xlsx="${q.id}" type="button">Excel</button>
      </td>
    </tr>
  `).join("");

  elhistTbody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", async () => {
    await loadForEdit(b.getAttribute("data-edit"));
  }));

  elhistTbody.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    const id = b.getAttribute("data-del");
    if (!confirm("¿Eliminar cotización?")) return;
    await deleteQuote(id);
    await refreshHistory();
  }));

  elhistTbody.querySelectorAll("[data-pdf]").forEach(b => b.addEventListener("click", async () => {
    const q = await getQuote(b.getAttribute("data-pdf"));
    if (!q) return;
    const pdfBlob = await makePDFBlob(q);
    downloadBlob(pdfBlob, `${q.code}.pdf`);
  }));

  elhistTbody.querySelectorAll("[data-xlsx]").forEach(b => b.addEventListener("click", async () => {
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
  elpillEditing.textContent = "Modo: Editar";

  elcurrency.value = q.currency || "CLP";
  elusdRate.value = q.usdRate ?? 950;
  elstate.value = q.state || "Pendiente";
  elquoteDate.value = q.quoteDate || todayISO();
  elvalidUntil.value = q.validUntil || plusDaysISO(5);
  elnextContact.value = q.nextContact || "";

  elclientName.value = q.clientName || "";
  elclientCompany.value = q.clientCompany || "";
  elclientRut.value = q.clientRut || "";
  elclientEmail.value = q.clientEmail || "";
  elclientPhone.value = q.clientPhone || "";
  elclientAddress.value = q.clientAddress || "";
  elclientCity.value = q.clientCity || "";
  elnotes.value = q.notes || "";

  ellinesTbody.innerHTML = "";
  (q.lines || []).forEach(l => {
    const cost = parseNum(l.cost);
    const marginPct = l.marginPct != null ? parseNum(l.marginPct) : (l.unitPrice != null ? marginPctFromCostAndPrice(cost, l.unitPrice) : 15);
    let unitPrice = unitPriceFromCostAndMargin(cost, marginPct);
    if (q.currency === "CLP") unitPrice = Math.round(unitPrice);
    addLine({ qty: l.qty ?? 0, unitType: l.unitType ?? "UN", name: l.name ?? "", cost, marginPct, unitPrice });
  });

  elpillQuoteNo.textContent = q.code;
  refreshLineTotals();
  renderTotals();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function resetForm() {
  editingId = null;
  elpillEditing.textContent = "Modo: Nueva";

  elcurrency.value = "CLP";
  elstate.value = "Pendiente";
  elquoteDate.value = todayISO();
  elvalidUntil.value = plusDaysISO(5);
  elnextContact.value = "";

  elclientName.value = "";
  elclientCompany.value = "";
  elclientRut.value = "";
  elclientEmail.value = "";
  elclientPhone.value = "";
  elclientAddress.value = "";
  elclientCity.value = "";
  elnotes.value = "";

  ellinesTbody.innerHTML = "";
  addLine({ unitType: "UN", marginPct: 15 });

  let seq = await getSetting("seq", MIN_SEQ);
  seq = Math.max(Number(seq || 0), MIN_SEQ);
  elpillQuoteNo.textContent = `COT-${String(seq).padStart(4, "0")}-XXXX`;

  refreshLineTotals();
  renderTotals();
}

async function handleSave() {
  const f = readForm();
  if (!f.clientName) return alert("Falta Cliente (nombre).");
  if (!f.lines.length) return alert("Agrega al menos 1 línea.");

  const totals = calc(f.lines);

  let seq, code, createdAt;
  if (editingId) {
    const prev = await getQuote(editingId);
    if (!prev) return alert("No se encontró la cotización a editar.");
    seq = prev.seq;
    code = prev.code;
    createdAt = prev.createdAt;
  } else {
    const nx = await nextQuoteCode(f.clientName);
    seq = nx.seq;
    code = nx.code;
    createdAt = new Date().toISOString();
  }

  const now = new Date().toISOString();
  const quote = {
    id: editingId || crypto.randomUUID(),
    seq,
    code,
    createdAt,
    updatedAt: now,
    ...f,
    totals
  };

  await putQuote(quote);

  if (!editingId) {
    await setSetting("seq", seq + 1);
  }

  elpillQuoteNo.textContent = code;

  // Descargas opcionales
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

  if (!editingId) await resetForm();
}

async function exportDB() {
  const quotes = await listQuotes();

  const json = new Blob([JSON.stringify(quotes, null, 2)], { type: "application/json" });
  downloadBlob(json, "BaseDatos-DMYC.json");

  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const rows = quotes
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(q => ({
      codigo: q.code,
      fecha: formatDateES(q.quoteDate),
      valida_hasta: formatDateES(q.validUntil),
      proximo_contacto: q.nextContact ? formatDateES(q.nextContact) : "",
      estado: q.state,
      moneda: q.currency,
      subtotal: q.totals?.sub ?? 0,
      iva19: q.totals?.iva ?? 0,
      total: q.totals?.tot ?? 0,
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

  alert("Exportación lista: JSON + Excel.");
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
    try {
      data = JSON.parse(text);
    } catch {
      return alert("JSON inválido.");
    }

    if (!Array.isArray(data)) return alert("El archivo debe contener un arreglo de cotizaciones.");
    if (!confirm("Esto reemplazará tu base de datos local. ¿Continuar?")) return;

    await replaceAllQuotes(data);

    const maxSeq = data.reduce((m, q) => Math.max(m, Number(q.seq || 0)), 0);
    await setSetting("seq", Math.max(maxSeq + 1, MIN_SEQ));

    await refreshHistory();
    await resetForm();
    alert("Importación completada.");
  };

  input.click();
}

async function init() {
  const updateStatus = () => {
    elstatusLine.textContent = navigator.onLine
      ? "Online (sin nube; guardando local)"
      : "Offline (guardando local)";
  };

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  updateStatus();

  // PWA install prompt (Chrome/Edge)
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (elbtnInstall) elbtnInstall.style.display = "inline-block";
  });

  if (elbtnInstall) {
    elbtnInstall.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      elbtnInstall.style.display = "none";
    });
  }

  // Defaults
  elpillIva.textContent = "IVA: 19%";
  elquoteDate.value = todayISO();
  elvalidUntil.value = plusDaysISO(5);

  // Listeners
  elbtnAddLine.addEventListener("click", () => addLine({ unitType: "UN", marginPct: 15 }));
  elbtnSave.addEventListener("click", handleSave);
  elbtnNew.addEventListener("click", resetForm);
  elbtnRefresh.addEventListener("click", refreshHistory);
  elqSearch.addEventListener("input", refreshHistory);

  elcurrency.addEventListener("change", () => {
    refreshLineTotals();
    renderTotals();
  });

  elbtnExportDB.addEventListener("click", exportDB);
  elbtnImportDB.addEventListener("click", importDB);

  // SW
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }

  await resetForm();
  await refreshHistory();
}

init();
