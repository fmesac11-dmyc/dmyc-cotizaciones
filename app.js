import { supabase, signIn, signUp, saveQuote, getAllQuotes, deleteQuote, saveSetting, loadSetting } from './db.js';
 
const MIN_SEQ = 400;
let lines = [];
let editingQuoteId = null;
let allQuotes = [];
 
// ─── AUTH ─────────────────────────────────────────────────────────────────────
 
async function checkSession() {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
        hideAuthOverlay();
        initApp();
    }
}
 
function hideAuthOverlay() {
    document.getElementById('authOverlay').classList.add('hidden');
}
 
function showAuthError(msg, isSuccess = false) {
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.className = isSuccess
        ? 'mb-4 text-sm text-green-700 bg-green-50 p-3 rounded'
        : 'mb-4 text-sm text-red-600 bg-red-50 p-3 rounded';
    el.classList.remove('hidden');
}
 
document.getElementById('btnLogin').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return showAuthError('Ingresa tu correo y contraseña.');
 
    const btn = document.getElementById('btnLogin');
    btn.textContent = 'Ingresando...';
    btn.disabled = true;
 
    const { error } = await signIn(email, password);
 
    btn.textContent = 'Ingresar';
    btn.disabled = false;
 
    if (error) {
        showAuthError('Credenciales incorrectas. Verifica tu correo y contraseña.');
    } else {
        hideAuthOverlay();
        initApp();
    }
});
 
document.getElementById('btnRegister').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return showAuthError('Ingresa un correo y contraseña.');
    if (password.length < 6) return showAuthError('La contraseña debe tener al menos 6 caracteres.');
 
    const btn = document.getElementById('btnRegister');
    btn.textContent = 'Creando...';
    btn.disabled = true;
 
    const { error } = await signUp(email, password);
 
    btn.textContent = 'Crear cuenta';
    btn.disabled = false;
 
    if (error) {
        showAuthError('No se pudo crear la cuenta: ' + error.message);
    } else {
        showAuthError('¡Cuenta creada! Revisa tu correo para confirmar y luego ingresa.', true);
    }
});
 
// ─── INIT ─────────────────────────────────────────────────────────────────────
 
async function initApp() {
    await updateNextQuoteCode();
    const rate = await loadSetting('exchangeRate', 950);
    document.getElementById('exchangeRate').value = rate;
    syncValidDaysToNotes();
    addLine();
}
 
// ─── HELPERS ──────────────────────────────────────────────────────────────────
 
function formatCLP(value) {
    return `$${Math.round(value).toLocaleString('es-CL')}`;
}
 
function safeText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
 
function getLineCalc(line, currency, rate) {
    const qty = Number(line.qty) || 0;
    const cost = Number(line.cost) || 0;
    const margin = Number(line.margin) || 0;
    const costCLP = currency === 'USD' ? cost * rate : cost;
    let divisor = 1 - (margin / 100);
    if (divisor <= 0) divisor = 0.01;
    const pVenta = costCLP / divisor;
    const totalLinea = pVenta * qty;
    const costoTotalLinea = costCLP * qty;
    const utilidadLinea = totalLinea - costoTotalLinea;
    return { qty, cost, margin, costCLP, pVenta, totalLinea, costoTotalLinea, utilidadLinea };
}
 
function calculateTotals() {
    const currency = document.getElementById('currency').value;
    const rate = parseFloat(document.getElementById('exchangeRate').value) || 1;
    let subtotal = 0, totalUtilidad = 0;
    lines.forEach(line => {
        const calc = getLineCalc(line, currency, rate);
        subtotal += calc.totalLinea;
        totalUtilidad += calc.utilidadLinea;
    });
    const iva = subtotal * 0.19;
    const total = subtotal + iva;
    return { subtotal, iva, total, totalUtilidad };
}
 
async function updateNextQuoteCode() {
    if (editingQuoteId) return;
    let seq = await loadSetting('seq', MIN_SEQ);
    seq = Math.max(seq, MIN_SEQ);
    const client = (document.getElementById('clientName').value || 'CLIE').substring(0, 4).toUpperCase();
    document.getElementById('quoteNumber').innerText = `COT-${String(seq).padStart(4, '0')}-${client}`;
}
 
document.getElementById('clientName').addEventListener('input', updateNextQuoteCode);
 
// ─── LINES ────────────────────────────────────────────────────────────────────
 
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
    if (!line) return;
    if (['qty', 'cost', 'margin'].includes(field)) {
        line[field] = parseFloat(value) || 0;
    } else {
        line[field] = value;
    }
    renderLines();
};
 
window.removeLine = function(id) {
    lines = lines.filter(l => l.id !== id);
    if (lines.length === 0) { addLine(); return; }
    renderLines();
};
 
