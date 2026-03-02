import { initDB } from './db.js';

const MIN_SEQ = 400;
let db;
let lines = [];

// Inicialización
initDB().then(database => {
    db = database;
    initApp();
}).catch(err => console.error("Error cargando DB:", err));

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

// Manejo de Líneas
function addLine(data = {}) {
    lines.push({
        id: Date.now() + Math.random(), desc: data.name || '', qty: data.qty || 1,
        unit: data.unitType || 'UN', cost: data.cost || 0, margin: data.marginPct || 30
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
                    unit: row.unidad || row.Unidad || 'UN', cost: cost,
                    margin: parseFloat(row.margen_pct) || parseFloat(row.Margen_pct) || 30
                });
                count++;
            }
        });
        document.getElementById('bulkUpload').value = "";
        renderLines();
        alert(`¡Cargados ${count} materiales desde el Excel!`);
    };
    reader.readAsArrayBuffer(file);
});

// Guardar y PDF
document.getElementById('btnSave').addEventListener('click', async () => {
    const qNum = document.getElementById('quoteNumber').innerText;
    const client = document.getElementById('clientName').value;
    if(!client) return alert('Debes ingresar el nombre del cliente.');

    // Calcular fecha válida (+5 días)
    const hoy = new Date();
    const formatoFecha = { day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = hoy.toLocaleDateString('es-CL', formatoFecha);
    
    const fechaValida = new Date(hoy);
    fechaValida.setDate(fechaValida.getDate() + 5);
    const validDateStr = fechaValida.toLocaleDateString('es-CL', formatoFecha);

    const quote = {
        id: qNum, 
        date: dateStr, 
        validDate: validDateStr,
        client,
        rut: document.getElementById('clientRut').value, 
        address: document.getElementById('clientAddress').value,
        phone: document.getElementById('clientPhone').value, 
        email: document.getElementById('clientEmail').value,
        status: document.getElementById('quoteStatus').value, 
        notes: document.getElementById('notes').value,
        currency: document.getElementById('currency').value, 
        rate: document.getElementById('exchangeRate').value,
        lines, 
        subtotal: parseFloat(document.getElementById('subtotalText').innerText.replace(/\D/g, '')),
        iva: parseFloat(document.getElementById('ivaText').innerText.replace(/\D/g, '')),
        total: parseFloat(document.getElementById('totalText').innerText.replace(/\D/g, '')), 
        synced: false
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
    
    // FORMATO IDÉNTICO AL PDF ADJUNTO
    
    // --- CABECERA IZQUIERDA ---
    doc.setTextColor(0, 0, 0); 
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18); 
    doc.text("DMYC spa", 14, 20);
    
    doc.setFontSize(10);
    doc.text("76.935.323-2", 14, 25);
    doc.setFont("helvetica", "normal");
    doc.text("Cerro el plomo 5931 of 1213, Las Condes", 14, 30);
    doc.text("Región Metropolitana", 14, 35);

    // --- CABECERA DERECHA ---
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("COTIZACIÓN N°", 130, 20);
    doc.setFont("helvetica", "normal");
    doc.text(q.id, 165, 20);
    
    doc.setFont("helvetica", "bold");
    doc.text("FECHA", 130, 25);
    doc.setFont("helvetica", "normal");
    doc.text(q.date, 150, 25);
    
    doc.setFont("helvetica", "bold");
    doc.text("PRESUPUESTO", 130, 30);
    doc.text("VÁLIDO HASTA", 130, 34);
    doc.setFont("helvetica", "normal");
    doc.text(q.validDate || q.date, 160, 34);

    // --- PRESUPUESTO PARA (CLIENTE) ---
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("PRESUPUESTO PARA", 14, 50);
    
    doc.setFont("helvetica", "normal");
    doc.text("Contacto", 14, 58);     doc.text(q.client, 40, 58);
    doc.text("Empresa", 14, 63);      doc.text("dmyc spa", 40, 63); // Según tu ejemplo
    doc.text("Rut", 14, 68);          doc.text(q.rut || "-", 40, 68);
    doc.text("Dirección", 14, 73);    doc.text(q.address || "-", 40, 73);
    doc.text("Ciudad", 14, 78);       doc.text("santiago", 40, 78);
    doc.text("Teléfono", 14, 83);     doc.text(q.phone || "-", 40, 83);
    doc.text("Email", 14, 88);        doc.text(q.email || "-", 40, 88);

    // --- VENDEDOR Y TÉRMINOS ---
    doc.setFont("helvetica", "bold");
    doc.text("AUTOR", 14, 100);       doc.text("VENDEDOR", 60, 100);      doc.text("TÉRMINOS", 110, 100);
    doc.setFont("helvetica", "normal");
    doc.text("FMC", 14, 105);         doc.text("FMC", 60, 105);           doc.text("Pago Transferencia", 110, 105);

    // --- LÍNEA SEPARADORA ---
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(14, 110, 196, 110);

    // --- TABLA PRODUCTOS ---
    const rate = parseFloat(q.rate) || 1;
    const tableData = q.lines.map(l => {
        let pVenta = (q.currency === 'USD' ? l.cost * rate : l.cost) * (1 + (l.margin/100));
        return [
            l.qty, 
            l.desc, 
            Math.round(pVenta).toLocaleString('es-CL'), 
            l.unit, 
            Math.round(pVenta * l.qty).toLocaleString('es-CL')
        ];
    });

    doc.autoTable({
        startY: 115,
        head: [['CANTIDAD', 'DESCRIPCIÓN', 'PRECIO POR UNIDAD', 'UNIDAD', 'TOTAL']],
        body: tableData,
        theme: 'plain', // Sin colores de fondo como en tu PDF
        headStyles: { fontStyle: 'bold', textColor: [0,0,0] },
        styles: { textColor: [0,0,0], cellPadding: 2 },
        columnStyles: {
            0: { halign: 'center' },
            2: { halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'right' }
        }
    });

    // --- TOTALES (A la derecha, sin signos de peso) ---
    let finalY = doc.lastAutoTable.finalY + 10;
    
    doc.setFont("helvetica", "bold");
    doc.text("SUBTOTAL", 140, finalY);
    doc.setFont("helvetica", "normal");
    doc.text(q.subtotal.toLocaleString('es-CL'), 196, finalY, { align: "right" });
    
    doc.setFont("helvetica", "bold");
    doc.text("MONTO IVA 19%", 140, finalY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(q.iva.toLocaleString('es-CL'), 196, finalY + 6, { align: "right" });
    
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL", 140, finalY + 12);
    doc.setFont("helvetica", "normal");
    doc.text(q.total.toLocaleString('es-CL'), 196, finalY + 12, { align: "right" });

    // --- OBSERVACIONES Y TRANSFERENCIA ---
    doc.setFont("helvetica", "bold");
    doc.text("OBS:", 14, finalY + 25);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(q.notes, 170), 25, finalY + 25);

    // Texto final centrado
    let textY = finalY + 50;
    doc.setFontSize(9);
    doc.text("Si tiene cualquier tipo de pregunta acerca de esta oferta, póngase en contacto", 105, textY, { align: "center" });
    doc.text("indicando número de cotización.", 105, textY + 4, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.text("TRANSFERENCIA", 105, textY + 12, { align: "center" });
    doc.text("DMYC Spa", 105, textY + 16, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("Banco BCI Cta. Cte. 95148019", 105, textY + 20, { align: "center" });
    doc.text("INFO@DMYC.CL", 105, textY + 24, { align: "center" });
    
    doc.setFont("helvetica", "bold");
    doc.text("GRACIAS POR SU CONFIANZA!", 105, textY + 32, { align: "center" });

    doc.save(`${q.id}.pdf`);
}

// Historial y Sync
document.getElementById('btnViewHistory').addEventListener('click', () => {
    document.getElementById('newQuoteView').classList.add('hidden');
    document.getElementById('historyView').classList.remove('hidden');
    db.transaction("quotes").objectStore("quotes").getAll().onsuccess = (e) => {
        document.getElementById('historyBody').innerHTML = e.target.result.sort((a,b) => a.id < b.id ? 1 : -1).map(q => `
            <tr class="border-b text-center">
                <td class="p-2 font-bold text-gray-700">${q.id}</td><td class="p-2">${q.date}</td>
                <td class="p-2 text-left">${q.client}</td><td class="p-2">$${q.total.toLocaleString('es-CL')}</td>
                <td class="p-2">${q.status}</td>
                <td class="p-2"><button onclick="downloadPdfHistory('${q.id}')" class="text-blue-500 hover:underline">Descargar PDF</button></td>
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
                alert("¡Sincronizado con PC exitosamente!");
            }
        } catch { alert("Error conectando al PC."); }
    };
});
