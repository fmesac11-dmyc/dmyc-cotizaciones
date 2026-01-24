import {
  getSetting, setSetting,
  putQuote, getQuote, deleteQuote, listQuotes,
  upsertCatalogItem, listOutbox, putOutbox, deleteOutbox
} from "./db.js";

import { initDrive, driveLogin, driveIsConnected, ensureFolder, uploadFile } from "./drive.js";

const IVA_RATE = 0.19;

const el = (id) => document.getElementById(id);
const money = (n, cur) => {
  const opt = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return (cur === "USD" ? "US$ " : "$ ") + (Number(n||0)).toLocaleString("es-CL", opt);
};

const normalize4 = (s) => (s||"").normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/[^a-zA-Z0-9]/g,"").toUpperCase().slice(0,4) || "XXXX";

let editingId = null;

function todayISO(){ return new Date().toISOString().slice(0,10); }
function plusDaysISO(d){ return new Date(Date.now()+d*86400000).toISOString().slice(0,10); }

async function nextQuoteCode(clientName){
  const seq = await getSetting("seq", 1);
  const code = `COT-${String(seq).padStart(4,"0")}-${normalize4(clientName)}`;
  return { seq, code };
}

function readLines(){
  const rows = [...document.querySelectorAll("[data-line]")];
  return rows.map(r => ({
    qty: Number(r.querySelector(".qty").value || 0),
    name: (r.querySelector(".name").value || "").trim(),
    cost: Number(r.querySelector(".cost").value || 0),
    margin: Number(r.querySelector(".margin").value || 0)
  })).filter(x => x.name && x.qty > 0);
}

function calc(lines){
  const cur = el("currency").value;
  const sub = lines.reduce((a,l) => a + (l.qty * (l.cost * (1 + l.margin))), 0);
  const iva = sub * IVA_RATE;
  const tot = sub + iva;
  return { cur, sub, iva, tot };
}

function renderTotals(){
  const lines = readLines();
  const { cur, sub, iva, tot } = calc(lines);
  el("subTotalCell").textContent = money(sub, cur);
  el("ivaCell").textContent = money(iva, cur);
  el("totalCell").textContent = money(tot, cur);
  el("pillCurrency").textContent = `Moneda: ${cur}`;
}

function addLine(pref = {}){
  const tr = document.createElement("tr");
  tr.setAttribute("data-line","1");
  tr.innerHTML = `
    <td><input class="qty" type="number" step="0.01" value="${pref.qty ?? ""}"></td>
    <td><input class="name" placeholder="Descripción del producto" value="${(pref.name ?? "").replaceAll('"','&quot;')}"></td>
    <td><input class="cost" type="number" step="0.01" value="${pref.cost ?? ""}"></td>
    <td><input class="margin" type="number" step="0.01" value="${pref.margin ?? 0.15}"></td>
    <td class="priceCell rightAlign"></td>
    <td><button class="btn btnD">X</button></td>
  `;
  tr.querySelector(".btnD").addEventListener("click", () => { tr.remove(); refreshLinePrices(); renderTotals(); });
  ["qty","name","cost","margin"].forEach(cls => tr.querySelector("."+cls).addEventListener("input", () => { refreshLinePrices(); renderTotals(); }));
  el("linesTbody").appendChild(tr);
  refreshLinePrices();
  renderTotals();
}

function refreshLinePrices(){
  const cur = el("currency").value;
  [...document.querySelectorAll("[data-line]")].forEach(r => {
    const qty = Number(r.querySelector(".qty").value || 0);
    const cost = Number(r.querySelector(".cost").value || 0);
    const margin = Number(r.querySelector(".margin").value || 0);
    const price = cost * (1 + margin);
    const total = qty * price;
    r.querySelector(".priceCell").textContent = money(total, cur);
  });
}

function readForm(){
  return {
    currency: el("currency").value,
    usdRate: Number(el("usdRate").value || 0),
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
    lines: readLines(),
  };
}