function renderLines() {
    const tbody = document.getElementById('linesBody');
    tbody.innerHTML = '';
    const currency = document.getElementById('currency').value;
    const rate = parseFloat(document.getElementById('exchangeRate').value) || 1;
 
    lines.forEach(l => {
        const calc = getLineCalc(l, currency, rate);
        tbody.innerHTML += `
            <tr class="border-b bg-white">
                <td class="p-1"><input type="text" value="${safeText(l.desc)}" onchange="updateLine(${l.id}, 'desc', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${Number(l.qty)||0}" onchange="updateLine(${l.id}, 'qty', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="text" value="${safeText(l.unit)}" onchange="updateLine(${l.id}, 'unit', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${Number(l.cost)||0}" onchange="updateLine(${l.id}, 'cost', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1"><input type="number" value="${Number(l.margin)||0}" onchange="updateLine(${l.id}, 'margin', this.value)" class="w-full border p-1 rounded"></td>
                <td class="p-1 text-right font-bold font-mono">${formatCLP(calc.pVenta)}</td>
                <td class="p-1 text-right font-bold text-orange-600 font-mono">${formatCLP(calc.totalLinea)}</td>
                <td class="p-1 text-right font-bold text-green-700 font-mono bg-green-50">${formatCLP(calc.utilidadLinea)}</td>
                <td class="p-1 text-center"><button onclick="removeLine(${l.id})" class="text-red-500 font-bold">X</button></td>
            </tr>`;
    });
 
    const totals = calculateTotals();
    const utilityEl = document.getElementById('utilityText');
    const subtotalEl = document.getElementById('subtotalText');
    const ivaEl = document.getElementById('ivaText');
    const totalEl = document.getElementById('totalText');
    if (utilityEl) utilityEl.innerText = formatCLP(totals.totalUtilidad);
    if (subtotalEl) subtotalEl.innerText = formatCLP(totals.subtotal);
    if (ivaEl) ivaEl.innerText = formatCLP(totals.iva);
    if (totalEl) totalEl.innerText = formatCLP(totals.total);
}
 
function syncValidDaysToNotes() {
    const days = parseInt(document.getElementById('validDays').value) || 5;
    const notes = document.getElementById('notes');
    notes.value = notes.value.replace(/Validez de la oferta: \d+ días\./, `Validez de la oferta: ${days} días.`);
}
 
document.getElementById('validDays').addEventListener('input', syncValidDaysToNotes);
document.getElementById('btnAddLine').addEventListener('click', () => addLine());
document.getElementById('currency').addEventListener('change', renderLines);
document.getElementById('exchangeRate').addEventListener('input', async (e) => {
    await saveSetting('exchangeRate', e.target.value);
    renderLines();
});
 
// ─── BULK UPLOAD ──────────────────────────────────────────────────────────────
 
document.getElementById('btnBulkUpload').addEventListener('click', () => {
    document.getElementById('bulkUpload').click();
});
 
document.getElementById('bulkUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const excelData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
        let count = 0;
        excelData.forEach(row => {
            const desc = row.descripcion || row.Descripcion || row.DESCRIPCION || '';
            const qty = parseFloat(row.cantidad || row.Cantidad || row.CANTIDAD) || 0;
            const cost = parseFloat(row.costo || row.Costo || row.COSTO) || 0;
            if (desc && qty > 0 && cost > 0) {
                lines.push({
                    id: Date.now() + Math.random(), desc, qty,
                    unit: row.unidad || row.Unidad || row.UNIDAD || 'UN',
                    cost,
                    margin: parseFloat(row.margen_pct || row.Margen_pct || row.margen || row.Margen || 30) || 30
                });
                count++;
            }
        });
        document.getElementById('bulkUpload').value = '';
        renderLines();
        alert(`¡Cargados ${count} materiales desde el Excel!`);
    };
    reader.readAsArrayBuffer(file);
});
 
// ─── GUARDAR ──────────────────────────────────────────────────────────────────
 
