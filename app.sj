const MIN_SEQ = 400;
let db;
let lines = [];

const request = indexedDB.open("DMYC_QuotesDB", 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("quotes")) db.createObjectStore("quotes", { keyPath: "id" });
    if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
};
request.onsuccess = (e) => {
    db = e.target.result;
    initApp();
};

async function initApp() {
    await updateNextQuoteCode();
    const rate = await loadSetting('exchangeRate', 950);
    document.getElementById('exchangeRate').value = rate;
    addLine();
}

function saveSetting(key, value) {
    db.transaction("settings", "readwrite").objectStore("settings").put({ key, value });
}
function loadSetting(key, defaultVal) {
    return new Promise(resolve => {
        const req = db.transaction("settings", "readonly").objectStore("settings").get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : defaultVal);
    });
}
async function updateNextQuoteCode() {
    let seq = await loadSetting("seq", MIN_SEQ);
    seq = Math.max(seq, MIN_SEQ);
    const client = (document.getElementById('clientName').value || 'CLIE').substring(0,4).toUpperCase();
    document.getElementById('quoteNumber').innerText = `COT-${String(seq).padStart(4, '0')}-${client}`;
}
document.getElementById('clientName').addEventListener('input', updateNextQuoteCode);

function addLine(data = {}) {
    lines.push({
        id: Date.now() + Math.random(), desc: data.name || '', qty: data.qty || 1,
        unit: data.unitType || 'und', cost: data.cost || 0, margin: data.marginPct || 30
    });
    renderLines();
}

window.updateLine = function(id, field, value) {
    const line = lines.find(l => l.id === id);
    if(line) { line[field] = parseFloat(value) || value; renderLines(); }
}

window.removeLine = function(id) {
    lines = lines.filter(l => l.id !== id);
    renderLines();
}

function renderLines() {
    const tbody = document.getElementById('linesBody');
    tbody.innerHTML = '';
    const currency = document.getElementById('currency').value;
    const rate = parseFloat(document.getElementById('exchangeRate').value) || 1;
    let subtotal = 0;

    lines.forEach(l => {
        let costCLP = currency === 'USD' ? (l.cost * rate) : l.cost;
        let pVenta = costCLP * (1 + (l.margin / 100));
        let totalLinea = pVenta * l.qty;
        subtotal += totalLinea;

        tbody.innerHTML += `
            <tr class="border-b bg-white">
                <td class="p-1"><input type="text" value="${l.desc}" onchange="updateLine(${l.id}, 'desc', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${l.qty}" onchange="updateLine(${l.id}, 'qty', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="text" value="${l.unit}" onchange="updateLine(${l.id}, 'unit', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${l.cost}" onchange="updateLine(${l.id}, 'cost', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${l.margin}" onchange="updateLine(${l.id}, 'margin', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1 text-right font-bold font-mono">$${Math.round(pVenta).toLocaleString('es-CL')}</td>
                <td class="p-1 text-right font-bold text-orange-600 font-mono">$${Math.round(totalLinea).toLocaleString('es-CL')}</td>
                <td class="p-1 text-center"><button onclick="removeLine(${l.id})" class="text-red-500 font-bold">X</button></td>
            </tr>
        `;
    });

    const iva = subtotal * 0.19;
    document.getElementById('subtotalText').innerText = `$${Math.round(subtotal).toLocaleString('es-CL')}`;
    document.getElementById('ivaText').innerText = `$${Math.round(iva).toLocaleString('es-CL')}`;
    document.getElementById('totalText').innerText = `$${Math.round(subtotal + iva).toLocaleString('es-CL')}`;
}

document.getElementById('btnAddLine').addEventListener('click', () => addLine());
document.getElementById('currency').addEventListener('change', renderLines);
document.getElementById('exchangeRate').addEventListener('input', (e) => { saveSetting('exchangeRate', e.target.value); renderLines(); });

// Carga Masiva Excel
document.getElementById('btnBulkUpload').addEventListener('click', () => document.getElementById('bulkUpload').click());
document.getElementById('bulkUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const excelData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
        
        let count = 0;
        excelData.forEach(row => {
            const desc = row.descripcion || row.Descripcion || '';
            const qty = parseFloat(row.cantidad) || parseFloat(row.Cantidad) || 0;
            const cost = parseFloat(row.costo) || parseFloat(row.Costo) || 0;
            if (desc && qty > 0 && cost > 0) {
                lines.push({
                    id: Date.now() + Math.random(), desc: desc, qty: qty,
                    unit: row.unidad || row.Unidad || 'und', cost: cost,
                    margin: parseFloat(row.margen_pct) || parseFloat(row.Margen_pct) || 30
                });
                count++;
            }
        });
        document.getElementById('bulkUpload').value = "";
        renderLines();
        alert(`¡Cargados ${count} materiales!`);
    };
    reader.readAsArrayBuffer(file);
});