async function makePDFBlob(quote){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p","mm","a4");

  const cur = quote.currency;
  const sub = quote.totals.sub;
  const iva = quote.totals.iva;
  const tot = quote.totals.tot;

  // Encabezado estilo “cotización” (estructura igual a tu Excel) [file:24]
  doc.setFillColor(11, 74, 162);
  doc.rect(0, 0, 210, 22, "F");
  doc.setTextColor(255,255,255);
  doc.setFontSize(16);
  doc.text("COTIZACIÓN", 14, 14);

  doc.setFontSize(10);
  doc.text("DMYC spa 76.935.323-2", 140, 10);
  doc.text("Cerro el plomo 5931 of 1213, Las Condes", 110, 16);

  doc.setTextColor(0,0,0);
  doc.setFontSize(11);
  doc.text(`N°: ${quote.code}`, 14, 34);
  doc.text(`Fecha: ${quote.quoteDate}`, 14, 40);
  doc.text(`Válida hasta: ${quote.validUntil}`, 14, 46);

  doc.text(`Cliente: ${quote.clientName}`, 14, 58);
  doc.text(`Empresa: ${quote.clientCompany}`, 14, 64);
  doc.text(`RUT: ${quote.clientRut}`, 14, 70);
  doc.text(`Email: ${quote.clientEmail}`, 14, 76);
  doc.text(`Teléfono: ${quote.clientPhone}`, 14, 82);
  doc.text(`Dirección: ${quote.clientAddress}`, 14, 88);
  doc.text(`Ciudad: ${quote.clientCity}`, 14, 94);

  doc.text(`Moneda: ${cur}`, 150, 34);
  doc.text(`Estado: ${quote.state}`, 150, 40);

  // Tabla
  const body = quote.lines.map(l => ([
    String(l.qty),
    l.name,
    money(l.cost, cur),
    String(l.margin),
    money(l.cost*(1+l.margin), cur),
    money(l.qty*l.cost*(1+l.margin), cur),
  ]));

  doc.autoTable({
    startY: 104,
    head: [["Cant.", "Descripción", "Costo", "%", "P. Unit", "Total"]],
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [11,74,162], textColor: 255 },
    columnStyles: { 0:{cellWidth:16}, 2:{cellWidth:22}, 3:{cellWidth:14}, 4:{cellWidth:22}, 5:{cellWidth:24} }
  });

  const y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.text(`SUBTOTAL: ${money(sub, cur)}`, 130, y);
  doc.text(`IVA 19%: ${money(iva, cur)}`, 130, y+7);
  doc.setFontSize(13);
  doc.text(`TOTAL: ${money(tot, cur)}`, 130, y+16);

  doc.setFontSize(10);
  doc.text("OBS:", 14, y+28);
  doc.text(quote.notes || "-", 24, y+28, { maxWidth: 170 });

  doc.setFontSize(10);
  doc.text("TRANSFERENCIA:", 14, 270);
  doc.text("DMYC Spa · Banco BCI · Cta. Cte. 95148019 · INFO@DMYC.CL", 14, 276);
  doc.setFontSize(12);
  doc.text("GRACIAS POR SU CONFIANZA.", 105, 286, { align:"center" });

  const blob = doc.output("blob");
  return blob;
}

