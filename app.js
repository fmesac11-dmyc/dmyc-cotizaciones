// ==========================================
// CONFIGURACIÓN INICIAL Y BASE DE DATOS
// ==========================================
const MIN_SEQ = 400; // Numeración parte en 400
let db;
let lines = [];
let currentQuoteId = null;

// Inicializar IndexedDB para guardar offline
const request = indexedDB.open("DMYC_QuotesDB", 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("quotes")) {
        db.createObjectStore("quotes", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
    }
};
request.onsuccess = (e) => {
    db = e.target.result;
    initApp();
};

async function initApp() {
    await updateNextQuoteCode();
    loadSetting('exchangeRate', 950).then(val => document.getElementById('exchangeRate').value = val);
    addLine(); // Agregar una línea vacía al inicio
}

// ==========================================
// UTILIDADES DB Y SECUENCIA
// ==========================================
function saveSetting(key, value) {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ key, value });
}
function loadSetting(key, defaultVal) {
    return new Promise(resolve => {
        const tx = db.transaction("settings", "readonly");
        const req = tx.objectStore("settings").get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : defaultVal);
    });
}
async function updateNextQuoteCode() {
    let seq = await loadSetting("seq", MIN_SEQ);
    seq = Math.max(seq, MIN_SEQ); // Asegurar que sea al menos 400
    
    const client = (document.getElementById('clientName').value || 'CLIE').substring(0,4).toUpperCase();
    document.getElementById('quoteNumber').innerText = `COT-${String(seq).padStart(4, '0')}-${client}`;
}
document.getElementById('clientName').addEventListener('input', updateNextQuoteCode);

// ==========================================
// LÓGICA DE LÍNEAS Y CÁLCULOS
// ==========================================
function addLine(data = {}) {
    lines.push({
        id: Date.now() + Math.random(),
        desc: data.name || '',
        qty: data.qty || 1,
        unit: data.unitType || 'und',
        cost: data.cost || 0,
        margin: data.marginPct || 30
    });
    renderLines();
}

function updateLine(id, field, value) {
    const line = lines.find(l => l.id === id);
    if(line) {
        line[field] = parseFloat(value) || value;
        renderLines();
    }
}

function removeLine(id) {
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
        // Cálculo de precio de venta en CLP
        let costoFinalCLP = currency === 'USD' ? (l.cost * rate) : l.cost;
        let precioVentaCLP = costoFinalCLP * (1 + (l.margin / 100));
        let totalLineaCLP = precioVentaCLP * l.qty;
        subtotal += totalLineaCLP;

        tbody.innerHTML += `
            <tr class="border-b bg-white">
                <td class="p-1"><input type="text" value="${l.desc}" onchange="updateLine(${l.id}, 'desc', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${l.qty}" onchange="updateLine(${l.id}, 'qty', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="text" value="${l.unit}" onchange="updateLine(${l.id}, 'unit', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${l.cost}" onchange="updateLine(${l.id}, 'cost', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${l.margin}" onchange="updateLine(${l.id}, 'margin', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1 text-right font-bold font-mono">$${Math.round(precioVentaCLP).toLocaleString('es-CL')}</td>
                <td class="p-1 text-right font-bold text-orange-600 font-mono">$${Math.round(totalLineaCLP).toLocaleString('es-CL')}</td>
                <td class="p-1 text-center"><button onclick="removeLine(${l.id})" class="text-red-500 font-bold">X</button></td>
            </tr>
        `;
    });

    // Actualizar Totales
    const iva = subtotal * 0.19;
    const total = subtotal + iva;

    document.getElementById('subtotalText').innerText = `$${Math.round(subtotal).toLocaleString('es-CL')}`;
    document.getElementById('ivaText').innerText = `$${Math.round(iva).toLocaleString('es-CL')}`;
    document.getElementById('totalText').innerText = `$${Math.round(total).toLocaleString('es-CL')}`;
}

document.getElementById('btnAddLine').addEventListener('click', () => addLine());
document.getElementById('currency').addEventListener('change', renderLines);
document.getElementById('exchangeRate').addEventListener('input', (e) => {
    saveSetting('exchangeRate', e.target.value);
    renderLines();
});