document.getElementById('btnSave').addEventListener('click', async () => {
    const qNum = document.getElementById('quoteNumber').innerText;
    const client = document.getElementById('clientName').value.trim();
    if (!client) return alert('Debes ingresar el nombre de la empresa/cliente.');
 
    const hoy = new Date();
    const formatoFecha = { day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = hoy.toLocaleDateString('es-CL', formatoFecha);
    const validDays = parseInt(document.getElementById('validDays').value) || 5;
    const fechaValida = new Date(hoy);
    fechaValida.setDate(fechaValida.getDate() + validDays);
    const validDateStr = fechaValida.toLocaleDateString('es-CL', formatoFecha);
    const totals = calculateTotals();
 
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
        deliveryTime: document.getElementById('deliveryTime').value,
        notes: document.getElementById('notes').value,
        currency: document.getElementById('currency').value,
        rate: document.getElementById('exchangeRate').value,
        lines: [...lines],
        subtotal: totals.subtotal,
        iva: totals.iva,
        total: totals.total,
        utilityTotal: totals.totalUtilidad
    };
 
    const btn = document.getElementById('btnSave');
    const originalText = btn.innerHTML;
    btn.textContent = '⏳ Guardando...';
    btn.disabled = true;
 
    try {
        await saveQuote(quote);
        if (!editingQuoteId) {
            let seq = await loadSetting('seq', MIN_SEQ);
            await saveSetting('seq', Math.max(seq, MIN_SEQ) + 1);
        }
        editingQuoteId = null;
        document.getElementById('btnCancelEdit').classList.add('hidden');
        btn.innerHTML = '💾 Guardar y Generar PDF';
        btn.disabled = false;
        await updateNextQuoteCode();
        generatePDF(quote);
    } catch (err) {
        btn.innerHTML = originalText;
        btn.disabled = false;
        alert('Error al guardar: ' + err.message);
    }
});
 
