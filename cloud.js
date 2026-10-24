/* LAS YULAS — sincronización compartida opcional vía Supabase REST.
 * Solo requiere la URL del proyecto y la clave publicable (anon/publishable).
 * Nunca pongas una service_role key en el frontend.
 */
import { cloudConfig } from './cloud-config.js';

const SESSION_KEY = 'lasyulas_supabase_session_v1';
const CONFIG_SLUG = 'lasyulas';

export function cloudIsConfigured() {
  return Boolean(cloudConfig.url && cloudConfig.anonKey &&
    !cloudConfig.url.includes('TU-PROYECTO') && !cloudConfig.anonKey.includes('TU-CLAVE'));
}
export function cloudSettings() { return cloudConfig; }
function baseUrl() { return cloudConfig.url.replace(/\/$/, ''); }
function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function writeSession(value) {
  if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else sessionStorage.removeItem(SESSION_KEY);
}
async function api(path, options = {}, token = null) {
  const headers = {
    apikey: cloudConfig.anonKey,
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${baseUrl()}${path}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = body?.msg || body?.message || body?.error_description || body?.hint || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}
async function validSession() {
  const s = readSession();
  if (!s?.access_token) return null;
  if (s.expires_at && Date.now() < s.expires_at - 60000) return s;
  if (!s.refresh_token) { writeSession(null); return null; }
  try {
    const refreshed = await api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    const next = { ...refreshed, expires_at: Date.now() + (refreshed.expires_in || 3600) * 1000 };
    writeSession(next);
    return next;
  } catch { writeSession(null); return null; }
}
export async function cloudSignIn(email, password) {
  const session = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', body: JSON.stringify({ email: email.trim(), password })
  });
  const saved = { ...session, expires_at: Date.now() + (session.expires_in || 3600) * 1000 };
  writeSession(saved);
  try {
    const memberships = await api(`/rest/v1/menu_admins?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id&limit=1`, {}, session.access_token);
    if (!Array.isArray(memberships) || memberships.length === 0) throw new Error('No autorizado');
  } catch (e) {
    writeSession(null);
    throw new Error('La cuenta inició sesión, pero no está autorizada como administradora de LAS YULAS.');
  }
  return session.user;
}
export async function cloudIsAdmin() {
  const session = await validSession();
  if (!session?.user?.id) return false;
  try {
    const rows = await api(`/rest/v1/menu_admins?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id&limit=1`, {}, session.access_token);
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}
export async function cloudSignOut() {
  const session = await validSession();
  try { if (session?.access_token) await api('/auth/v1/logout', { method: 'POST' }, session.access_token); } catch { /* limpieza local siempre */ }
  writeSession(null);
}
export async function cloudFetchConfig() {
  if (!cloudIsConfigured()) return null;
  const rows = await api(`/rest/v1/menu_config?slug=eq.${CONFIG_SLUG}&select=payload,updated_at&limit=1`);
  return Array.isArray(rows) && rows[0]?.payload ? rows[0].payload : null;
}
export async function cloudSaveConfig(config) {
  if (!cloudIsConfigured()) return { skipped: true };
  const session = await validSession();
  if (!session?.access_token || !(await cloudIsAdmin())) {
    throw new Error('Inicia sesión con una cuenta administradora autorizada para sincronizar.');
  }
  const safePayload = structuredClone(config);
  // No publicar hashes ni configuración de autenticación local en la tabla pública.
  delete safePayload.editorAuth;
  await api('/rest/v1/menu_config?on_conflict=slug', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ slug: CONFIG_SLUG, payload: safePayload, updated_at: new Date().toISOString(), updated_by: session.user.id })
  }, session.access_token);
  return { synced: true };
}