// ==========================================
// CARGA MASIVA EXCEL (EL NUEVO BOTÓN)
// ==========================================
document.getElementById('btnBulkUpload').addEventListener('click', () => document.getElementById('bulkUpload').click());

document.getElementById('bulkUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }); // defval evita celdas vacias nulas

        let cargados = 0;
        excelData.forEach(row => {
            // Usa las columnas exactas del archivo que te envié
            const descripcion = row.descripcion || row.Descripcion || '';
            const cantidad = parseFloat(row.cantidad) || parseFloat(row.Cantidad) || 0;
            const unidad = row.unidad || row.Unidad || 'und';
            const costo = parseFloat(row.costo) || parseFloat(row.Costo) || 0;
            const margen = parseFloat(row.margen_pct) || parseFloat(row.Margen_pct) || 30;

            if (descripcion && cantidad > 0 && costo > 0) {
                lines.push({
                    id: Date.now() + Math.random(),
                    desc: descripcion,
                    qty: cantidad,
                    unit: unidad,
                    cost: costo,
                    margin: margen
                });
                cargados++;
            }
        });

        document.getElementById('bulkUpload').value = ""; // Reset
        renderLines();
        alert(`¡Éxito! Se cargaron ${cargados} materiales desde el Excel.`);
    };
    reader.readAsArrayBuffer(file);
});

// ==========================================
// GUARDAR Y GENERAR PDF
// ==========================================
document.getElementById('btnSave').addEventListener('click', async () => {
    const qNum = document.getElementById('quoteNumber').innerText;
    const client = document.getElementById('clientName').value;
    if(!client) return alert('Debes ingresar al menos el nombre del cliente.');
    if(lines.length === 0 || !lines[0].desc) return alert('Debes agregar al menos un material.');

    // Datos cotización
    const quote = {
        id: qNum,
        date: new Date().toLocaleDateString('es-CL'),
        client,
        rut: document.getElementById('clientRut').value,
        address: document.getElementById('clientAddress').value,
        phone: document.getElementById('clientPhone').value,
        email: document.getElementById('clientEmail').value,
        status: document.getElementById('quoteStatus').value,
        notes: document.getElementById('notes').value,
        currency: document.getElementById('currency').value,
        rate: document.getElementById('exchangeRate').value,
        lines: lines,
        subtotal: parseFloat(document.getElementById('subtotalText').innerText.replace(/\D/g, '')),
        iva: parseFloat(document.getElementById('ivaText').innerText.replace(/\D/g, '')),
        total: parseFloat(document.getElementById('totalText').innerText.replace(/\D/g, '')),
        synced: false
    };

    // Guardar en DB local
    const tx = db.transaction("quotes", "readwrite");
    tx.objectStore("quotes").put(quote);

    // Subir correlativo
    let seq = await loadSetting("seq", MIN_SEQ);
    await saveSetting("seq", Math.max(seq, MIN_SEQ) + 1);
    await updateNextQuoteCode();

    // Generar PDF
    generatePDF(quote);
    
    alert('Cotización guardada exitosamente.');
});