async function makeXLSXBlob(quote){
  // SheetJS: export a workbook to xlsx in browser. [web:139]
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const header = [
    ["COTIZACIÓN", quote.code],
    ["Fecha", quote.quoteDate],
    ["Válida hasta", quote.validUntil],
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
    ["Cantidad","Descripción","Costo","Margen","Precio Unit","Total"],
  ];

  const lines = quote.lines.map(l => ([
    l.qty,
    l.name,
    l.cost,
    l.margin,
    l.cost*(1+l.margin),
    l.qty*l.cost*(1+l.margin)
  ]));

  const totals = [
    [],
    ["SUBTOTAL", quote.totals.sub],
    ["IVA 19%", quote.totals.iva],
    ["TOTAL", quote.totals.tot],
  ];

  const ws = XLSX.utils.aoa_to_sheet([...header, ...lines, ...totals]);
  XLSX.utils.book_append_sheet(wb, ws, "Cotizacion");
  const out = XLSX.write(wb, { bookType:"xlsx", type:"array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refreshHistory(){
  const all = await listQuotes();
  const term = (el("qSearch").value || "").toLowerCase().trim();
  const rows = all
    .sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""))
    .filter(q => {
      if (!term) return true;
      return [q.code,q.clientName,q.clientRut,q.clientCompany].join(" ").toLowerCase().includes(term);
    });

  el("histTbody").innerHTML = rows.map(q => `
    <tr>
      <td>${q.code}</td>
      <td>${q.quoteDate}</td>
      <td>${q.clientName}</td>
      <td>${q.currency}</td>
      <td class="rightAlign">${money(q.totals.tot, q.currency)}</td>
      <td>${q.state}</td>
      <td>
        <button class="btn btnW" data-edit="${q.id}">Editar</button>
        <button class="btn btnD" data-del="${q.id}">Eliminar</button>
      </td>
    </tr>
  `).join("");

  el("histTbody").querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", async() => {
    await loadForEdit(b.getAttribute("data-edit"));
  }));
  el("histTbody").querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async() => {
    const id = b.getAttribute("data-del");
    if (!confirm("¿Eliminar cotización?")) return;
    await deleteQuote(id);
    await refreshHistory();
    await refreshPending();
  }));
}

async function refreshPending(){
  const out = await listOutbox();
  el("pillPending").textContent = `Pendientes sync: ${out.length}`;
}

async function loadForEdit(id){
  const q = await getQuote(id);
  if (!q) return alert("No encontrada");
  editingId = q.id;

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
  q.lines.forEach(l => addLine(l));

  el("pillQuoteNo").textContent = q.code;
  refreshLinePrices();
  renderTotals();
  window.scrollTo({ top: 0, behavior:"smooth" });
}

function resetForm(){
  editingId = null;
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
  addLine();
}

async function handleSave(){
  const f = readForm();
  if (!f.clientName) return alert("Falta Cliente (nombre).");
  if (!f.lines.length) return alert("Agrega al menos 1 línea.");

  const totals = calc(f.lines);

  // número
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
    createdAt: now,
    updatedAt: now,
    ...f,
    totals
  };

  await putQuote(quote);

  // Actualiza secuencia solo si es nueva
  if (!editingId) await setSetting("seq", seq + 1);

  // Catálogo (último costo/margen)
  for (const l of f.lines) {
    await upsertCatalogItem(l.name, { lastCost: l.cost, lastMargin: l.margin, updatedAt: now });
  }

  // Generación local + cola de sync (Drive)
  const wantPDF = f.optMakePDF;
  const wantXLSX = f.optMakeExcel;

  let pdfBlob = null;
  let xlsxBlob = null;

  if (wantPDF) {
    pdfBlob = await makePDFBlob(quote);
    downloadBlob(pdfBlob, `${code}.pdf`);
  }
  if (wantXLSX) {
    xlsxBlob = await makeXLSXBlob(quote);
    downloadBlob(xlsxBlob, `${code}.xlsx`);
  }

  // JSON siempre
  const jsonBlob = new Blob([JSON.stringify(quote, null, 2)], { type:"application/json" });
  downloadBlob(jsonBlob, `${code}.json`);

  // Encolar para Drive (subir PDF/XLSX/JSON + actualizar maestros)
  await putOutbox({
    id: crypto.randomUUID(),
    createdAt: now,
    quoteId: quote.id,
    code,
    files: {
      pdf: wantPDF,
      xlsx: wantXLSX
    }
  });

  // Actualiza pill
  el("pillQuoteNo").textContent = code;

  // Si era nueva, deja formulario listo para la próxima
  if (!editingId) resetForm();

  await refreshHistory();
  await refreshPending();

  alert(editingId ? "Cambios guardados." : "Cotización guardada.");
}