document.getElementById('btnCancelEdit').addEventListener('click', async () => {
    editingQuoteId = null;
    document.getElementById('btnCancelEdit').classList.add('hidden');
    document.getElementById('btnSave').innerHTML = '💾 Guardar y Generar PDF';
    ['clientName','clientContact','clientRut','clientAddress','clientCity','clientPhone','clientEmail','deliveryTime'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('quoteStatus').value = 'Pendiente';
    lines = [];
    addLine();
    await updateNextQuoteCode();
});
 
// ─── HISTORIAL ────────────────────────────────────────────────────────────────
 
function statusBadge(status) {
    const colors = {
        'Pendiente': 'bg-yellow-100 text-yellow-800',
        'Ganado': 'bg-green-100 text-green-800',
        'Perdido': 'bg-red-100 text-red-800'
    };
    return `<span class="px-2 py-1 rounded text-xs font-bold ${colors[status] || 'bg-gray-100 text-gray-700'}">${status}</span>`;
}
 
function renderHistory() {
    const clientFilter = document.getElementById('filterClient').value.toLowerCase();
    const statusFilter = document.getElementById('filterStatus').value;
    const filtered = allQuotes.filter(q => {
        const matchClient = !clientFilter || q.client.toLowerCase().includes(clientFilter);
        const matchStatus = !statusFilter || q.status === statusFilter;
        return matchClient && matchStatus;
    });
    document.getElementById('historyBody').innerHTML = filtered.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-gray-400">Sin resultados.</td></tr>`
        : filtered.map(q => `
            <tr class="border-b text-center">
                <td class="p-2 font-bold text-gray-700">${q.id}</td>
                <td class="p-2">${q.date}</td>
                <td class="p-2 text-left">${q.client}</td>
                <td class="p-2">${formatCLP(q.total)}</td>
                <td class="p-2">${statusBadge(q.status)}</td>
                <td class="p-2">
                    <div class="flex justify-center gap-2 flex-wrap">
                        <button onclick="editQuoteHistory('${q.id}')" class="text-green-600 hover:underline font-bold text-sm">✏️ Editar</button>
                        <button onclick="duplicateQuote('${q.id}')" class="text-purple-600 hover:underline font-bold text-sm">📋 Duplicar</button>
                        <button onclick="downloadPdfHistory('${q.id}')" class="text-blue-500 hover:underline text-sm">📄 PDF</button>
                        <button onclick="deleteQuoteById('${q.id}')" class="text-red-500 hover:underline text-sm">🗑️ Eliminar</button>
                    </div>
                </td>
            </tr>`).join('');
}
 
document.getElementById('btnViewHistory').addEventListener('click', async () => {
    document.getElementById('newQuoteView').classList.add('hidden');
    document.getElementById('historyView').classList.remove('hidden');
    try {
        allQuotes = await getAllQuotes();
        renderHistory();
    } catch (err) {
        alert('Error al cargar historial: ' + err.message);
    }
});
 
document.getElementById('filterClient').addEventListener('input', renderHistory);
document.getElementById('filterStatus').addEventListener('change', renderHistory);
 
document.getElementById('btnBackToNew').addEventListener('click', () => {
    document.getElementById('historyView').classList.add('hidden');
    document.getElementById('newQuoteView').classList.remove('hidden');
});
 
window.editQuoteHistory = function(id) {
    const q = allQuotes.find(q => q.id === id);
    if (!q) return;
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
    document.getElementById('deliveryTime').value = q.deliveryTime || '';
    document.getElementById('quoteStatus').value = q.status || 'Pendiente';
    document.getElementById('notes').value = q.notes || '';
    document.getElementById('currency').value = q.currency || 'CLP';
    document.getElementById('exchangeRate').value = q.rate || 950;
    lines = [...q.lines];
    renderLines();
    editingQuoteId = q.id;
    document.getElementById('btnCancelEdit').classList.remove('hidden');
    document.getElementById('btnSave').innerHTML = '💾 Actualizar Cotización y PDF';
};
 
window.downloadPdfHistory = function(id) {
    const q = allQuotes.find(q => q.id === id);
    if (q) generatePDF(q);
};
 
window.deleteQuoteById = async function(id) {
    if (!confirm(`¿Eliminar la cotización ${id}? Esta acción no se puede deshacer.`)) return;
    try {
        await deleteQuote(id);
        allQuotes = allQuotes.filter(q => q.id !== id);
        renderHistory();
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
};
 
window.duplicateQuote = async function(id) {
    const original = allQuotes.find(q => q.id === id);
    if (!original) return;
    document.getElementById('historyView').classList.add('hidden');
    document.getElementById('newQuoteView').classList.remove('hidden');
    document.getElementById('clientName').value = original.client || '';
    document.getElementById('clientContact').value = original.contact || '';
    document.getElementById('clientRut').value = original.rut || '';
    document.getElementById('clientAddress').value = original.address || '';
    document.getElementById('clientCity').value = original.city || '';
    document.getElementById('clientPhone').value = original.phone || '';
    document.getElementById('clientEmail').value = original.email || '';
    document.getElementById('deliveryTime').value = original.deliveryTime || '';
    document.getElementById('quoteStatus').value = 'Pendiente';
    document.getElementById('notes').value = original.notes || '';
    document.getElementById('currency').value = original.currency || 'CLP';
    document.getElementById('exchangeRate').value = original.rate || 950;
    lines = original.lines.map(l => ({ ...l, id: Date.now() + Math.random() }));
    renderLines();
    editingQuoteId = null;
    document.getElementById('btnCancelEdit').classList.add('hidden');
    document.getElementById('btnSave').innerHTML = '💾 Guardar y Generar PDF';
    await updateNextQuoteCode();
};
 
// ─── AJUSTE NÚMERO ────────────────────────────────────────────────────────────
 
document.getElementById('btnSetSeq').addEventListener('click', async () => {
    let currentSeq = await loadSetting('seq', MIN_SEQ);
    let newSeq = prompt(`El número actual interno es: ${currentSeq}.\n\n¿Desde qué número quieres continuar?`, currentSeq);
    if (newSeq !== null && !isNaN(newSeq) && newSeq !== '') {
        newSeq = parseInt(newSeq);
        if (newSeq >= 1) {
            await saveSetting('seq', newSeq);
            await updateNextQuoteCode();
            alert(`¡Listo! La próxima cotización será la ${newSeq}.`);
        } else {
            alert('Por favor ingresa un número válido mayor a 0.');
        }
    }
});
 
// ─── PDF ──────────────────────────────────────────────────────────────────────
 
function generatePDF(q) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const formatMoney = (val) => q.currency === 'USD'
        ? `US$ ${val.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${Math.round(val).toLocaleString('es-CL')}`;
    const logo = new Image();
    logo.src = 'DMYC_logotipo_Mesa-de-trabajo-1.png';
    logo.onerror = () => drawPdfContent(doc, q, formatMoney, null);
    logo.onload = () => drawPdfContent(doc, q, formatMoney, logo);
}
 
function drawPdfContent(doc, q, formatMoney, logo) {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, 'F');
    if (logo) doc.addImage(logo, 'PNG', 14, 10, 40, 14);
 
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('DMYC spa 76.935.323-2', 75, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Cerro el plomo 5931 of 1213, Las Condes', 75, 20);
    doc.text('Región Metropolitana', 75, 25);
 
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold'); doc.text('COTIZACIÓN N°', 140, 15);
    doc.setFont('helvetica', 'normal'); doc.text(q.id, 170, 15);
    doc.setFont('helvetica', 'bold'); doc.text('FECHA', 140, 20);
    doc.setFont('helvetica', 'normal'); doc.text(q.date, 162, 20);
    doc.setFont('helvetica', 'bold'); doc.text('VÁLIDO HASTA', 140, 25);
    doc.setFont('helvetica', 'normal'); doc.text(q.validDate || q.date, 170, 25);
 
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
    doc.line(14, 35, 196, 35);
 
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.setTextColor(27, 43, 65); doc.text('PRESUPUESTO PARA', 14, 45);
    doc.setTextColor(0, 0, 0);
 
    const fields = [
        ['Contacto', q.contact], ['Empresa', q.client], ['Rut', q.rut],
        ['Dirección', q.address], ['Ciudad', q.city], ['Teléfono', q.phone], ['Email', q.email]
    ];
    fields.forEach(([label, val], i) => {
        doc.setFont('helvetica', 'bold'); doc.text(label, 14, 52 + i * 5);
        doc.setFont('helvetica', 'normal'); doc.text(val || '-', 40, 52 + i * 5);
    });
 
    doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 43, 65);
    doc.text('AUTOR', 120, 52); doc.text('VENDEDOR', 120, 57); doc.text('TÉRMINOS', 120, 62);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
    doc.text('FMC', 155, 52); doc.text('FMC', 155, 57); doc.text('Pago Transferencia', 155, 62);
 
    doc.setDrawColor(200, 200, 200); doc.line(14, 90, 196, 90);
 
    let subtotalPDF = 0;
    const tableData = q.lines.map(l => {
        let divisor = 1 - (l.margin / 100);
        if (divisor <= 0) divisor = 0.01;
        const pVenta = l.cost / divisor;
        const totalLinea = pVenta * l.qty;
        subtotalPDF += totalLinea;
        return [l.qty, l.desc, formatMoney(pVenta), l.unit, formatMoney(totalLinea)];
    });
 
    const ivaPDF = subtotalPDF * 0.19;
    const totalFinalPDF = subtotalPDF + ivaPDF;
 
    doc.autoTable({
        startY: 94,
        head: [['CANT.', 'DESCRIPCIÓN', 'PRECIO\nPOR UNIDAD', 'UNIDAD', 'TOTAL']],
        body: tableData, theme: 'striped',
        headStyles: { fillColor: [27,43,65], textColor: [255,255,255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
        bodyStyles: { textColor: [0,0,0], cellPadding: 3, fontSize: 8 },
        alternateRowStyles: { fillColor: [245,245,245] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 20 }, 1: { halign: 'left', cellWidth: 80 },
            2: { halign: 'center', cellWidth: 35 }, 3: { halign: 'center', cellWidth: 20 },
            4: { halign: 'right', cellWidth: 30 }
        }
    });
 
    let finalY = doc.lastAutoTable.finalY + 8;
 
    doc.setFillColor(240, 240, 240); doc.rect(120, finalY - 4, 80, 22, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold'); doc.text('SUBTOTAL', 125, finalY);
    doc.setFont('helvetica', 'normal'); doc.text(formatMoney(subtotalPDF), 195, finalY, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.text('MONTO IVA 19%', 125, finalY + 6);
    doc.setFont('helvetica', 'normal'); doc.text(formatMoney(ivaPDF), 195, finalY + 6, { align: 'right' });
    doc.setFillColor(27, 43, 65); doc.rect(120, finalY + 10, 80, 8, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', 125, finalY + 16);
    doc.text(formatMoney(totalFinalPDF), 195, finalY + 16, { align: 'right' });
 
    doc.setTextColor(27, 43, 65); doc.setFont('helvetica', 'bold');
    doc.text('OBS:', 14, finalY + 25);
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(q.notes || '', 100), 25, finalY + 25);
 
    if (q.deliveryTime) {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 43, 65);
        doc.text('PLAZO DE ENTREGA:', 14, finalY + 45);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
        doc.text(q.deliveryTime, 65, finalY + 45);
    }
 
    let textY = finalY + 100;
    doc.setFontSize(9);
    doc.text('Si tiene cualquier tipo de pregunta acerca de esta oferta, póngase en contacto', 105, textY, { align: 'center' });
    doc.text('indicando número de cotización.', 105, textY + 4, { align: 'center' });
    doc.setTextColor(27, 43, 65); doc.setFont('helvetica', 'bold');
    doc.text('TRANSFERENCIA', 105, textY + 12, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.text('DMYC Spa', 105, textY + 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text('Banco BCI Cta. Cte. 95148019', 105, textY + 20, { align: 'center' });
    doc.text('INFO@DMYC.CL', 105, textY + 24, { align: 'center' });
    doc.setTextColor(27, 43, 65); doc.setFont('helvetica', 'bold');
    doc.text('GRACIAS POR SU CONFIANZA!', 105, textY + 32, { align: 'center' });
 
    doc.save(`${q.id}.pdf`);
}
 
// ─── ARRANCAR ─────────────────────────────────────────────────────────────────
checkSession();
     return { subtotal, iva, total, totalUtilidad };
}

async function updateNextQuoteCode() {
    if (editingQuoteId) return;

    let seq = await loadSetting("seq", MIN_SEQ);
    seq = Math.max(seq, MIN_SEQ);

    const client = (document.getElementById('clientName').value || 'CLIE')
        .substring(0, 4)
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
    if (!line) return;

    if (field === 'qty' || field === 'cost' || field === 'margin') {
        line[field] = parseFloat(value) || 0;
    } else {
        line[field] = value;
    }

    renderLines();
};

window.removeLine = function(id) {
    lines = lines.filter(l => l.id !== id);

    if (lines.length === 0) {
        addLine();
        return;
    }

    renderLines();
};

function renderLines() {
    const tbody = document.getElementById('linesBody');
    tbody.innerHTML = '';

    const currency = document.getElementById('currency').value;
    const rate = parseFloat(document.getElementById('exchangeRate').value) || 1;

    lines.forEach(l => {
        const calc = getLineCalc(l, currency, rate);

        tbody.innerHTML += `
            <tr class="border-b bg-white">
                <td class="p-1">
                    <input
                        type="text"
                        value="${safeText(l.desc)}"
                        onchange="updateLine(${l.id}, 'desc', this.value)"
                        class="w-full border p-1 rounded"
                    >
                </td>
                <td class="p-1">
                    <input
                        type="number"
                        value="${Number(l.qty) || 0}"
                        onchange="updateLine(${l.id}, 'qty', this.value)"
                        class="w-full border p-1 rounded"
                    >
                </td>
                <td class="p-1">
                    <input
                        type="text"
                        value="${safeText(l.unit)}"
                        onchange="updateLine(${l.id}, 'unit', this.value)"
                        class="w-full border p-1 rounded"
                    >
                </td>
                <td class="p-1">
                    <input
                        type="number"
                        value="${Number(l.cost) || 0}"
                        onchange="updateLine(${l.id}, 'cost', this.value)"
                        class="w-full border p-1 rounded"
                    >
                </td>
                <td class="p-1">
                    <input
                        type="number"
                        value="${Number(l.margin) || 0}"
                        onchange="updateLine(${l.id}, 'margin', this.value)"
                        class="w-full border p-1 rounded"
                    >
                </td>
                <td class="p-1 text-right font-bold font-mono">
                    ${formatCLP(calc.pVenta)}
                </td>
                <td class="p-1 text-right font-bold text-orange-600 font-mono">
                    ${formatCLP(calc.totalLinea)}
                </td>
                <td class="p-1 text-right font-bold text-green-700 font-mono bg-green-50">
                    ${formatCLP(calc.utilidadLinea)}
                </td>
                <td class="p-1 text-center">
                    <button onclick="removeLine(${l.id})" class="text-red-500 font-bold">X</button>
                </td>
            </tr>
        `;
    });

    const totals = calculateTotals();

    const utilityEl = document.getElementById('utilityText');
    const subtotalEl = document.getElementById('subtotalText');
    const ivaEl = document.getElementById('ivaText');
    const totalEl = document.getElementById('totalText');

    if (utilityEl) utilityEl.innerText = formatCLP(totals.totalUtilidad);
    if (subtotalEl) subtotalEl.innerText = formatCLP(totals.subtotal);
    if (ivaEl) ivaEl.innerText = formatCLP(totals.iva);
    if (totalEl) totalEl.innerText = formatCLP(totals.total);
}

function syncValidDaysToNotes() {
    const days = parseInt(document.getElementById('validDays').value) || 5;
    const notes = document.getElementById('notes');
    notes.value = notes.value.replace(/Validez de la oferta: \d+ días\./, `Validez de la oferta: ${days} días.`);
}

document.getElementById('validDays').addEventListener('input', syncValidDaysToNotes);

document.getElementById('btnAddLine').addEventListener('click', () => addLine());
document.getElementById('currency').addEventListener('change', renderLines);
document.getElementById('exchangeRate').addEventListener('input', (e) => {
    saveSetting('exchangeRate', e.target.value);
    renderLines();
});

document.getElementById('btnBulkUpload').addEventListener('click', () => {
    document.getElementById('bulkUpload').click();
});

document.getElementById('bulkUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(ev) {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const excelData = XLSX.utils.sheet_to_json(
            workbook.Sheets[workbook.SheetNames[0]],
            { defval: "" }
        );

        let count = 0;

        excelData.forEach(row => {
            const desc = row.descripcion || row.Descripcion || row.DESCRIPCION || '';
            const qty = parseFloat(row.cantidad || row.Cantidad || row.CANTIDAD) || 0;
            const cost = parseFloat(row.costo || row.Costo || row.COSTO) || 0;

            if (desc && qty > 0 && cost > 0) {
                lines.push({
                    id: Date.now() + Math.random(),
                    desc,
                    qty,
                    unit: row.unidad || row.Unidad || row.UNIDAD || 'UN',
                    cost,
                    margin: parseFloat(row.margen_pct || row.Margen_pct || row.margen || row.Margen || 30) || 30
                });
                count++;
            }
        });

        document.getElementById('bulkUpload').value = '';
        renderLines();
        alert(`¡Cargados ${count} materiales desde el Excel!`);
    };

    reader.readAsArrayBuffer(file);
});

