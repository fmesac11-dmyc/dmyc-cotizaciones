// drive.js
let tokenClient = null;
let accessToken = null;

export function initDrive({ clientId }) {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: "https://www.googleapis.com/auth/drive.file",
    callback: (resp) => { accessToken = resp.access_token; }
  });
}

export function driveIsConnected() {
  return !!accessToken;
}

export function driveLogin() {
  if (!tokenClient) throw new Error("Drive no inicializado");
  tokenClient.requestAccessToken({ prompt: "consent" });
}

async function driveRequest(url, { method="GET", headers={}, body=null } = {}) {
  if (!accessToken) throw new Error("Sin token Drive");
  const res = await fetch(url, {
    method,
    headers: { ...headers, Authorization: `Bearer ${accessToken}` },
    body
  });
  if (!res.ok) throw new Error(`Drive error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function ensureFolder(folderName) {
  // Busca carpeta por nombre (simple). Si hay duplicadas, toma la primera.
  const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
  const found = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  if (found.files?.length) return found.files[0].id;

  const created = await driveRequest("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder" })
  });
  return created.id;
}

// Subida multipart (metadata + file)
export async function uploadFile({ folderId, filename, mimeType, blob }) {
  // Basado en el endpoint oficial de uploads multipart. [web:131]
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ name: filename, parents: [folderId] })], { type: "application/json" }));
  form.append("file", blob, filename);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });
  if (!res.ok) throw new Error(`Drive upload error: ${res.status} ${await res.text()}`);
  return res.json();
}