function generatePDF(q) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setTextColor(255, 102, 0); // Naranja DMYC
    doc.setFontSize(22);
    doc.text("DMYC", 14, 20);
    
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text("Distribución de Materiales y Construcción", 14, 26);
    doc.text("RUT: 76.935.323-2", 14, 31);
    doc.text("Vendedor: Felipe Mesa", 14, 36);

    // Quote Info (Derecha)
    doc.setFontSize(12);
    doc.text(`Cotización N°: ${q.id}`, 140, 20);
    doc.setFontSize(10);
    doc.text(`Fecha: ${q.date}`, 140, 26);
    doc.text(`Moneda Costos: ${q.currency} (Cambio: $${q.rate})`, 140, 31);

    // Cliente box
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(14, 45, 182, 30, 'FD');
    doc.text(`Cliente: ${q.client}`, 18, 52);
    doc.text(`RUT: ${q.rut}`, 120, 52);
    doc.text(`Dirección: ${q.address}`, 18, 60);
    doc.text(`Teléfono: ${q.phone}`, 120, 60);
    doc.text(`Email: ${q.email}`, 18, 68);

    // Tabla Productos
    const rate = parseFloat(q.rate) || 1;
    const tableData = q.lines.map(l => {
        let costCLP = q.currency === 'USD' ? (l.cost * rate) : l.cost;
        let pVenta = costCLP * (1 + (l.margin / 100));
        return [
            l.desc,
            l.qty,
            l.unit,
            `$${Math.round(pVenta).toLocaleString('es-CL')}`,
            `$${Math.round(pVenta * l.qty).toLocaleString('es-CL')}`
        ];
    });

    doc.autoTable({
        startY: 85,
        head: [['Descripción', 'Cant.', 'Unid.', 'Precio Unit. (CLP)', 'Total (CLP)']],
        body: tableData,
        headStyles: { fillColor: [50, 50, 50] },
        theme: 'striped'
    });

    // Totales
    let finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.text(`Subtotal Neto: $${q.subtotal.toLocaleString('es-CL')}`, 140, finalY);
    doc.text(`IVA (19%): $${q.iva.toLocaleString('es-CL')}`, 140, finalY + 7);
    doc.setFontSize(14);
    doc.setTextColor(255, 102, 0);
    doc.text(`TOTAL FINAL: $${q.total.toLocaleString('es-CL')}`, 140, finalY + 15);

    // Observaciones
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text("Condiciones / Observaciones:", 14, finalY);
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(q.notes, 100), 14, finalY + 6);

    // Descargar
    doc.save(`${q.id}.pdf`);
}

// ==========================================
// HISTORIAL Y SINCRONIZACIÓN
// ==========================================
document.getElementById('btnViewHistory').addEventListener('click', () => {
    document.getElementById('newQuoteView').classList.add('hidden');
    document.getElementById('historyView').classList.remove('hidden');
    loadHistory();
});

document.getElementById('btnBackToNew').addEventListener('click', () => {
    document.getElementById('historyView').classList.add('hidden');
    document.getElementById('newQuoteView').classList.remove('hidden');
});

function loadHistory() {
    const tx = db.transaction("quotes", "readonly");
    const req = tx.objectStore("quotes").getAll();
    req.onsuccess = () => {
        const tbody = document.getElementById('historyBody');
        tbody.innerHTML = '';
        const quotes = req.result.sort((a,b) => (a.id < b.id ? 1 : -1));
        
        quotes.forEach(q => {
            tbody.innerHTML += `
                <tr class="border-b text-center">
                    <td class="p-2 font-bold text-orange-600">${q.id}</td>
                    <td class="p-2">${q.date}</td>
                    <td class="p-2 text-left">${q.client}</td>
                    <td class="p-2 font-mono">$${q.total.toLocaleString('es-CL')}</td>
                    <td class="p-2">${q.status}</td>
                    <td class="p-2">
                        <button onclick="downloadPdfHistory('${q.id}')" class="text-blue-500 hover:underline">PDF</button>
                    </td>
                </tr>
            `;
        });
    };
}

// Volver a generar PDF desde historial
window.downloadPdfHistory = function(id) {
    const tx = db.transaction("quotes", "readonly");
    const req = tx.objectStore("quotes").get(id);
    req.onsuccess = () => {
        if(req.result) generatePDF(req.result);
    };
};

// Enviar al Notebook Local (Sincronizar)
document.getElementById('btnSync').addEventListener('click', () => {
    const tx = db.transaction("quotes", "readonly");
    const req = tx.objectStore("quotes").getAll();
    req.onsuccess = async () => {
        const unSynced = req.result.filter(q => !q.synced);
        if(unSynced.length === 0) return alert("Todo está sincronizado.");
        
        try {
            // Cambia localhost por la IP de tu Notebook si usas el iPad
            const res = await fetch('http://localhost:8787/api/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(unSynced)
            });
            if(res.ok) {
                alert(`¡Se sincronizaron ${unSynced.length} cotizaciones con tu PC!`);
                // Marcar como synced localmente
                const txWrite = db.transaction("quotes", "readwrite");
                unSynced.forEach(q => {
                    q.synced = true;
                    txWrite.objectStore("quotes").put(q);
                });
            }
        } catch (err) {
            alert("No se pudo conectar al servidor. Asegúrate de que el notebook esté encendido, el script server.js corriendo y conectados a la misma red.");
        }
    };
});
