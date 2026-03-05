import { initDB } from './db.js';

const MIN_SEQ = 400;
let db;
let lines = [];
let editingQuoteId = null;

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

// Genera COT-XXXX-CLIE
async function updateNextQuoteCode() {
    if (editingQuoteId) return;
    let seq = await loadSetting("seq", MIN_SEQ);
    seq = Math.max(seq, MIN_SEQ);
    const client = (document.getElementById('clientName').value || 'CLIE')
        .substring(0,4)
        .toUpperCase();
    document.getElementById('quoteNumber').innerText =
        `COT-${String(seq).padStart(4, '0')}-${client}`;
}
document.getElementById('clientName').addEventListener('input', updateNextQuoteCode);

function addLine(data = {}) {
    lines.push({
        id: Date.now() + Math.random(),
        desc: data.desc || data.name || '',
        qty: data.qty || 1,
        unit: data.unit || data.unitType || 'UN',
        cost: data.cost || 0,
        margin: data.margin || data.marginPct || 30
    });
    renderLines();
}

window.updateLine = function(id, field, value) {
    const line = lines.find(l => l.id === id);
    if(line) {
        line[field] = parseFloat(value) || value;
        renderLines();
    }
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
        let divisor = 1 - (l.margin / 100);
        if (divisor <= 0) divisor = 0.01;
        let pVenta = costCLP / divisor;
        let totalLinea = pVenta * l.qty;
        subtotal += totalLinea;

        tbody.innerHTML += `
            <tr class="border-b bg-white">
                <td class="p-1"><input type="text" value="${l.desc}" onchange="updateLine(${l.id}, 'desc', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${l.qty}" onchange="updateLine(${l.id}, 'qty', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="text" value="${l.unit}" onchange="updateLine(${l.id}, 'unit', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${l.cost}" onchange="updateLine(${l.id}, 'cost', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${l.margin}" onchange="updateLine(${l.id}, 'margin', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1 text-right font-bold font-mono">${Math.round(pVenta).toLocaleString('es-CL')}</td>
                <td class="p-1 text-right font-bold text-orange-600 font-mono">${Math.round(totalLinea).toLocaleString('es-CL')}</td>
                <td class="p-1 text-center"><button onclick="removeLine(${l.id})" class="text-red-500 font-bold">X</button></td>
            </tr>
        `;
    });

    const iva = subtotal * 0.19;
    document.getElementById('subtotalText').innerText = `${Math.round(subtotal).toLocaleString('es-CL')}`;
    document.getElementById('ivaText').innerText = `${Math.round(iva).toLocaleString('es-CL')}`;
    document.getElementById('totalText').innerText = `${Math.round(subtotal + iva).toLocaleString('es-CL')}`;
}

document.getElementById('btnAddLine').addEventListener('click', () => addLine());
document.getElementById('currency').addEventListener('change', renderLines);
document.getElementById('exchangeRate').addEventListener('input', (e) => { 
    saveSetting('exchangeRate', e.target.value); 
    renderLines(); 
});

// Excel masivo
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
                    id: Date.now() + Math.random(),
                    desc: desc,
                    qty: qty,
                    unit: row.unidad || row.Unidad || 'UN',
                    cost: cost,
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
    if(!client) return alert('Debes ingresar el nombre de la empresa/cliente.');

    const hoy = new Date();
    const formatoFecha = { day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = hoy.toLocaleDateString('es-CL', formatoFecha);

    const validDays = parseInt(document.getElementById('validDays').value) || 5;
    const fechaValida = new Date(hoy);
    fechaValida.setDate(fechaValida.getDate() + validDays);
    const validDateStr = fechaValida.toLocaleDateString('es-CL', formatoFecha);

    const quote = {
        id: qNum, 
        date: dateStr, 
        validDate: validDateStr,
        client,
        contact: document.getElementById('clientContact').value,
        rut: document.getElementById('clientRut').value, 
        address: document.getElementById('clientAddress').value,
        city: document.getElementById('clientCity').value,
        phone: document.getElementById('clientPhone').value, 
        email: document.getElementById('clientEmail').value,
        status: document.getElementById('quoteStatus').value, 
        notes: document.getElementById('notes').value,
        currency: document.getElementById('currency').value, 
        rate: document.getElementById('exchangeRate').value,
        lines: [...lines], 
        subtotal: parseFloat(document.getElementById('subtotalText').innerText.replace(/\D/g, '')),
        iva: parseFloat(document.getElementById('ivaText').innerText.replace(/\D/g, '')),
        total: parseFloat(document.getElementById('totalText').innerText.replace(/\D/g, '')), 
        synced: false
    };

    db.transaction("quotes", "readwrite").objectStore("quotes").put(quote);
    
    if (!editingQuoteId) {
        let seq = await loadSetting("seq", MIN_SEQ);
        await saveSetting("seq", Math.max(seq, MIN_SEQ) + 1);
    }
    
    editingQuoteId = null;
    document.getElementById('btnCancelEdit').classList.add('hidden');
    document.getElementById('btnSave').innerHTML = '💾 Guardar y Generar PDF';

    await updateNextQuoteCode();
    generatePDF(quote);
});

