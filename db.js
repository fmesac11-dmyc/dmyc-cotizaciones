const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co'; // Reemplaza con tu URL real
const SUPABASE_KEY = 'TU_ANON_KEY'; // Reemplaza con tu Key real

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Función agregada para evitar el error de importación en app.js
export async function initDB() {
  console.log("Sistema de cotizaciones inicializado con Supabase");
  return supabase;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function saveQuote(quote) {
  const session = await getSession();
  if (!session) throw new Error("No hay sesión activa");
  const userId = session.user.id;

  const { error: qErr } = await supabase.from('cotizaciones').upsert({
    id: quote.id,
    user_id: userId,
    date: quote.date,
    valid_date: quote.validDate,
    client: quote.client,
    contact: quote.contact,
    rut: quote.rut,
    address: quote.address,
    city: quote.city,
    phone: quote.phone,
    email: quote.email,
    status: quote.status,
    delivery_time: quote.deliveryTime,
    notes: quote.notes,
    currency: quote.currency,
    rate: quote.rate,
    subtotal: quote.subtotal,
    iva: quote.iva,
    total: quote.total,
    utility_total: quote.utilityTotal,
    updated_at: new Date().toISOString()
  });

  if (qErr) throw qErr;

  await supabase.from('items_cotizacion').delete().eq('cotizacion_id', quote.id);

  const items = quote.lines.map((l, i) => ({
    cotizacion_id: quote.id,
    desc_text: l.desc,
    qty: l.qty,
    unit: l.unit,
    cost: l.cost,
    margin: l.margin,
    orden: i
  }));

  if (items.length > 0) {
    const { error: iErr } = await supabase.from('items_cotizacion').insert(items);
    if (iErr) throw iErr;
  }
}

export async function getAllQuotes() {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('*, items_cotizacion(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data.map(q => ({
    id: q.id,
    date: q.date,
    validDate: q.valid_date,
    client: q.client,
    contact: q.contact,
    rut: q.rut,
    address: q.address,
    city: q.city,
    phone: q.phone,
    email: q.email,
    status: q.status,
    deliveryTime: q.delivery_time,
    notes: q.notes,
    currency: q.currency,
    rate: q.rate,
    subtotal: q.subtotal,
    iva: q.iva,
    total: q.total,
    utilityTotal: q.utility_total,
    lines: (q.items_cotizacion || [])
      .sort((a, b) => a.orden - b.orden)
      .map(i => ({ id: i.id, desc: i.desc_text, qty: i.qty, unit: i.unit, cost: i.cost, margin: i.margin }))
  }));
}

export async function deleteQuote(id) {
  const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
  if (error) throw error;
}

export async function saveSetting(key, value) {
  localStorage.setItem(`dmyc_${key}`, JSON.stringify(value));
}

export async function loadSetting(key, defaultVal) {
  const stored = localStorage.getItem(`dmyc_${key}`);
  return stored !== null ? JSON.parse(stored) : defaultVal;
}