document.getElementById('btnSave').addEventListener('click', async () => {
    const qNum = document.getElementById('quoteNumber').innerText;
    const client = document.getElementById('clientName').value.trim();

    if (!client) {
        return alert('Debes ingresar el nombre de la empresa/cliente.');
    }

    const hoy = new Date();
    const formatoFecha = { day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = hoy.toLocaleDateString('es-CL', formatoFecha);

    const validDays = parseInt(document.getElementById('validDays').value) || 5;
    const fechaValida = new Date(hoy);
    fechaValida.setDate(fechaValida.getDate() + validDays);
    const validDateStr = fechaValida.toLocaleDateString('es-CL', formatoFecha);

    const totals = calculateTotals();

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
        deliveryTime: document.getElementById('deliveryTime').value,
        notes: document.getElementById('notes').value,
        currency: document.getElementById('currency').value,
        rate: document.getElementById('exchangeRate').value,
        lines: [...lines],
        subtotal: totals.subtotal,
        iva: totals.iva,
        total: totals.total,
        utilityTotal: totals.totalUtilidad,
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
    document.getElementById('deliveryTime').value = '';
    document.getElementById('quoteStatus').value = 'Pendiente';

    lines = [];
    addLine();
    await updateNextQuoteCode();
});

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
        doc.addImage(logo, 'PNG', 14, 10, 40, 14);
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
    doc.text("COTIZACIÓN N°", 140, 15);
    doc.setFont("helvetica", "normal");
    doc.text(q.id, 170, 15);

    doc.setFont("helvetica", "bold");
    doc.text("FECHA", 140, 20);
    doc.setFont("helvetica", "normal");
    doc.text(q.date, 162, 20);

    doc.setFont("helvetica", "bold");
    doc.text("VÁLIDO HASTA", 140, 25);
    doc.setFont("helvetica", "normal");
    doc.text(q.validDate || q.date, 170, 25);

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
            textColor: [0, 0, 0],
            cellPadding: 3,
            fontSize: 8
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 20 },
            1: { halign: 'left', cellWidth: 80 },
            2: { halign: 'center', cellWidth: 35 },
            3: { halign: 'center', cellWidth: 20 },
            4: { halign: 'right', cellWidth: 30 }
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
    doc.text(doc.splitTextToSize(q.notes || '', 100), 25, finalY + 25);

    if (q.deliveryTime) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(27, 43, 65);
        doc.text("PLAZO DE ENTREGA:", 14, finalY + 45);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(q.deliveryTime, 65, finalY + 45);
    }

    let textY = finalY + 100;
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