document.getElementById('btnCancelEdit').addEventListener('click', async () => {
    editingQuoteId = null;
    document.getElementById('btnCancelEdit').classList.add('hidden');
    document.getElementById('btnSave').innerHTML = '💾 Guardar y Generar PDF';
    
    document.getElementById('clientName').value = '';
    document.getElementById('clientContact').value = '';
    document.getElementById('clientRut').value = '';
    document.getElementById('clientAddress').value = '';
    document.getElementById('clientCity').value = '';
    document.getElementById('clientPhone').value = '';
    document.getElementById('clientEmail').value = '';
    lines = [];
    addLine(); 
    await updateNextQuoteCode();
});

// PDF con logo y formato DMYC
function generatePDF(q) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const formatMoney = (val) => {
        if (q.currency === 'USD') {
            return `US$ ${val.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        return `$${Math.round(val).toLocaleString('es-CL')}`;
    };

    const logo = new Image();
    logo.src = 'DMYC_logotipo_Mesa-de-trabajo-1.png';

    logo.onerror = () => {
        drawPdfContent(doc, q, formatMoney, null);
    };

    logo.onload = () => {
        drawPdfContent(doc, q, formatMoney, logo);
    };
}

function drawPdfContent(doc, q, formatMoney, logo) {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, 'F');

    if (logo) {
        doc.addImage(logo, 'PNG', 14, 10, 60, 14);
    }

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("DMYC spa 76.935.323-2", 75, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Cerro el plomo 5931 of 1213, Las Condes", 75, 20);
    doc.text("Región Metropolitana", 75, 25);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("COTIZACIÓN N°", 145, 15);
    doc.setFont("helvetica", "normal");
    doc.text(q.id, 180, 15);

    doc.setFont("helvetica", "bold");
    doc.text("FECHA", 145, 20);
    doc.setFont("helvetica", "normal");
    doc.text(q.date, 173, 20);

    doc.setFont("helvetica", "bold");
    doc.text("VÁLIDO HASTA", 145, 25);
    doc.setFont("helvetica", "normal");
    doc.text(q.validDate || q.date, 177, 25);

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(14, 35, 196, 35);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(27, 43, 65);
    doc.text("PRESUPUESTO PARA", 14, 45);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("Contacto", 14, 52);
    doc.setFont("helvetica", "normal");
    doc.text(q.contact || "-", 40, 52);

    doc.setFont("helvetica", "bold");
    doc.text("Empresa", 14, 57);
    doc.setFont("helvetica", "normal");
    doc.text(q.client || "-", 40, 57);

    doc.setFont("helvetica", "bold");
    doc.text("Rut", 14, 62);
    doc.setFont("helvetica", "normal");
    doc.text(q.rut || "-", 40, 62);

    doc.setFont("helvetica", "bold");
    doc.text("Dirección", 14, 67);
    doc.setFont("helvetica", "normal");
    doc.text(q.address || "-", 40, 67);

    doc.setFont("helvetica", "bold");
    doc.text("Ciudad", 14, 72);
    doc.setFont("helvetica", "normal");
    doc.text(q.city || "-", 40, 72);

    doc.setFont("helvetica", "bold");
    doc.text("Teléfono", 14, 77);
    doc.setFont("helvetica", "normal");
    doc.text(q.phone || "-", 40, 77);

    doc.setFont("helvetica", "bold");
    doc.text("Email", 14, 82);
    doc.setFont("helvetica", "normal");
    doc.text(q.email || "-", 40, 82);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(27, 43, 65);
    doc.text("AUTOR", 120, 52);
    doc.text("VENDEDOR", 120, 57);
    doc.text("TÉRMINOS", 120, 62);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text("FMC", 155, 52);
    doc.text("FMC", 155, 57);
    doc.text("Pago Transferencia", 155, 62);

    doc.setDrawColor(200, 200, 200);
    doc.line(14, 90, 196, 90);

    const rate = parseFloat(q.rate) || 1;
    let subtotalPDF = 0;

    const tableData = q.lines.map(l => {
        let costoBase = q.currency === 'USD' ? l.cost : l.cost;
        let divisor = 1 - (l.margin / 100);
        if (divisor <= 0) divisor = 0.01;
        let pVenta = costoBase / divisor;
        let totalLinea = pVenta * l.qty;
        subtotalPDF += totalLinea;

        return [
            l.qty,
            l.desc,
            formatMoney(pVenta),
            l.unit,
            formatMoney(totalLinea)
        ];
    });

    let ivaPDF = subtotalPDF * 0.19;
    let totalFinalPDF = subtotalPDF + ivaPDF;

    doc.autoTable({
        startY: 94,
        head: [[
            'CANT.',
            'DESCRIPCIÓN',
            'PRECIO\nPOR UNIDAD',
            'UNIDAD',
            'TOTAL'
        ]],
        body: tableData,
        theme: 'striped',
        headStyles: { 
            fillColor: [27, 43, 65],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 8
        },
        bodyStyles: { 
            textColor: [0,0,0],
            cellPadding: 3,
            fontSize: 8
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 20 },
            1: { halign: 'left',   cellWidth: 80 },
            2: { halign: 'center', cellWidth: 35 },
            3: { halign: 'center', cellWidth: 20 },
            4: { halign: 'right',  cellWidth: 30 }
        }
    });

    let finalY = doc.lastAutoTable.finalY + 8;

    doc.setFillColor(240, 240, 240);
    doc.rect(120, finalY - 4, 80, 22, 'F');

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("SUBTOTAL", 125, finalY);
    doc.setFont("helvetica", "normal");
    doc.text(formatMoney(subtotalPDF), 195, finalY, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.text("MONTO IVA 19%", 125, finalY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(formatMoney(ivaPDF), 195, finalY + 6, { align: "right" });

    doc.setFillColor(27, 43, 65);
    doc.rect(120, finalY + 10, 80, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL", 125, finalY + 16);
    doc.text(formatMoney(totalFinalPDF), 195, finalY + 16, { align: "right" });

    doc.setTextColor(27, 43, 65);
    doc.setFont("helvetica", "bold");
    doc.text("OBS:", 14, finalY + 25);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(q.notes, 100), 25, finalY + 25);

    let textY = finalY + 50;
    doc.setFontSize(9);
    doc.text("Si tiene cualquier tipo de pregunta acerca de esta oferta, póngase en contacto", 105, textY, { align: "center" });
    doc.text("indicando número de cotización.", 105, textY + 4, { align: "center" });

    doc.setTextColor(27, 43, 65);
    doc.setFont("helvetica", "bold");
    doc.text("TRANSFERENCIA", 105, textY + 12, { align: "center" });
    doc.setTextColor(0, 0, 0);
    doc.text("DMYC Spa", 105, textY + 16, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text("Banco BCI Cta. Cte. 95148019", 105, textY + 20, { align: "center" });
    doc.text("INFO@DMYC.CL", 105, textY + 24, { align: "center" });
    doc.setTextColor(27, 43, 65);
    doc.setFont("helvetica", "bold");
    doc.text("GRACIAS POR SU CONFIANZA!", 105, textY + 32, { align: "center" });

    doc.save(`${q.id}.pdf`);
}

// Historial
window.editQuoteHistory = function(id) {
    db.transaction("quotes").objectStore("quotes").get(id).onsuccess = (e) => {
        const q = e.target.result;
        if(q) {
            document.getElementById('historyView').classList.add('hidden');
            document.getElementById('newQuoteView').classList.remove('hidden');
            
            document.getElementById('quoteNumber').innerText = q.id;
            document.getElementById('clientName').value = q.client || '';
            document.getElementById('clientContact').value = q.contact || '';
            document.getElementById('clientRut').value = q.rut || '';
            document.getElementById('clientAddress').value = q.address || '';
            document.getElementById('clientCity').value = q.city || '';
            document.getElementById('clientPhone').value = q.phone || '';
            document.getElementById('clientEmail').value = q.email || '';
            document.getElementById('quoteStatus').value = q.status || 'Pendiente';
            document.getElementById('notes').value = q.notes || '';
            document.getElementById('currency').value = q.currency || 'CLP';
            document.getElementById('exchangeRate').value = q.rate || 950;
            
            lines = [...q.lines];
            renderLines();
            
            editingQuoteId = q.id;
            document.getElementById('btnCancelEdit').classList.remove('hidden');
            document.getElementById('btnSave').innerHTML = '💾 Actualizar Cotización y PDF';
        }
    };
};

document.getElementById('btnViewHistory').addEventListener('click', () => {
    document.getElementById('newQuoteView').classList.add('hidden');
    document.getElementById('historyView').classList.remove('hidden');
    db.transaction("quotes").objectStore("quotes").getAll().onsuccess = (e) => {
        document.getElementById('historyBody').innerHTML = e.target.result
            .sort((a,b) => a.id < b.id ? 1 : -1)
            .map(q => `
            <tr class="border-b text-center">
                <td class="p-2 font-bold text-gray-700">${q.id}</td>
                <td class="p-2">${q.date}</td>
                <td class="p-2 text-left">${q.client}</td>
                <td class="p-2">${q.total.toLocaleString('es-CL')}</td>
                <td class="p-2">${q.status}</td>
                <td class="p-2 flex justify-center gap-2">
                    <button onclick="editQuoteHistory('${q.id}')" class="text-green-600 hover:underline font-bold">✏️ Editar</button>
                    <button onclick="downloadPdfHistory('${q.id}')" class="text-blue-500 hover:underline">PDF</button>
                </td>
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

// Ajustar correlativo manualmente
document.getElementById('btnSetSeq').addEventListener('click', async () => {
    let currentSeq = await loadSetting("seq", MIN_SEQ);
    let newSeq = prompt(
        `El número actual interno es: ${currentSeq}.\n\n` +
        `Si tu PC va en la 407, escribe 408 aquí para que el iPad no choque:\n` +
        `¿Desde qué número quieres continuar?`,
        currentSeq
    );
    
    if (newSeq !== null && !isNaN(newSeq) && newSeq !== "") {
        newSeq = parseInt(newSeq);
        if (newSeq >= 1) {
            await saveSetting("seq", newSeq);
            await updateNextQuoteCode();
            alert(`¡Listo! La próxima cotización será la ${newSeq}.`);
        } else {
            alert("Por favor ingresa un número válido mayor a 0.");
        }
    }
});

// Sync con PC
document.getElementById('btnSync').addEventListener('click', () => {
    db.transaction("quotes").objectStore("quotes").getAll().onsuccess = async (e) => {
        const unSynced = e.target.result.filter(q => !q.synced);
        if(unSynced.length === 0) return alert("Todo sincronizado.");
        try {
            const res = await fetch('http://localhost:8787/api/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(unSynced)
            });
            if(res.ok) {
                const txWrite = db.transaction("quotes", "readwrite");
                unSynced.forEach(q => { q.synced = true; txWrite.objectStore("quotes").put(q); });
                alert("¡Sincronizado con PC exitosamente!");
            }
        } catch {
            alert("Error conectando al PC.");
        }
    };
});