async function buildMasterFiles(quotes){
  // BaseDatos.json + BaseDatos.xlsx
  const json = new Blob([JSON.stringify(quotes, null, 2)], { type:"application/json" });

  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const rows = quotes.map(q => ({
    codigo: q.code,
    fecha: q.quoteDate,
    valida_hasta: q.validUntil,
    cliente: q.clientName,
    empresa: q.clientCompany,
    rut: q.clientRut,
    email: q.clientEmail,
    telefono: q.clientPhone,
    direccion: q.clientAddress,
    ciudad: q.clientCity,
    moneda: q.currency,
    subtotal: q.totals.sub,
    iva: q.totals.iva,
    total: q.totals.tot,
    estado: q.state,
    proximo_contacto: q.nextContact,
    observaciones: q.notes
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Cotizaciones");
  const out = XLSX.write(wb, { bookType:"xlsx", type:"array" });
  const xlsx = new Blob([out], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  return { json, xlsx };
}

async function syncDrive(){
  if (!driveIsConnected()) return alert("Primero conecta Google Drive.");

  const folderName = await getSetting("driveFolderName", "DMYC_Cotizaciones");
  const folderId = await ensureFolder(folderName);

  const out = await listOutbox();
  if (!out.length) return alert("No hay pendientes.");

  // Sube cada cotización: PDF/XLSX/JSON
  for (const job of out.sort((a,b)=> (a.createdAt||"").localeCompare(b.createdAt||""))) {
    const q = await getQuote(job.quoteId);
    if (!q) { await deleteOutbox(job.id); continue; }

    // JSON
    const jsonBlob = new Blob([JSON.stringify(q, null, 2)], { type:"application/json" });
    await uploadFile({ folderId, filename: `${job.code}.json`, mimeType: "application/json", blob: jsonBlob });

    // PDF opcional
    if (job.files.pdf) {
      const pdfBlob = await makePDFBlob(q);
      await uploadFile({ folderId, filename: `${job.code}.pdf`, mimeType: "application/pdf", blob: pdfBlob });
    }

    // XLSX opcional
    if (job.files.xlsx) {
      const xlsxBlob = await makeXLSXBlob(q);
      await uploadFile({ folderId, filename: `${job.code}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", blob: xlsxBlob });
    }

    await deleteOutbox(job.id);
  }

  // Actualiza maestros en la misma carpeta
  const quotes = await listQuotes();
  const masters = await buildMasterFiles(quotes);

  await uploadFile({ folderId, filename: `BaseDatos-DMYC.json`, mimeType: "application/json", blob: masters.json });
  await uploadFile({ folderId, filename: `BaseDatos-DMYC.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", blob: masters.xlsx });

  await refreshPending();
  alert("Sincronización completada.");
}

async function init(){
  // fechas por defecto
  el("quoteDate").value = todayISO();
  el("validUntil").value = plusDaysISO(5);

  // secuencia inicial
  const seq = await getSetting("seq", 1);
  const code = `COT-${String(seq).padStart(4,"0")}-XXXX`;
  el("pillQuoteNo").textContent = code;

  // listeners
  el("btnAddLine").addEventListener("click", () => addLine());
  el("btnSave").addEventListener("click", handleSave);
  el("btnNew").addEventListener("click", resetForm);
  el("btnRefresh").addEventListener("click", refreshHistory);
  el("qSearch").addEventListener("input", refreshHistory);
  el("currency").addEventListener("change", () => { renderTotals(); });

  // Drive init (deja placeholder)
  initDrive({ clientId: "PEGA_AQUI_TU_CLIENT_ID.apps.googleusercontent.com" });

  el("btnDriveLogin").addEventListener("click", () => driveLogin());
  el("btnSync").addEventListener("click", () => syncDrive());

  // UI online/offline
  const updateStatus = () => {
    el("statusLine").textContent = navigator.onLine ? "Online · listo para sincronizar" : "Offline · guardando local";
  };
  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  updateStatus();

  // install prompt
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    el("btnInstall").style.display = "";
  });
  el("btnInstall").addEventListener("click", async() => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt = null;
    el("btnInstall").style.display = "none";
  });

  // SW
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");

  // first line
  resetForm();

  await refreshHistory();
  await refreshPending();
}

init();