window.editQuoteHistory = function(id) {
    db.transaction("quotes").objectStore("quotes").get(id).onsuccess = (e) => {
        const q = e.target.result;
        if (!q) return;

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
        document.getElementById('deliveryTime').value = q.deliveryTime || '';
        document.getElementById('quoteStatus').value = q.status || 'Pendiente';
        document.getElementById('notes').value = q.notes || '';
        document.getElementById('currency').value = q.currency || 'CLP';
        document.getElementById('exchangeRate').value = q.rate || 950;

        lines = [...q.lines];
        renderLines();

        editingQuoteId = q.id;
        document.getElementById('btnCancelEdit').classList.remove('hidden');
        document.getElementById('btnSave').innerHTML = '💾 Actualizar Cotización y PDF';
    };
};

function statusBadge(status) {
    const colors = {
        'Pendiente': 'bg-yellow-100 text-yellow-800',
        'Ganado': 'bg-green-100 text-green-800',
        'Perdido': 'bg-red-100 text-red-800'
    };
    return `<span class="px-2 py-1 rounded text-xs font-bold ${colors[status] || 'bg-gray-100 text-gray-700'}">${status}</span>`;
}

let allQuotes = [];

function renderHistory() {
    const clientFilter = document.getElementById('filterClient').value.toLowerCase();
    const statusFilter = document.getElementById('filterStatus').value;

    const filtered = allQuotes.filter(q => {
        const matchClient = !clientFilter || q.client.toLowerCase().includes(clientFilter);
        const matchStatus = !statusFilter || q.status === statusFilter;
        return matchClient && matchStatus;
    });

    document.getElementById('historyBody').innerHTML = filtered.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-gray-400">Sin resultados.</td></tr>`
        : filtered.map(q => `
            <tr class="border-b text-center">
                <td class="p-2 font-bold text-gray-700">${q.id}</td>
                <td class="p-2">${q.date}</td>
                <td class="p-2 text-left">${q.client}</td>
                <td class="p-2">${formatCLP(q.total)}</td>
                <td class="p-2">${statusBadge(q.status)}</td>
                <td class="p-2">
                    <div class="flex justify-center gap-2 flex-wrap">
                        <button onclick="editQuoteHistory('${q.id}')" class="text-green-600 hover:underline font-bold text-sm">✏️ Editar</button>
                        <button onclick="duplicateQuote('${q.id}')" class="text-purple-600 hover:underline font-bold text-sm">📋 Duplicar</button>
                        <button onclick="downloadPdfHistory('${q.id}')" class="text-blue-500 hover:underline text-sm">📄 PDF</button>
                        <button onclick="deleteQuote('${q.id}')" class="text-red-500 hover:underline text-sm">🗑️ Eliminar</button>
                    </div>
                </td>
            </tr>
        `).join('');
}