// Guardar y PDF
document.getElementById('btnSave').addEventListener('click', async () => {
    const qNum = document.getElementById('quoteNumber').innerText;
    const client = document.getElementById('clientName').value;
    if(!client) return alert('Ingresa el cliente.');

    const quote = {
        id: qNum, date: new Date().toLocaleDateString('es-CL'), client,
        rut: document.getElementById('clientRut').value, address: document.getElementById('clientAddress').value,
        phone: document.getElementById('clientPhone').value, email: document.getElementById('clientEmail').value,
        status: document.getElementById('quoteStatus').value, notes: document.getElementById('notes').value,
        currency: document.getElementById('currency').value, rate: document.getElementById('exchangeRate').value,
        lines, subtotal: parseFloat(document.getElementById('subtotalText').innerText.replace(/\D/g, '')),
        iva: parseFloat(document.getElementById('ivaText').innerText.replace(/\D/g, '')),
        total: parseFloat(document.getElementById('totalText').innerText.replace(/\D/g, '')), synced: false
    };

    db.transaction("quotes", "readwrite").objectStore("quotes").put(quote);
    let seq = await loadSetting("seq", MIN_SEQ);
    await saveSetting("seq", Math.max(seq, MIN_SEQ) + 1);
    await updateNextQuoteCode();
    generatePDF(quote);
});

function generatePDF(q) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setTextColor(255, 102, 0); doc.setFontSize(22); doc.text("DMYC", 14, 20);
    doc.setTextColor(50, 50, 50); doc.setFontSize(10);
    doc.text("Distribución de Materiales y Construcción", 14, 26);
    doc.text("RUT: 76.935.323-2 | Vendedor: Felipe Mesa", 14, 31);
    
    doc.setFontSize(12); doc.text(`Cotización N°: ${q.id}`, 140, 20);
    doc.setFontSize(10); doc.text(`Fecha: ${q.date}`, 140, 26);
    doc.text(`Moneda: ${q.currency} (Cambio: $${q.rate})`, 140, 31);

    doc.setFillColor(245, 245, 245); doc.rect(14, 40, 182, 25, 'F');
    doc.text(`Cliente: ${q.client}`, 18, 47); doc.text(`RUT: ${q.rut}`, 120, 47);
    doc.text(`Dirección: ${q.address}`, 18, 55); doc.text(`Teléfono: ${q.phone}`, 120, 55);

    const rate = parseFloat(q.rate) || 1;
    const tableData = q.lines.map(l => {
        let pVenta = (q.currency === 'USD' ? l.cost * rate : l.cost) * (1 + (l.margin/100));
        return [l.desc, l.qty, l.unit, `$${Math.round(pVenta).toLocaleString('es-CL')}`, `$${Math.round(pVenta * l.qty).toLocaleString('es-CL')}`];
    });

    doc.autoTable({
        startY: 75,
        head: [['Descripción', 'Cant.', 'Unid.', 'Precio Unit. (CLP)', 'Total (CLP)']],
        body: tableData, headStyles: { fillColor: [50, 50, 50] }
    });

    let finalY = doc.lastAutoTable.finalY + 10;
    doc.text(`Subtotal Neto: $${q.subtotal.toLocaleString('es-CL')}`, 140, finalY);
    doc.text(`IVA (19%): $${q.iva.toLocaleString('es-CL')}`, 140, finalY + 7);
    doc.setFontSize(14); doc.setTextColor(255, 102, 0);
    doc.text(`TOTAL FINAL: $${q.total.toLocaleString('es-CL')}`, 140, finalY + 15);
    
    doc.setTextColor(50, 50, 50); doc.setFontSize(10);
    doc.text("Observaciones:", 14, finalY);
    doc.text(doc.splitTextToSize(q.notes, 100), 14, finalY + 6);
    doc.save(`${q.id}.pdf`);
}

// Historial y Sync
document.getElementById('btnViewHistory').addEventListener('click', () => {
    document.getElementById('newQuoteView').classList.add('hidden');
    document.getElementById('historyView').classList.remove('hidden');
    db.transaction("quotes").objectStore("quotes").getAll().onsuccess = (e) => {
        document.getElementById('historyBody').innerHTML = e.target.result.sort((a,b) => a.id < b.id ? 1 : -1).map(q => `
            <tr class="border-b text-center">
                <td class="p-2 font-bold text-orange-600">${q.id}</td><td class="p-2">${q.date}</td>
                <td class="p-2 text-left">${q.client}</td><td class="p-2">$${q.total.toLocaleString('es-CL')}</td>
                <td class="p-2">${q.status}</td>
                <td class="p-2"><button onclick="downloadPdfHistory('${q.id}')" class="text-blue-500">PDF</button></td>
            </tr>`).join('');
    };
});
document.getElementById('btnBackToNew').addEventListener('click', () => {
    document.getElementById('historyView').classList.add('hidden');
    document.getElementById('newQuoteView').classList.remove('hidden');
});
window.downloadPdfHistory = function(id) {
    db.transaction("quotes").objectStore("quotes").get(id).onsuccess = (e) => {
        if(e.target.result) generatePDF(e.target.result);
    };
};
document.getElementById('btnSync').addEventListener('click', () => {
    db.transaction("quotes").objectStore("quotes").getAll().onsuccess = async (e) => {
        const unSynced = e.target.result.filter(q => !q.synced);
        if(unSynced.length === 0) return alert("Todo sincronizado.");
        try {
            const res = await fetch('http://localhost:8787/api/push', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(unSynced)
            });
            if(res.ok) {
                const txWrite = db.transaction("quotes", "readwrite");
                unSynced.forEach(q => { q.synced = true; txWrite.objectStore("quotes").put(q); });
                alert("Sincronizado con PC.");
            }
        } catch { alert("Error conectando al PC."); }
    };
});