document.getElementById('btnViewHistory').addEventListener('click', () => {
    document.getElementById('newQuoteView').classList.add('hidden');
    document.getElementById('historyView').classList.remove('hidden');

    db.transaction("quotes").objectStore("quotes").getAll().onsuccess = (e) => {
        allQuotes = e.target.result.sort((a, b) => a.id < b.id ? 1 : -1);
        renderHistory();
    };
});

document.getElementById('filterClient').addEventListener('input', renderHistory);
document.getElementById('filterStatus').addEventListener('change', renderHistory);

document.getElementById('btnBackToNew').addEventListener('click', () => {
    document.getElementById('historyView').classList.add('hidden');
    document.getElementById('newQuoteView').classList.remove('hidden');
});

window.downloadPdfHistory = function(id) {
    db.transaction("quotes").objectStore("quotes").get(id).onsuccess = (e) => {
        if (e.target.result) generatePDF(e.target.result);
    };
};

window.deleteQuote = function(id) {
    if (!confirm(`¿Eliminar la cotización ${id}? Esta acción no se puede deshacer.`)) return;
    db.transaction("quotes", "readwrite").objectStore("quotes").delete(id).onsuccess = () => {
        allQuotes = allQuotes.filter(q => q.id !== id);
        renderHistory();
    };
};

window.duplicateQuote = async function(id) {
    db.transaction("quotes").objectStore("quotes").get(id).onsuccess = async (e) => {
        const original = e.target.result;
        if (!original) return;

        document.getElementById('historyView').classList.add('hidden');
        document.getElementById('newQuoteView').classList.remove('hidden');

        document.getElementById('clientName').value = original.client || '';
        document.getElementById('clientContact').value = original.contact || '';
        document.getElementById('clientRut').value = original.rut || '';
        document.getElementById('clientAddress').value = original.address || '';
        document.getElementById('clientCity').value = original.city || '';
        document.getElementById('clientPhone').value = original.phone || '';
        document.getElementById('clientEmail').value = original.email || '';
        document.getElementById('deliveryTime').value = original.deliveryTime || '';
        document.getElementById('quoteStatus').value = 'Pendiente';
        document.getElementById('notes').value = original.notes || '';
        document.getElementById('currency').value = original.currency || 'CLP';
        document.getElementById('exchangeRate').value = original.rate || 950;

        lines = original.lines.map(l => ({ ...l, id: Date.now() + Math.random() }));
        renderLines();

        editingQuoteId = null;
        document.getElementById('btnCancelEdit').classList.remove('hidden');
        document.getElementById('btnSave').innerHTML = '💾 Guardar y Generar PDF';
        await updateNextQuoteCode();
    };
};

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

document.getElementById('btnSync').addEventListener('click', () => {
    db.transaction("quotes").objectStore("quotes").getAll().onsuccess = async (e) => {
        const unSynced = e.target.result.filter(q => !q.synced);

        if (unSynced.length === 0) {
            return alert("Todo sincronizado.");
        }

        try {
            const res = await fetch('http://localhost:8787/api/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(unSynced)
            });

            if (res.ok) {
                const txWrite = db.transaction("quotes", "readwrite");
                unSynced.forEach(q => {
                    q.synced = true;
                    txWrite.objectStore("quotes").put(q);
                });
                alert("¡Sincronizado con PC exitosamente!");
            }
        } catch {
            alert("Error conectando al PC.");
        }
    };
});
