/* =========================================================================
 * LAS YULAS · Menú Digital
 * app.js  ·  Render dinámico + Panel de edición visual
 *
 * Requiere ES Modules -> usar un servidor estático (no file://).
 * Ver README.md.
 * ========================================================================= */

import { menuConfig as DEFAULT_CONFIG } from "./data.js";
import { cloudIsConfigured, cloudSignIn, cloudSignOut, cloudFetchConfig, cloudSaveConfig, cloudIsAdmin, cloudSettings, cloudChangePassword } from "./cloud.js";

/* ----------------------------------------------------------------------
 * 0. Utilidades generales
 * ---------------------------------------------------------------------- */

const STORAGE_KEY = "lasyulas_menuconfig_v1";
const IDB_NAME = "lasyulas_images";
const IDB_STORE = "images";
const IDB_PREFIX = "idb://";

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "attrs") {
      for (const [a, b] of Object.entries(v)) {
        if (b === false || b == null) continue;
        node.setAttribute(a, b === true ? "" : String(b));
      }
    }
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function")
      node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") node.innerHTML = v;
    else node[k] = v;
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function toast(message, type = "info", ms = 2400) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = message;
  t.className = `toast toast--${type}`;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), ms);
}

/* Toast flotante con botón "Deshacer". Muestra un mensaje durante `ms`
   milisegundos y permite al usuario pulsar "Deshacer" para ejecutar la
   función `onUndo` antes de que el tiempo expire. */
function showUndoToast(message, onUndo, ms = 10000) {
  let existing = $("#undoToast");
  if (existing) existing.remove();

  const undoToast = el("div", { id: "undoToast", class: "undo-toast", role: "status", "aria-live": "polite" });
  const msg = el("span", { class: "undo-toast__msg" }, message);
  const undoBtn = el("button", { class: "undo-toast__btn", type: "button" }, "Deshacer");
  const dismissBtn = el("button", { class: "undo-toast__dismiss", type: "button", "aria-label": "Descartar" }, "×");
  undoToast.append(msg, undoBtn, dismissBtn);
  document.body.append(undoToast);

  // Animación de entrada
  requestAnimationFrame(() => undoToast.classList.add("is-visible"));

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    undoToast.classList.remove("is-visible");
    setTimeout(() => undoToast.remove(), 250);
  };

  undoBtn.addEventListener("click", () => {
    try { onUndo && onUndo(); } catch (e) { console.error("Error al deshacer:", e); }
    dismiss();
  });
  dismissBtn.addEventListener("click", dismiss);

  // Barra de progreso visual (10s)
  const progress = el("div", { class: "undo-toast__progress" });
  undoToast.append(progress);
  // Forzar reflow antes de iniciar la transición
  void progress.offsetWidth;
  progress.style.transition = `width ${ms}ms linear`;
  progress.style.width = "0%";

  timer = setTimeout(dismiss, ms);
}

/* ----------------------------------------------------------------------
 * 0b. Hashing de contraseñas (Web Crypto API · SHA-256)
 *    La contraseña nunca se guarda en texto plano. Se almacena el hash.
 * ---------------------------------------------------------------------- */

async function hashPassword(plain) {
  if (!plain) return null;
  try {
    const data = new TextEncoder().encode(plain);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (e) {
    console.error("Error al hashear contraseña:", e);
    return null;
  }
}

/* Sesión de edición: sessionStorage para que se borre al cerrar la pestaña */
const AUTH_SESSION_KEY = "lasyulas_auth_session";

function isSessionValid(cfg) {
  const auth = cfg.editorAuth || {};
  if (!auth.enabled) return true;
  if (!auth.passwordHash) return true; // primera vez (debe crear)
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return false;
    const { expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function setAuthSession(cfg) {
  const auth = cfg.editorAuth || {};
  const minutes = auth.sessionTimeoutMinutes || 30;
  const expiresAt = Date.now() + minutes * 60 * 1000;
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ expiresAt }));
}

function clearAuthSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

/* ----------------------------------------------------------------------
 * 1. IndexedDB - almacena blobs de imágenes seleccionadas por el usuario
 *    No se guardan imágenes como Base64 en localStorage.
 * ---------------------------------------------------------------------- */

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSave(id, blob, type) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ id, blob, type });
    tx.oncomplete = () => resolve(`idb://${id}`);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClearAll() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* Resuelve una referencia de imagen a una URL usable en <img src>.
   - URLs http(s)/data/relative -> se devuelven tal cual.
   - "idb://..." -> se recupera el blob desde IndexedDB y se crea objectURL. */
const _objectURLs = new Map();
function optimizeCloudinaryURL(url) {
  if (typeof url !== "string" || !url.includes("res.cloudinary.com/") || !url.includes("/image/upload/")) return url;
  // Transformación de entrega (no cambia la URL guardada en el producto): formato automático y calidad adaptativa.
  return url.replace("/image/upload/", "/image/upload/f_auto,q_auto/");
}

async function resolveImageURL(ref) {
  if (!ref) return null;
  if (typeof ref !== "string") return null;
  if (!ref.startsWith(IDB_PREFIX)) return optimizeCloudinaryURL(ref);
  const id = ref.slice(IDB_PREFIX.length);
  if (_objectURLs.has(id)) return _objectURLs.get(id);
  try {
    const record = await idbGet(id);
    if (!record) return null;
    const url = URL.createObjectURL(record.blob);
    _objectURLs.set(id, url);
    return url;
  } catch (e) {
    console.warn("No se pudo resolver imagen idb:", id, e);
    return null;
  }
}

function extractIdbIds(obj) {
  const ids = [];
  const visit = (o) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v.startsWith(IDB_PREFIX)) ids.push(v.slice(IDB_PREFIX.length));
      else if (typeof v === "object") visit(v);
    }
  };
  visit(obj);
  return ids;
}

/* ----------------------------------------------------------------------
 * 2. Estado global y persistencia (localStorage)
 * ---------------------------------------------------------------------- */

let state = structuredClone(DEFAULT_CONFIG);
const objectURLsToRevoke = new Set();

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("No se pudo leer configuración guardada:", e);
    return null;
  }
}

let cloudSaveTimer = null;
let cloudSaveRevision = 0;
function queueCloudSave(cfg) {
  if (!cloudIsConfigured()) return;
  const snapshot = structuredClone(cfg);
  const revision = ++cloudSaveRevision;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async () => {
    try {
      // No intentar escribir desde visitantes públicos o durante una migración inicial.
      if (!(await cloudIsAdmin())) return;
      await cloudSaveConfig(snapshot);
      if (revision === cloudSaveRevision) toast("Cambios sincronizados en la nube", "success", 2200);
    } catch (e) {
      console.error("No se pudo sincronizar con Supabase:", e);
      if (revision === cloudSaveRevision) toast(`Guardado localmente; no se sincronizó: ${e.message}`, "error", 5000);
    }
  }, 500);
}

function saveConfig(cfg) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    queueCloudSave(cfg);
    return true;
  } catch (e) {
    console.error("Error guardando configuración:", e);
    toast("No se pudo guardar en este navegador", "error");
    return false;
  }
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ----------------------------------------------------------------------
 * 3. Aplicación de tema (CSS variables) desde la configuración
 * ---------------------------------------------------------------------- */

function applyTheme(cfg) {
  const root = document.documentElement;
  const t = cfg.theme || {};
  const ty = cfg.typography || {};
  const l = cfg.layout || {};
  const v = cfg.visibility || {};
  const vars = {
    "--ly-bg": t.background,
    "--ly-surface": t.surface,
    "--ly-surface-alt": t.surfaceAlt,
    "--ly-text": t.text,
    "--ly-text-muted": t.textMuted,
    "--ly-text-subtle": t.textSubtle,
    "--ly-accent": t.accent,
    "--ly-accent-soft": t.accentSoft,
    "--ly-success": t.success,
    "--ly-warning": t.warning,
    "--ly-divider": t.divider,
    "--ly-heading-font": ty.headingFont,
    "--ly-body-font": ty.bodyFont,
    "--ly-heading-weight": ty.headingWeight,
    "--ly-heading-transform": ty.headingTransform,
    "--ly-base-size": (ty.baseSize || 16) + "px",
    "--ly-max-width": (l.maxWidth || 1200) + "px",
    "--ly-content-padding": (l.contentPadding || 24) + "px",
    // NOTA: --ly-columns NO se fija desde JS para no sobrescribir las
    // media queries responsive de styles.css. El valor de data.js se
    // expone como --ly-columns-desktop y se usa solo en pantallas grandes.
    "--ly-columns-desktop": l.columns || 2,
    "--ly-grid-gap": (l.gridGap || 28) + "px",
    "--ly-card-gap": (l.cardGap || 18) + "px",
    "--ly-image-ratio": l.imageRatio || "1 / 1",
    "--ly-image-radius": (l.imageRadius || 18) + "px",
    "--ly-card-radius": (l.cardRadius || 22) + "px",
    "--ly-banner-height": l.bannerHeight || "44vh",
    "--ly-banner-height-mobile": l.bannerHeightMobile || "32vh"
  };
  for (const [k, val] of Object.entries(vars)) {
    if (val != null) root.style.setProperty(k, val);
  }
  document.title = `${cfg.businessName || "Menú"} · Menú Digital`;
}

/* ----------------------------------------------------------------------
 * 4. Formateo de precios
 * ---------------------------------------------------------------------- */

function formatPrice(amount, cfg = state) {
  const c = cfg.currency || {};
  const locale = c.locale || "es-CO";
  const code = c.code || "COP";
  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: c.minimumFractionDigits ?? 0,
      maximumFractionDigits: c.maximumFractionDigits ?? 0
    }).format(amount || 0);
    return formatted;
  } catch (e) {
    return `${c.symbol || "$"}${(amount || 0).toLocaleString()}`;
  }
}

/* Devuelve true si un precio se considera "vacío":
   null, undefined, "", 0. Para menús de restaurante un precio en 0
   casi siempre significa "aún no definido", por eso lo tratamos como vacío. */
function isPriceEmpty(p) {
  return p == null || p === "" || p === 0;
}

/* Texto a mostrar en la tarjeta: "Consultar precio" si está vacío,
   o el precio formateado en caso contrario. */
function priceDisplay(price, cfg = state) {
  if (isPriceEmpty(price)) return "Consultar precio";
  return formatPrice(price, cfg);
}

/* ----------------------------------------------------------------------
 * 5. Render del menú
 * ---------------------------------------------------------------------- */

async function renderHeader(cfg) {
  if (!cfg.visibility?.showHeader) return null;
  const header = el("header", { class: "ly-header" });
  const logo = cfg.logo || {};
  if (logo.visible !== false && logo.src) {
    const img = el("img", {
      class: "ly-header__logo",
      alt: logo.alt || cfg.businessName || "",
      attrs: { loading: "eager", width: logo.width || 110, height: logo.width || 110 }
    });
    const resolved = await resolveImageURL(logo.src);
    img.src = resolved || cfg.fallbackImage || "";
    if (logo.width) img.style.width = logo.width + "px";
    header.append(img);
  }
  if (cfg.businessTagline) {
    header.append(el("p", { class: "ly-header__tagline" }, cfg.businessTagline));
  }
  return header;
}

async function renderBanner(cfg) {
  const b = cfg.banner || {};
  if (!cfg.visibility?.showBanner || b.visible === false) return null;
  const banner = el("section", { class: "ly-banner", attrs: { "aria-label": b.title || "Banner" } });
  const img = el("img", {
    class: "ly-banner__img",
    alt: b.alt || b.title || "",
    attrs: { loading: "eager" }
  });
  const resolved = await resolveImageURL(b.image);
  img.src = resolved || cfg.fallbackImage || "";
  const overlay = el("div", { class: "ly-banner__overlay" });
  if (typeof b.overlay === "number") overlay.style.opacity = String(b.overlay);
  const content = el("div", { class: "ly-banner__content" });
  if (b.title) content.append(el("h1", { class: "ly-banner__title" }, b.title));
  if (b.subtitle) content.append(el("p", { class: "ly-banner__subtitle" }, b.subtitle));
  banner.append(img, overlay, content);
  return banner;
}

async function renderCard(product, cfg) {
  if (product.visible === false) return null;
  const card = el("article", {
    class: ["ly-card", product.available === false ? "ly-card--unavailable" : ""].filter(Boolean).join(" "),
    dataset: { productId: product.id }
  });

  // Media (imagen + badges)
  const media = el("div", { class: "ly-card__media" });
  if (product.image) {
    const img = el("img", {
      class: "ly-card__img",
      alt: product.imageAlt || product.name || "",
      attrs: { loading: "lazy" }
    });
    const resolved = await resolveImageURL(product.image);
    img.src = resolved || cfg.fallbackImage || "";
    img.addEventListener("error", () => {
      img.src = cfg.fallbackImage || "";
    });
    media.append(img);
  }
  if (cfg.visibility?.showBadges && product.badge) {
    media.append(el("span", { class: "ly-card__badge" }, product.badge));
  }
  if (cfg.visibility?.showAvailability && product.available === false) {
    media.append(el("span", { class: "ly-card__availability" }, "Agotado"));
  }
  card.append(media);

  // Body
  const body = el("div", { class: "ly-card__body" });
  body.append(el("h3", { class: "ly-card__name" }, product.name || ""));

  if (cfg.visibility?.showProductDescription && product.description) {
    body.append(el("p", { class: "ly-card__description" }, product.description));
  }

  if (Array.isArray(product.variants) && product.variants.length) {
    const vWrap = el("div", { class: "ly-card__variants" });
    for (const v of product.variants) {
      if (v.visible === false) continue;
      vWrap.append(
        el("span", { class: "ly-card__variant" }, `${v.name}${v.price ? " · " + formatPrice(v.price, cfg) : ""}`)
      );
    }
    if (vWrap.children.length) body.append(vWrap);
  }

  const footer = el("div", { class: "ly-card__footer" });
  const priceWrap = el("div", { class: "ly-card__price-wrap" });
  const priceEl = el("span", { class: "ly-card__price" }, priceDisplay(product.price, cfg));
  if (isPriceEmpty(product.price)) priceEl.classList.add("ly-card__price--empty");
  priceWrap.append(priceEl);
  if (cfg.visibility?.showPriceOld && product.oldPrice) {
    priceWrap.append(el("span", { class: "ly-card__price-old" }, formatPrice(product.oldPrice, cfg)));
  }
  footer.append(priceWrap);
  body.append(footer);

  card.append(body);
  return card;
}

async function renderCategory(category, cfg) {
  if (category.visible === false) return null;
  const section = el("section", { class: "ly-category", id: `cat-${category.id}`, dataset: { catId: category.id } });

  // Header de categoría (con banner opcional propio)
  const header = el("header", { class: "ly-category__header" });
  if (cfg.visibility?.showCategoryTitle && category.title) {
    header.append(el("h2", { class: "ly-category__title" }, category.title));
  } else if (cfg.visibility?.showCategoryTitle && category.name) {
    header.append(el("h2", { class: "ly-category__title" }, category.name));
  }
  if (cfg.visibility?.showCategoryDescription && category.description) {
    header.append(el("p", { class: "ly-category__description" }, category.description));
  }
  if (category.bannerImage) {
    const bImg = el("img", {
      class: "ly-banner__img ly-category__banner",
      alt: category.bannerAlt || category.title || "",
      attrs: { loading: "lazy" },
      style: { position: "relative", borderRadius: "var(--ly-image-radius)", maxHeight: "200px", marginTop: "12px", width: "100%", objectFit: "cover" }
    });
    const resolved = await resolveImageURL(category.bannerImage);
    bImg.src = resolved || cfg.fallbackImage || "";
    header.append(bImg);
  }
  section.append(header);

  // Grid de productos
  const grid = el("div", { class: "ly-grid" });
  const products = [...(category.products || [])]
    .filter((p) => p.visible !== false)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  const cards = await Promise.all(products.map((p) => renderCard(p, cfg)));
  for (const c of cards) if (c) grid.append(c);
  section.append(grid);

  return section;
}

async function renderFooter(cfg) {
  if (!cfg.visibility?.showFooter) return null;
  const f = cfg.footer || {};
  const footer = el("footer", { class: "ly-footer" });
  if (f.text) footer.append(el("div", { class: "ly-footer__brand" }, f.text));
  if (f.contactAddress || f.contactPhone) {
    footer.append(
      el("div", { class: "ly-footer__contact" }, [f.contactAddress, f.contactPhone].filter(Boolean).join(" · "))
    );
  }
  const social = (f.social || []).filter((s) => s.visible !== false);
  if (social.length) {
    const wrap = el("nav", { class: "ly-footer__social", attrs: { "aria-label": "Redes y enlaces" } });
    for (const s of social) {
      wrap.append(el("a", { href: s.url || "#", target: "_blank", rel: "noopener" }, s.label || "Enlace"));
    }
    footer.append(wrap);
  }
  if (f.copyright) footer.append(el("div", { class: "ly-footer__copyright" }, f.copyright));
  return footer;
}

async function renderApp() {
  applyTheme(state);
  const app = $("#app");
  app.innerHTML = "";
  const frag = document.createDocumentFragment();

  const header = await renderHeader(state);
  if (header) frag.append(header);

  const banner = await renderBanner(state);
  if (banner) frag.append(banner);

  const cats = [...(state.categories || [])]
    .filter((c) => c.visible !== false)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  for (const cat of cats) {
    const node = await renderCategory(cat, state);
    if (node) frag.append(node);
  }

  const footer = await renderFooter(state);
  if (footer) frag.append(footer);

  app.append(frag);

  // Botón de edición
  const editBtn = $("#editToggleBtn");
  if (state.visibility?.showEditButton !== false) {
    editBtn.hidden = false;
  } else {
    editBtn.hidden = true;
  }
}

/* ----------------------------------------------------------------------
 * 6. Autenticación del editor
 * ---------------------------------------------------------------------- */

const authModal = {
  el: null,
  mode: "login", // "login" | "create"
  onSubmit: null
};


function openAuthModal(mode, onSubmit) {
  authModal.el = $("#authModal");
  authModal.mode = mode;
  authModal.onSubmit = onSubmit;

  // Mostrar solo los campos del modo activo y deshabilitar los ocultos.
  $$("[data-auth-mode]").forEach((f) => {
    f.hidden = f.dataset.authMode !== mode;

    f.querySelectorAll("input, select, textarea").forEach((control) => {
      control.disabled = f.hidden;
    });
  });

  // Limpiar campos.
  $("#authPassword").value = "";
  $("#authNewPassword").value = "";
  $("#authNewPasswordConfirm").value = "";

  const err = $("#authError");
  err.hidden = true;
  err.textContent = "";

  // Configurar títulos y botón.
  const title = $("#authTitle");
  const subtitle = $(".auth__subtitle");
  const submitBtn = $("#authSubmit");

  if (mode === "create") {
    title.textContent = "Crear contraseña";
    subtitle.textContent =
      "Aún no hay contraseña definida. Crea una para proteger el editor.";
    submitBtn.textContent = "Crear y entrar";
  } else {
    title.textContent = "Acceso restringido";
    subtitle.textContent = "Introduce la contraseña para editar el menú";
    submitBtn.textContent = "Entrar";
  }

  authModal.el.classList.add("is-open");
  authModal.el.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-editing");

  // Enfocar un campo visible.
  setTimeout(() => {
    const focusTarget =
      mode === "create" ? $("#authNewPassword") : $("#authPassword");

    focusTarget?.focus();
  }, 50);
}

function closeAuthModal() {
  if (!authModal.el) return;
  authModal.el.classList.remove("is-open");
  authModal.el.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-editing");
  authModal.onSubmit = null;
}

function showAuthError(message) {
  const err = $("#authError");
  err.textContent = message;
  err.hidden = false;
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  if (typeof authModal.onSubmit !== "function") return;
  await authModal.onSubmit();
}

function wireAuthModal() {
  $("#authForm").addEventListener("submit", handleAuthSubmit);
  $$("[data-auth-close]").forEach((n) => n.addEventListener("click", closeAuthModal));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && authModal.el?.classList.contains("is-open")) closeAuthModal();
  });
}

/* Flujo principal: pedir contraseña (o crearla) antes de abrir el editor */
async function requestEditorAccess() {
  const auth = state.editorAuth || {};

  // En producción, la autenticación compartida sustituye la contraseña local.
  if (cloudIsConfigured()) {
    if (await cloudIsAdmin()) { openEditor(); return; }
    openAuthModal("login", async () => {
      const email = $("#authEmail").value.trim();
      const password = $("#authPassword").value;
      if (!email || !password) { showAuthError("Introduce el correo y la contraseña de tu cuenta autorizada."); return; }
      try {
        await cloudSignIn(email, password);
        closeAuthModal();
        toast("Acceso autorizado", "success");
        openEditor();
      } catch (e) {
        showAuthError(e.message || "No se pudo iniciar sesión.");
        $("#authPassword").value = "";
        $("#authPassword")?.focus();
      }
    });
    return;
  }

  // Auth deshabilitada: entrar directo
  if (auth.enabled === false) {
    openEditor();
    return;
  }

  // Sesión ya válida: entrar directo
  if (isSessionValid(state)) {
    openEditor();
    return;
  }

  // No hay hash todavía: modo "crear contraseña"
  if (!auth.passwordHash) {
    openAuthModal("create", async () => {
      const pw = $("#authNewPassword").value;
      const pwConfirm = $("#authNewPasswordConfirm").value;
      if (pw.length < 4) {
        showAuthError("La contraseña debe tener al menos 4 caracteres.");
        return;
      }
      if (pw !== pwConfirm) {
        showAuthError("Las contraseñas no coinciden.");
        return;
      }
      const hash = await hashPassword(pw);
      if (!hash) {
        showAuthError("No se pudo generar el hash. Intenta de nuevo.");
        return;
      }
      auth.passwordHash = hash;
      saveConfig(state);
      setAuthSession(state);
      closeAuthModal();
      toast("Contraseña creada. Recuerda exportar el JSON para persistirla en el despliegue.", "success", 4000);
      openEditor();
    });
    return;
  }

  // Hash existente: modo "login"
  openAuthModal("login", async () => {
    const pw = $("#authPassword").value;
    const hash = await hashPassword(pw);
    if (hash === auth.passwordHash) {
      setAuthSession(state);
      closeAuthModal();
      openEditor();
    } else {
      showAuthError("Contraseña incorrecta. Intenta de nuevo.");
      $("#authPassword").value = "";
      $("#authPassword")?.focus();
    }
  });
}

/* Cambiar contraseña desde el panel (requiere conocer la actual) */
function openChangePasswordDialog() {
  const auth = state.editorAuth || {};
  // Reutilizamos el modal pero mostrando ambos grupos: actual + nueva.
  // Modificamos la UI para combinar campos.
  const authEl = $("#authModal");
  const title = $("#authTitle");
  const subtitle = $(".auth__subtitle");
  const submitBtn = $("#authSubmit");
  title.textContent = "Cambiar contraseña";
  subtitle.textContent = "Introduce la contraseña actual y la nueva.";
  submitBtn.textContent = "Actualizar";


  // Mostrar los campos de contraseña actual, nueva y confirmación.
  $$("[data-auth-mode]").forEach((f) => {
    f.hidden = false;

    f.querySelectorAll("input, select, textarea").forEach((control) => {
      control.disabled = false;
    });
  });

  const loginLabel = document.querySelector('[for="authPassword"]');

  if (loginLabel) {
    loginLabel.textContent = "Contraseña actual";
  }

  const emailField = $("#authEmailField");

  if (emailField) {
    emailField.hidden = true;

    emailField.querySelectorAll("input, select, textarea").forEach((control) => {
      control.disabled = true;
    });
  }


  // Limpiar
  $("#authPassword").value = "";
  if ($("#authEmail")) $("#authEmail").value = "";
  $("#authNewPassword").value = "";
  $("#authNewPasswordConfirm").value = "";
  const err = $("#authError");
  err.hidden = true;
  err.textContent = "";

  authEl.classList.add("is-open");
  authEl.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-editing");
  setTimeout(() => $("#authPassword")?.focus(), 50);

  authModal.onSubmit = async () => {
    const current = $("#authPassword").value;
    const newPw = $("#authNewPassword").value;
    const newPwConfirm = $("#authNewPasswordConfirm").value;

    if (newPw.length < 4) {
      showAuthError("La nueva contraseña debe tener al menos 4 caracteres.");
      return;
    }
    if (newPw !== newPwConfirm) {
      showAuthError("Las contraseñas nuevas no coinciden.");
      return;
    }

    // ===== Ruta Supabase: cambiar la contraseña real de la cuenta =====
    if (cloudIsConfigured()) {
      try {
        await cloudChangePassword(current, newPw);
        closeAuthModal();
        toast("Contraseña actualizada en Supabase. La próxima sesión usará la nueva contraseña.", "success", 5000);
        buildDataTab();
      } catch (e) {
        showAuthError(e?.message || "No se pudo actualizar la contraseña en Supabase.");
        $("#authPassword").value = "";
        $("#authNewPassword").value = "";
        $("#authNewPasswordConfirm").value = "";
        $("#authPassword")?.focus();
      }
      return;
    }

    // ===== Ruta local (sin nube): verificar hash y actualizar localmente =====
    const currentHash = await hashPassword(current);
    if (auth.passwordHash && currentHash !== auth.passwordHash) {
      showAuthError("La contraseña actual no es correcta.");
      return;
    }
    const newHash = await hashPassword(newPw);
    if (!newHash) {
      showAuthError("No se pudo generar el hash. Intenta de nuevo.");
      return;
    }
    auth.passwordHash = newHash;
    auth.enabled = true;
    saveConfig(state);
    closeAuthModal();
    setAuthSession(state);
    toast("Contraseña actualizada. Exporta el JSON para que el cambio sea permanente en el despliegue.", "success", 5000);
    // Refrescar pestaña Datos
    buildDataTab();
  };
}

/* ----------------------------------------------------------------------
 * 7. Panel de edición visual
 * ---------------------------------------------------------------------- */

const editor = {
  panel: null,
  isOpen: false,
  activeTab: "general"
};

function openEditor() {
  editor.panel = $("#editorPanel");
  const logoutButton = $("#editorLogout");
  if (logoutButton) logoutButton.hidden = !cloudIsConfigured();
  editor.panel.classList.add("is-open");
  editor.panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-editing");
  editor.isOpen = true;
  buildAllTabs();
}

function closeEditor() {
  if (!editor.panel) return;
  editor.panel.classList.remove("is-open");
  editor.panel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-editing");
  editor.isOpen = false;
}

function switchTab(name) {
  editor.activeTab = name;
  $$(".editor__tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
  $$(".editor__section").forEach((s) => s.classList.toggle("is-active", s.dataset.section === name));
}

/* ----- Helpers de UI del editor ----- */

function field(labelText, controlNode) {
  return el("div", { class: "editor__field" }, [
    el("label", { class: "editor__label" }, labelText),
    controlNode
  ]);
}

function inputText(value, opts = {}) {
  const { type, placeholder, attrs, ...handlers } = opts;
  return el("input", {
    class: "editor__input",
    type: type || "text",
    value: value ?? "",
    placeholder: placeholder || "",
    attrs: attrs || {},
    ...handlers
  });
}

function textarea(value, opts = {}) {
  const { placeholder, attrs, ...handlers } = opts;
  return el("textarea", {
    class: "editor__textarea",
    placeholder: placeholder || "",
    attrs: attrs || {},
    ...handlers
  }, [value ?? ""]);
}

/* ----------------------------------------------------------------------
 * 5b. Cloudinary - subida de imágenes a la nube
 *
 * Sube un archivo de imagen a Cloudinary con un `public_id` fijo. Si ya
 * existe una imagen con ese public_id, se reemplaza automáticamente.
 * Usa un upload preset sin firmar (unsigned) para no exponer el API secret.
 *
 * Devuelve la URL pública de la imagen subida, o null si falla.
 * ---------------------------------------------------------------------- */

async function uploadToCloudinary(file, publicId) {
  const cfg = state.cloudinary || {};
  if (!cfg.cloudName || !cfg.uploadPreset) {
    // No configurado -> el caller debe usar IndexedDB como fallback
    return { ok: false, reason: "not-configured" };
  }

  const url = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", cfg.uploadPreset);

  // Usamos public_id_prefix en vez de public_id. Cloudinary toma nuestro
  // prefijo (lasyulas/reina_pepiada_arepas) y le añade un sufijo aleatorio.
  // Así nunca choca con assets existentes y siempre crea uno nuevo.
  // (public_id directo fallaría si el asset ya existe y overwrite=false,
  //  que es lo único permitido en presets unsigned.)
  const fullId = cfg.folder ? `${cfg.folder}/${publicId}` : publicId;
  formData.append("public_id_prefix", fullId);

  // NOTA: Cloudinary no permite "invalidate" en uploads unsigned.
  // La URL con /auto/ ya sirve siempre la última versión, así que no hace falta.
  // if (cfg.invalidateOnUpload !== false) {
  //   formData.append("invalidate", "true");
  // }

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error("Cloudinary error:", response.status, errText);
      return { ok: false, reason: `http-${response.status}`, error: errText };
    }
    const data = await response.json();
    // Cloudinary devuelve la URL con la versión correcta. La usamos tal cual
    // (incluye /v<numero>/ que es única por subida → no hay problema de cache).
    const secureUrl = data.secure_url || data.url;
    return { ok: true, url: secureUrl, publicId: data.public_id || fullId };

  } catch (e) {
    console.error("Error subiendo a Cloudinary:", e);
    return { ok: false, reason: "network", error: e.message };
  }
}

/* Construye el public_id lógico para un campo de imagen.
   Si el caller pasa un imageId explícito (producto/categoría), lo usa.
   Si no, genera uno con uid() para imágenes temporales. */
function buildPublicId(imageId) {
  return imageId || uid("img");
}

function imageField(currentRef, onPick, options = {}) {
  // options.publicId: imageId del producto/categoría (ej. "mixta_burgers")
  // options.label: texto opcional del botón
  const publicId = options.publicId || null;
  const label = options.label || "📂 Subir archivo";

  const thumb = el("img", {
    class: "editor__image-thumb",
    alt: "Vista previa",
    src: ""
  });
  const urlInput = el("input", {
    class: "editor__input",
    type: "text",
    value: typeof currentRef === "string" && !currentRef.startsWith(IDB_PREFIX) ? currentRef : "",
    placeholder: "URL de la imagen (https://…)"
  });
  const fileBtn = el("button", { class: "editor__file-btn", type: "button" }, label);
  const fileInput = el("input", { type: "file", accept: "image/*", style: { display: "none" } });

  // Indicador de carga
  const loadingHint = el("div", {
    class: "editor__file-hint",
    style: { fontSize: "11px", color: "var(--ly-text-subtle)", marginTop: "4px", display: "none" }
  });

  // Carga inicial de vista previa
  resolveImageURL(currentRef).then((url) => {
    if (url) thumb.src = url;
    else thumb.src = state.fallbackImage || "";
  });

  urlInput.addEventListener("input", () => {
    onPick(urlInput.value.trim() || null);
    if (urlInput.value && !urlInput.value.startsWith(IDB_PREFIX)) thumb.src = urlInput.value;
  });

  fileBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      toast("La imagen supera 6 MB", "error");
      return;
    }

    // Vista previa inmediata
    const localUrl = URL.createObjectURL(file);
    thumb.src = localUrl;

    // Intentar subir a Cloudinary si está configurado
    const cloud = state.cloudinary || {};
    if (cloud.cloudName && cloud.uploadPreset && publicId) {
      fileBtn.disabled = true;
      fileBtn.textContent = "⏳ Subiendo…";
      loadingHint.style.display = "block";
      loadingHint.textContent = `Subiendo a Cloudinary como "${publicId}"…`;

      const result = await uploadToCloudinary(file, publicId);

      fileBtn.disabled = false;
      fileBtn.textContent = label;
      loadingHint.style.display = "none";

      if (result.ok) {
        // URL pública de Cloudinary -> se guarda en el producto
        urlInput.value = result.url;
        onPick(result.url);
        thumb.src = result.url;
        toast("Imagen subida y guardada en la nube", "success");
        return;
      } else {
        // Fallback a IndexedDB si Cloudinary falla
        console.warn("Cloudinary falló, guardando localmente:", result.reason);
        toast("Sin conexión a la nube. Imagen guardada local.", "info");
      }
    }

    // Fallback IndexedDB (comportamiento anterior)
    const id = uid("img");
    const ref = await idbSave(id, file, file.type);
    urlInput.value = "";
    onPick(ref);
    thumb.src = localUrl;
    if (!cloud.cloudName || !cloud.uploadPreset) {
      toast("Imagen guardada localmente (configura Cloudinary en data.js para subir a la nube)", "info", 4000);
    }
  });

  return el("div", { class: "editor__image-field" }, [thumb, el("div", { class: "editor__field", style: { flex: 1, margin: 0 } }, [urlInput, loadingHint]), fileBtn, fileInput]);
}

function checkbox(checked, label) {
  const wrap = el("label", { class: "editor__checkbox-field" });
  const cb = el("input", { type: "checkbox", checked: !!checked });
  wrap.append(cb, document.createTextNode(label));
  return { wrap, input: cb };
}

/* ----- Tab: General ----- */

function buildGeneralTab() {
  const sec = $('[data-section="general"]');
  sec.innerHTML = "";

  sec.append(field("Nombre del negocio", inputText(state.businessName, {
    oninput: (e) => { state.businessName = e.target.value; applyTheme(state); }
  })));

  sec.append(field("Eslogan / Tagline", inputText(state.businessTagline, {
    oninput: (e) => { state.businessTagline = e.target.value; }
  })));

  // Logo
  const logoHead = el("div", { class: "editor__item-head" }, [
    el("strong", {}, "Logotipo")
  ]);
  const logoVisible = checkbox(state.logo?.visible !== false, "Mostrar logo");
  logoVisible.input.addEventListener("change", () => { state.logo.visible = logoVisible.input.checked; });
  logoHead.append(logoVisible.wrap);
  sec.append(el("div", { class: "editor__item" }, [
    logoHead,
    imageField(state.logo?.src, (ref) => { state.logo.src = ref; }, { publicId: "logo" }),
    field("Texto alternativo del logo", inputText(state.logo?.alt, {
      oninput: (e) => { state.logo.alt = e.target.value; }
    })),
    field("Ancho del logo (px)", inputText(state.logo?.width, {
      type: "number", attrs: { min: "40", max: "400" },
      oninput: (e) => { state.logo.width = parseInt(e.target.value) || 110; }
    }))
  ]));

  // Banner
  const bHead = el("div", { class: "editor__item-head" }, [
    el("strong", {}, "Banner superior")
  ]);
  const bVisible = checkbox(state.banner?.visible !== false, "Mostrar banner");
  bVisible.input.addEventListener("change", () => { state.banner.visible = bVisible.input.checked; });
  bHead.append(bVisible.wrap);
  sec.append(el("div", { class: "editor__item" }, [
    bHead,
    imageField(state.banner?.image, (ref) => { state.banner.image = ref; }, { publicId: "banner_main" }),
    field("Título del banner", inputText(state.banner?.title, {
      oninput: (e) => { state.banner.title = e.target.value; }
    })),
    field("Subtítulo del banner", inputText(state.banner?.subtitle, {
      oninput: (e) => { state.banner.subtitle = e.target.value; }
    })),
    field("Texto alternativo del banner", inputText(state.banner?.alt, {
      oninput: (e) => { state.banner.alt = e.target.value; }
    })),
    field("Opacidad de la superposición (0-1)", inputText(state.banner?.overlay, {
      type: "number", attrs: { step: "0.05", min: "0", max: "1" },
      oninput: (e) => { state.banner.overlay = parseFloat(e.target.value); }
    }))
  ]));

  // Footer
  const f = state.footer || {};
  const fHead = el("div", { class: "editor__item-head" }, [
    el("strong", {}, "Pie de página")
  ]);
  const fVisible = checkbox(state.visibility?.showFooter !== false, "Mostrar pie");
  fVisible.input.addEventListener("change", () => { state.visibility.showFooter = fVisible.input.checked; });
  fHead.append(fVisible.wrap);
  sec.append(el("div", { class: "editor__item" }, [
    fHead,
    field("Texto de marca", inputText(f.text, { oninput: (e) => { f.text = e.target.value; } })),
    field("Copyright", inputText(f.copyright, { oninput: (e) => { f.copyright = e.target.value; } })),
    field("Teléfono", inputText(f.contactPhone, { oninput: (e) => { f.contactPhone = e.target.value; } })),
    field("Dirección", inputText(f.contactAddress, { oninput: (e) => { f.contactAddress = e.target.value; } }))
  ]));
}

/* ----- Tab: Estilos (theme + layout) ----- */

function buildThemeTab() {
  const sec = $('[data-section="theme"]');
  sec.innerHTML = "";

  const t = state.theme;
  const colorFields = [
    ["Fondo", "background"],
    ["Superficie (tarjetas)", "surface"],
    ["Superficie alt", "surfaceAlt"],
    ["Texto principal", "text"],
    ["Texto suavizado", "textMuted"],
    ["Texto sutil", "textSubtle"],
    ["Acento (rojo)", "accent"],
    ["Éxito", "success"],
    ["Advertencia", "warning"],
    ["Divisor", "divider"]
  ];
  const colorGrid = el("div", { class: "editor__row" });
  for (const [label, key] of colorFields) {
    const input = el("input", {
      class: "editor__input",
      type: "color",
      value: normalizeColor(t[key])
    });
    input.addEventListener("input", () => {
      t[key] = input.value;
      if (key === "accent") t.accentSoft = hexToRgba(input.value, 0.18);
      applyTheme(state);
    });
    colorGrid.append(field(label, input));
  }
  sec.append(colorGrid);

  const ty = state.typography;
  sec.append(el("h3", { style: { margin: "16px 0 8px", fontSize: "14px", color: "var(--ly-text-muted)", letterSpacing: ".06em", textTransform: "uppercase" } }, "Tipografía"));
  sec.append(field("Fuente títulos", inputText(ty.headingFont, { oninput: (e) => { ty.headingFont = e.target.value; applyTheme(state); } })));
  sec.append(field("Fuente cuerpo", inputText(ty.bodyFont, { oninput: (e) => { ty.bodyFont = e.target.value; applyTheme(state); } })));
  sec.append(field("Tamaño base (px)", inputText(ty.baseSize, { type: "number", oninput: (e) => { ty.baseSize = parseInt(e.target.value) || 16; applyTheme(state); } })));

  const l = state.layout;
  sec.append(el("h3", { style: { margin: "16px 0 8px", fontSize: "14px", color: "var(--ly-text-muted)", letterSpacing: ".06em", textTransform: "uppercase" } }, "Layout"));
  const layoutGrid = el("div", { class: "editor__row" });
  layoutGrid.append(field("Columnas en escritorio (1-4)", inputText(l.columns, {
    type: "number", attrs: { min: "1", max: "4" },
    oninput: (e) => { l.columns = clamp(parseInt(e.target.value) || 2, 1, 4); applyTheme(state); }
  })));
  layoutGrid.append(field("Ancho máximo (px)", inputText(l.maxWidth, {
    type: "number", oninput: (e) => { l.maxWidth = parseInt(e.target.value) || 1200; applyTheme(state); }
  })));
  layoutGrid.append(field("Padding (px)", inputText(l.contentPadding, {
    type: "number", oninput: (e) => { l.contentPadding = parseInt(e.target.value) || 24; applyTheme(state); }
  })));
  layoutGrid.append(field("Gap del grid (px)", inputText(l.gridGap, {
    type: "number", oninput: (e) => { l.gridGap = parseInt(e.target.value) || 28; applyTheme(state); }
  })));
  layoutGrid.append(field("Ratio de imagen (CSS)", inputText(l.imageRatio, {
    placeholder: "1 / 1", oninput: (e) => { l.imageRatio = e.target.value || "1 / 1"; applyTheme(state); }
  })));
  layoutGrid.append(field("Radio imagen (px)", inputText(l.imageRadius, {
    type: "number", oninput: (e) => { l.imageRadius = parseInt(e.target.value) || 18; applyTheme(state); }
  })));
  layoutGrid.append(field("Radio tarjeta (px)", inputText(l.cardRadius, {
    type: "number", oninput: (e) => { l.cardRadius = parseInt(e.target.value) || 22; applyTheme(state); }
  })));
  sec.append(layoutGrid);

  // Visibilidad
  const v = state.visibility;
  sec.append(el("h3", { style: { margin: "16px 0 8px", fontSize: "14px", color: "var(--ly-text-muted)", letterSpacing: ".06em", textTransform: "uppercase" } }, "Visibilidad"));
  const visList = [
    ["Mostrar cabecera", "showHeader"],
    ["Mostrar banner", "showBanner"],
    ["Mostrar título de categoría", "showCategoryTitle"],
    ["Mostrar descripción de categoría", "showCategoryDescription"],
    ["Mostrar descripción de producto", "showProductDescription"],
    ["Mostrar pie de página", "showFooter"],
    ["Mostrar botón 'Editar menú'", "showEditButton"],
    ["Mostrar precio anterior tachado", "showPriceOld"],
    ["Mostrar etiquetas promocionales", "showBadges"],
    ["Mostrar estado de disponibilidad", "showAvailability"]
  ];
  for (const [label, key] of visList) {
    const cb = checkbox(v[key] !== false, label);
    cb.input.addEventListener("change", () => { v[key] = cb.input.checked; });
    sec.append(cb.wrap);
  }
}

/* ----- Tab: Categorías ----- */

function buildCategoriesTab() {
  const sec = $('[data-section="categories"]');
  sec.innerHTML = "";

  sec.append(el("h3", { style: { margin: "0 0 8px", fontSize: "14px", color: "var(--ly-text-muted)", letterSpacing: ".06em", textTransform: "uppercase" } }, "Categorías del menú"));

  const addBtn = el("button", { class: "editor__btn editor__btn--primary", type: "button" }, "+ Nueva categoría");
  addBtn.addEventListener("click", () => {
    const id = uid("cat");
    state.categories.push({
      id,
      name: "NUEVA CATEGORÍA",
      title: "NUEVA CATEGORÍA",
      description: "",
      bannerImage: null,
      bannerAlt: "",
      visible: true,
      order: state.categories.length + 1,
      products: []
    });
    buildCategoriesTab();
    toast("Categoría agregada", "success");
  });
  sec.append(addBtn);

  const list = el("div", { class: "editor__list", style: { marginTop: "12px" } });
  const cats = [...state.categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  cats.forEach((cat, idx) => {
    list.append(buildCategoryItem(cat, idx, cats.length));
  });
  sec.append(list);
}

function buildCategoryItem(cat, idx, total) {
  // Asegurar metadatos derivados al renderizar
  ensureCategoryMetadata(cat);

  const item = el("div", { class: "editor__item", dataset: { catId: cat.id } });

  const title = el("span", { class: "editor__item-title" }, cat.title || cat.name || "(sin nombre)");

  const actions = el("div", { class: "editor__item-actions" });
  actions.append(miniBtn("↑", "up", () => moveCategory(cat.id, -1)));
  actions.append(miniBtn("↓", "down", () => moveCategory(cat.id, 1)));
  actions.append(miniBtn("⧉", "dup", () => duplicateCategory(cat.id)));
  actions.append(miniBtn("🗑", "danger", () => deleteCategory(cat.id)));

  const visCb = checkbox(cat.visible !== false, "Visible");
  visCb.input.addEventListener("change", () => { cat.visible = visCb.input.checked; });

  const head = el("div", { class: "editor__item-head" }, [title, el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, [visCb.wrap, actions])]);
  item.append(head);

  const body = el("div", { class: "editor__item-body" });

  // ID interno (auto, read-only)
  body.append(field("ID interno (auto)", el("input", {
    class: "editor__input",
    type: "text",
    value: cat.id,
    attrs: { readonly: true }
  })));

  // Título visible (editable). Al cambiar, auto-derivar name y, si el
  // shortName no fue personalizado, también derivarlo.
  const shortNameInput = el("input", {
    class: "editor__input",
    type: "text",
    value: cat.shortName || "",
    attrs: { "data-field": "shortName" }
  });

  const titleInput = inputText(cat.title, {
    oninput: (e) => {
      cat.title = e.target.value;
      title.textContent = e.target.value || "(sin nombre)";
      cat.name = e.target.value; // sincronizar name con title
      // Si el shortName coincide con el auto-del-título-anterior, recalcularlo.
      const autoShort = slugify(cat.title);
      const current = shortNameInput.value;
      if (!current || current === slugify(titleInput.dataset.prevTitle || "")) {
        cat.shortName = autoShort;
        shortNameInput.value = autoShort;
      }
      titleInput.dataset.prevTitle = cat.title;
    }
  });
  titleInput.dataset.prevTitle = cat.title || "";
  body.append(field("Título visible", titleInput));

  // ShortName (slug, editable pero auto-derivado por defecto)
  shortNameInput.addEventListener("input", () => {
    cat.shortName = shortNameInput.value.trim();
  });
  body.append(field("Nombre corto (slug, para imageId)", shortNameInput));

  item.append(body);

  item.append(field("Descripción", textarea(cat.description, { oninput: (e) => { cat.description = e.target.value; } })));
  const catBannerId = `banner_${cat.shortName || cat.id}`;
  item.append(field("Imagen de cabecera (opcional)", imageField(cat.bannerImage, (ref) => { cat.bannerImage = ref; }, { publicId: catBannerId })));
  item.append(field("Texto alternativo del banner", inputText(cat.bannerAlt, { oninput: (e) => { cat.bannerAlt = e.target.value; } })));

  return item;
}

function moveCategory(id, dir) {
  const sorted = [...state.categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const i = sorted.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  const oi = sorted[i].order ?? i;
  const oj = sorted[j].order ?? j;
  sorted[i].order = oj;
  sorted[j].order = oi;
  buildCategoriesTab();
}

function duplicateCategory(id) {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat) return;
  const copy = structuredClone(cat);
  copy.id = uid("cat");
  copy.title = (cat.title || "Categoría") + " (copia)";
  copy.name = (cat.name || "categoria") + "-copia";
  copy.order = (state.categories.length + 1);
  if (Array.isArray(copy.products)) {
    copy.products = copy.products.map((p) => ({ ...p, id: uid("prod"), order: p.order }));
  }
  state.categories.push(copy);
  buildCategoriesTab();
  toast("Categoría duplicada", "success");
}

function deleteCategory(id) {
  if (!confirm("¿Eliminar esta categoría y todos sus productos?")) return;
  const removed = state.categories.find((c) => c.id === id);
  if (!removed) return;

  // Quitar la categoría
  state.categories = state.categories.filter((c) => c.id !== id);

  // Añadir la categoría y todos sus productos a tombstones
  state.deletedCategoryIds = Array.isArray(state.deletedCategoryIds) ? state.deletedCategoryIds : [];
  if (!state.deletedCategoryIds.includes(id)) {
    state.deletedCategoryIds.push(id);
  }
  state.deletedProductIds = Array.isArray(state.deletedProductIds) ? state.deletedProductIds : [];
  for (const p of (removed.products || [])) {
    if (!state.deletedProductIds.includes(p.id)) {
      state.deletedProductIds.push(p.id);
    }
  }
  saveConfig(state);
  buildCategoriesTab();

  // Toast "Deshacer" con 10s
  const catName = removed.title || removed.name || "Categoría";
  showUndoToast(`"${catName}" eliminada`, () => {
    // Restaurar la categoría
    state.categories.push(removed);
    // Quitar del tombstone de categorías
    state.deletedCategoryIds = (state.deletedCategoryIds || []).filter((cid) => cid !== id);
    // Quitar los productos restaurados del tombstone de productos
    const restoredProdIds = new Set((removed.products || []).map((p) => p.id));
    state.deletedProductIds = (state.deletedProductIds || []).filter((pid) => !restoredProdIds.has(pid));
    saveConfig(state);
    buildCategoriesTab();
    renderApp();
    toast(`"${catName}" restaurada`, "success");
  });
}

/* ----- Tab: Productos ----- */

let _productsSelectedCatId = null;

function buildProductsTab(catId = null) {
  const sec = $('[data-section="products"]');
  sec.innerHTML = "";

  const selectorWrap = el("div", { class: "editor__field" }, [el("label", { class: "editor__label" }, "Categoría")]);
  const select = el("select", { class: "editor__select" });
  const visibleCats = [...state.categories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  for (const c of visibleCats) {
    select.append(el("option", { value: c.id }, c.title || c.name || c.id));
  }
  selectorWrap.append(select);
  sec.append(selectorWrap);

  if (!visibleCats.length) {
    sec.append(el("p", { style: { color: "var(--ly-text-subtle)" } }, "Primero crea una categoría en la pestaña 'Categorías'."));
    return;
  }

  // Mantener la categoría seleccionada si sigue existiendo
  if (catId) _productsSelectedCatId = catId;
  if (_productsSelectedCatId && visibleCats.some((c) => c.id === _productsSelectedCatId)) {
    select.value = _productsSelectedCatId;
  } else {
    _productsSelectedCatId = visibleCats[0].id;
    select.value = _productsSelectedCatId;
  }

  const listWrap = el("div", { class: "editor__list", style: { marginTop: "12px" } });
  sec.append(listWrap);

  function refreshList() {
    listWrap.innerHTML = "";
    const cat = state.categories.find((c) => c.id === select.value);
    if (!cat) return;
    const addBtn = el("button", { class: "editor__btn editor__btn--primary", type: "button" }, "+ Nuevo producto");
    addBtn.addEventListener("click", () => {
      cat.products = cat.products || [];
      const newProd = {
        id: uid("prod"),
        name: "NUEVO PRODUCTO",
        description: "",
        price: null,
        oldPrice: null,
        image: null,
        imageAlt: "",
        badge: null,
        available: true,
        visible: true,
        order: (cat.products.length + 1),
        variants: []
      };
      // Auto-rellenar metadatos derivados
      ensureProductMetadata(newProd, cat);
      cat.products.push(newProd);
      buildProductsTab(cat.id);
      toast("Producto agregado", "success");
    });
    listWrap.append(addBtn);

    const products = [...(cat.products || [])].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    products.forEach((p, idx) => {
      listWrap.append(buildProductItem(p, idx, products.length, cat));
    });
  }

  select.addEventListener("change", () => {
    _productsSelectedCatId = select.value;
    refreshList();
  });
  refreshList();
}

function buildProductItem(p, idx, total, cat) {
  // Asegura metadatos derivados al renderizar
  ensureProductMetadata(p, cat);

  const item = el("div", { class: "editor__item", dataset: { productId: p.id } });

  const title = el("span", { class: "editor__item-title" }, p.name || "(sin nombre)");
  const actions = el("div", { class: "editor__item-actions" });
  actions.append(miniBtn("↑", "up", () => moveProduct(cat.id, p.id, -1)));
  actions.append(miniBtn("↓", "down", () => moveProduct(cat.id, p.id, 1)));
  actions.append(miniBtn("⧉", "dup", () => duplicateProduct(cat.id, p.id)));
  actions.append(miniBtn("🗑", "danger", () => deleteProduct(cat.id, p.id)));

  // Disponibilidad visible (operacional: marca "Agotado")
  const availCb = checkbox(p.available !== false, "Disponible");
  availCb.input.addEventListener("change", () => { p.available = availCb.input.checked; });

  const head = el("div", { class: "editor__item-head" }, [
    title,
    el("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } }, [availCb.wrap, actions])
  ]);
  item.append(head);

  // ===== Campos principales visibles =====
  const nameInput = inputText(p.name, {
    oninput: (e) => {
      p.name = e.target.value;
      title.textContent = e.target.value || "(sin nombre)";
      // Auto-recalcular campos derivados
      p.shortName = deriveShortName(p.name);
      p.imageId = deriveImageId(p.shortName, cat.shortName || cat.id);
      if (!p.imageAlt || p.imageAlt.startsWith("Hamburguesa ") || p.imageAlt.endsWith("de Las Yulas")) {
        p.imageAlt = `${p.name} de ${state.businessName || "Las Yulas"}`;
      }
      // Refrescar campos auto en la sección avanzada
      const snInput = advBody.querySelector('[data-field="shortName"]');
      const idInput = advBody.querySelector('[data-field="imageId"]');
      const altInput = advBody.querySelector('[data-field="imageAlt"]');
      if (snInput) snInput.value = p.shortName;
      if (idInput) idInput.value = p.imageId;
      if (altInput) altInput.value = p.imageAlt || "";
    }
  });
  item.append(field("Nombre", nameInput));

  const priceInput = inputText(p.price ?? "", {
    type: "number",
    placeholder: "Vacío = Consultar precio",
    oninput: (e) => {
      const v = e.target.value;
      p.price = v === "" ? null : parseFloat(v);
      if (isNaN(p.price)) p.price = null;
    }
  });
  item.append(field("Precio (COP)", priceInput));

  item.append(field("Descripción", textarea(p.description || "", {
    oninput: (e) => { p.description = e.target.value; }
  })));

  item.append(field("Imagen del producto", imageField(p.image, (ref) => { p.image = ref; }, { publicId: p.imageId })));

  // ===== Sección avanzada (colapsable) =====
  const advToggle = el("button", {
    class: "editor__btn editor__btn--ghost",
    type: "button",
    style: { marginTop: "10px", width: "100%" }
  }, "⚙ Opciones avanzadas");

  const advBody = el("div", { class: "editor__list", style: { display: "none", marginTop: "8px" } });

  advToggle.addEventListener("click", () => {
    const isHidden = advBody.style.display === "none";
    advBody.style.display = isHidden ? "block" : "none";
    advToggle.textContent = isHidden ? "▲ Ocultar avanzadas" : "⚙ Opciones avanzadas";
  });

  // Campos auto-calculados (read-only)
  const snInput = el("input", {
    class: "editor__input",
    type: "text",
    value: p.shortName || "",
    attrs: { readonly: true, "data-field": "shortName" }
  });
  advBody.append(field("Nombre corto (auto)", snInput));

  const idInput = el("input", {
    class: "editor__input",
    type: "text",
    value: p.imageId || "",
    attrs: { readonly: true, "data-field": "imageId" }
  });
  advBody.append(field("ID de imagen (auto)", idInput));

  const internalIdInput = el("input", {
    class: "editor__input",
    type: "text",
    value: p.id,
    attrs: { readonly: true }
  });
  advBody.append(field("ID interno (auto)", internalIdInput));

  const altInput = el("input", {
    class: "editor__input",
    type: "text",
    value: p.imageAlt || "",
    attrs: { "data-field": "imageAlt" },
    oninput: (e) => { p.imageAlt = e.target.value; }
  });
  advBody.append(field("Texto alternativo imagen", altInput));

  // Campos opcionales manuales
  advBody.append(field("Etiqueta promocional (opcional)", inputText(p.badge || "", {
    oninput: (e) => { p.badge = e.target.value || null; }
  })));

  advBody.append(field("Precio anterior (opcional)", inputText(p.oldPrice ?? "", {
    type: "number",
    oninput: (e) => { p.oldPrice = e.target.value === "" ? null : parseFloat(e.target.value); }
  })));

  // Visibilidad (auto-true, manual override en avanzadas)
  const visCb = checkbox(p.visible !== false, "Visible en el menú");
  visCb.input.addEventListener("change", () => { p.visible = visCb.input.checked; });
  advBody.append(visCb.wrap);

  // Variantes (tamaños opcionales)
  advBody.append(el("h4", {
    style: { margin: "8px 0 4px", fontSize: "13px", color: "var(--ly-text-muted)", letterSpacing: ".04em", textTransform: "uppercase" }
  }, "Variantes / tamaños"));
  const vWrap = el("div", { class: "editor__list" });
  p.variants = p.variants || [];
  p.variants.forEach((v, vi) => {
    vWrap.append(buildVariantItem(cat, p, v, vi));
  });
  advBody.append(vWrap);
  const addVariantBtn = el("button", { class: "editor__btn editor__btn--ghost", type: "button" }, "+ Variante");
  addVariantBtn.addEventListener("click", () => {
    p.variants.push({ name: "Nueva variante", price: 0, visible: true });
    buildProductsTab(cat.id);
  });
  advBody.append(addVariantBtn);

  item.append(advToggle);
  item.append(advBody);

  return item;
}

function buildVariantItem(cat, product, variant, idx) {
  const item = el("div", { class: "editor__item" });
  const visCb = checkbox(variant.visible !== false, "Visible");
  visCb.input.addEventListener("change", () => { variant.visible = visCb.input.checked; });
  const delBtn = miniBtn("🗑", "danger", () => {
    product.variants.splice(idx, 1);
    buildProductsTab(cat.id);
  });
  item.append(el("div", { class: "editor__item-head" }, [
    el("span", { class: "editor__item-title" }, `Variante ${idx + 1}`),
    el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, [visCb.wrap, delBtn])
  ]));
  const body = el("div", { class: "editor__item-body" });
  body.append(field("Nombre", inputText(variant.name, { oninput: (e) => { variant.name = e.target.value; } })));
  body.append(field("Precio", inputText(variant.price, { type: "number", oninput: (e) => { variant.price = parseFloat(e.target.value) || 0; } })));
  item.append(body);
  return item;
}

function moveProduct(catId, prodId, dir) {
  const cat = state.categories.find((c) => c.id === catId);
  if (!cat) return;
  const sorted = [...(cat.products || [])].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const i = sorted.findIndex((p) => p.id === prodId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  const oi = sorted[i].order ?? i;
  const oj = sorted[j].order ?? j;
  sorted[i].order = oj;
  sorted[j].order = oi;
  buildProductsTab(catId);
}

function duplicateProduct(catId, prodId) {
  const cat = state.categories.find((c) => c.id === catId);
  if (!cat) return;
  const p = (cat.products || []).find((pp) => pp.id === prodId);
  if (!p) return;
  const copy = structuredClone(p);
  copy.id = uid("prod");
  copy.name = (p.name || "Producto") + " (copia)";
  copy.order = (cat.products.length + 1);
  // Recalcular metadatos derivados según el nuevo nombre
  copy.shortName = deriveShortName(copy.name);
  copy.imageId = deriveImageId(copy.shortName, cat.shortName || cat.id);
  cat.products.push(copy);
  buildProductsTab(catId);
  toast("Producto duplicado", "success");
}

function deleteProduct(catId, prodId) {
  if (!confirm("¿Eliminar este producto?")) return;
  const cat = state.categories.find((c) => c.id === catId);
  if (!cat) return;
  const removed = (cat.products || []).find((p) => p.id === prodId);
  if (!removed) return;

  // Quitar el producto
  cat.products = (cat.products || []).filter((p) => p.id !== prodId);

  // Añadir al tombstone para que migrateConfig no lo vuelva a añadir
  state.deletedProductIds = Array.isArray(state.deletedProductIds) ? state.deletedProductIds : [];
  if (!state.deletedProductIds.includes(prodId)) {
    state.deletedProductIds.push(prodId);
  }
  saveConfig(state);
  buildProductsTab(catId);

  // Toast "Deshacer" con 10s
  const prodName = removed.name || "Producto";
  showUndoToast(`"${prodName}" eliminado`, () => {
    // Restaurar el producto a su categoría original
    const targetCat = state.categories.find((c) => c.id === catId) || cat;
    targetCat.products = targetCat.products || [];
    targetCat.products.push(removed);
    // Recalcular orden
    removed.order = targetCat.products.length;
    // Quitar del tombstone
    state.deletedProductIds = (state.deletedProductIds || []).filter((id) => id !== prodId);
    saveConfig(state);
    buildProductsTab(catId);
    renderApp();
    toast(`"${prodName}" restaurado`, "success");
  });
}

/* ----- Tab: Datos (importar/exportar/reset) ----- */

function buildDataTab() {
  const sec = $('[data-section="data"]');
  sec.innerHTML = "";

  if (cloudIsConfigured()) {
    sec.append(el("h3", { style: { margin: "0 0 8px", fontSize: "14px", color: "var(--ly-text-muted)", letterSpacing: ".06em", textTransform: "uppercase" } }, "Acceso compartido"));
    sec.append(el("div", { class: "editor__item" }, [
      el("div", { class: "editor__item-head" }, [el("span", { class: "editor__item-title" }, "🔐 Autenticación administrada por Supabase")]),
      el("p", { class: "editor__note" }, "Solo las cuentas añadidas a la tabla menu_admins pueden editar y sincronizar el menú. Para agregar o retirar administradores, gestiona sus usuarios en Supabase Authentication y su membresía en la tabla menu_admins.")
    ]));

    // Cambiar contraseña real de la cuenta Supabase del administrador actual
    const cloudChangePwBtn = el("button", { class: "editor__btn editor__btn--primary", type: "button", style: { marginTop: "8px" } }, "🔑 Cambiar contraseña");
    cloudChangePwBtn.addEventListener("click", () => openChangePasswordDialog());
    sec.append(cloudChangePwBtn);

    const signOutBtn = el("button", { class: "editor__btn editor__btn--ghost", type: "button", style: { marginTop: "8px" } }, "Cerrar sesión de administrador");
    signOutBtn.addEventListener("click", async () => { await cloudSignOut(); closeEditor(); toast("Sesión cerrada", "info"); });
    sec.append(signOutBtn);
  } else {
  // ---------- Seguridad del editor ----------
  const auth = state.editorAuth || {};
  sec.append(el("h3", { style: { margin: "0 0 8px", fontSize: "14px", color: "var(--ly-text-muted)", letterSpacing: ".06em", textTransform: "uppercase" } }, "Seguridad del editor"));

  const authStatus = auth.enabled !== false
    ? (auth.passwordHash ? "Protección activada" : "Sin contraseña definida")
    : "Protección deshabilitada";
  sec.append(el("div", { class: "editor__item" }, [
    el("div", { class: "editor__item-head" }, [
      el("span", { class: "editor__item-title" }, `🔒 ${authStatus}`)
    ]),
    el("p", { class: "editor__note" }, [
      "Estado actual del botón \"Editar menú\". ",
      auth.enabled !== false
        ? "Se requiere contraseña para acceder."
        : "Cualquier visitante puede abrir el editor. No recomendado en producción."
    ])
  ]));

  // Cambiar contraseña
  const changePwBtn = el("button", { class: "editor__btn editor__btn--primary", type: "button", style: { marginTop: "8px" } }, "🔑 Cambiar contraseña");
  changePwBtn.addEventListener("click", () => openChangePasswordDialog());
  sec.append(changePwBtn);

  // Activar / desactivar protección
  const toggleAuthBtn = el("button", {
    class: "editor__btn editor__btn--ghost",
    type: "button",
    style: { marginTop: "8px" }
  }, auth.enabled !== false ? "Desactivar protección" : "Reactivar protección");
  toggleAuthBtn.addEventListener("click", () => {
    if (auth.enabled !== false) {
      if (!confirm("¿Desactivar la protección del editor? Cualquier visitante podrá editar el menú en este navegador.")) return;
      auth.enabled = false;
      toast("Protección desactivada", "info");
    } else {
      auth.enabled = true;
      toast("Protección reactivada", "success");
    }
    saveConfig(state);
    buildDataTab();
  });
  sec.append(toggleAuthBtn);

  // Cerrar sesión
  if (isSessionValid(state)) {
    const logoutBtn = el("button", {
      class: "editor__btn editor__btn--ghost",
      type: "button",
      style: { marginTop: "8px" }
    }, "Cerrar sesión de edición");
    logoutBtn.addEventListener("click", () => {
      clearAuthSession();
      toast("Sesión cerrada. La próxima vez se pedirá la contraseña.", "info");
    });
    sec.append(logoutBtn);
  }

  sec.append(el("hr", { style: { border: "none", borderTop: "1px solid var(--ly-divider)", margin: "20px 0" } }));

  // ---------- Configuración JSON ----------
  sec.append(el("h3", { style: { margin: "0 0 8px", fontSize: "14px", color: "var(--ly-text-muted)", letterSpacing: ".06em", textTransform: "uppercase" } }, "Configuración JSON"));

  }

  // Exportar
  const exportBtn = el("button", { class: "editor__btn editor__btn--primary", type: "button" }, "⬇ Exportar JSON");
  exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `lasyulas-menu-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Configuración exportada", "success");
  });
  sec.append(exportBtn);

  // Importar
  const importBtn = el("button", { class: "editor__btn editor__btn--ghost", type: "button" }, "⬆ Importar JSON");
  const importInput = el("input", { type: "file", accept: "application/json", style: { display: "none" } });
  importBtn.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.categories)) throw new Error("Estructura inválida");
      // Al importar, asumimos que el JSON contiene la "verdad" del usuario.
      // Vaciamos tombstones para que los productos/categorías del JSON
      // importado no se vean bloqueados por tombstones viejos.
      state = mergeDefaults(parsed, structuredClone(DEFAULT_CONFIG));
      state.deletedProductIds = Array.isArray(parsed.deletedProductIds) ? parsed.deletedProductIds : [];
      state.deletedCategoryIds = Array.isArray(parsed.deletedCategoryIds) ? parsed.deletedCategoryIds : [];
      saveConfig(state);
      applyTheme(state);
      renderApp();
      buildAllTabs();
      toast("Configuración importada", "success");
    } catch (e) {
      toast("Archivo inválido: " + e.message, "error");
    }
  });
  sec.append(importBtn, importInput);

  // Reset
  const resetBtn = el("button", { class: "editor__btn editor__btn--danger", type: "button", style: { marginTop: "12px" } }, "↺ Restablecer demo");
  resetBtn.addEventListener("click", async () => {
    if (!confirm("Esto restablece TODOS los datos a la demostración original y borra las imágenes locales guardadas. ¿Continuar?")) return;
    // Limpia imágenes IndexedDB huérfanas
    await idbClearAll();
    _objectURLs.clear();
    clearConfig();
    // Restaurar defaults: esto también vacía los tombstones porque
    // DEFAULT_CONFIG los tiene como arrays vacíos.
    state = structuredClone(DEFAULT_CONFIG);
    saveConfig(state);
    applyTheme(state);
    renderApp();
    buildAllTabs();
    toast("Datos restablecidos", "info");
  });
  sec.append(resetBtn);

  // Información
  sec.append(el("div", { class: "editor__item", style: { marginTop: "16px" } }, [
    el("strong", {}, "Almacenamiento"),
    el("p", { class: "editor__note" }, [
      "Los cambios se guardan en este navegador mediante localStorage. Las imágenes subidas se almacenan en IndexedDB. ",
      "Para publicar en otros dispositivos necesitas un backend o desplegar manualmente el archivo JSON exportado."
    ])
  ]));
}

function buildAllTabs() {
  buildGeneralTab();
  buildThemeTab();
  buildCategoriesTab();
  buildProductsTab();
  buildDataTab();
}

/* ----- Mini utilidades UI ----- */

function miniBtn(label, cls, onClick) {
  const b = el("button", { class: `editor__mini-btn editor__mini-btn--${cls}`, type: "button" }, label);
  if (typeof onClick === "function") b.addEventListener("click", onClick);
  return b;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function normalizeColor(c) {
  if (!c) return "#000000";
  if (c.startsWith("#")) {
    // necesita 6 dígitos para input[type=color]
    if (c.length === 7) return c;
    if (c.length === 4) return "#" + c.slice(1).split("").map((x) => x + x).join("");
    return c.slice(0, 7);
  }
  // rgba/rgb -> ignora, devolver negro
  return "#000000";
}

function hexToRgba(hex, alpha) {
  const h = normalizeColor(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ----------------------------------------------------------------------
 * 7. Wiring de eventos del panel de edición
 * ---------------------------------------------------------------------- */

function wireEditor() {
  const editBtn = $("#editToggleBtn");
  editBtn.addEventListener("click", () => {
    if (editor.isOpen) closeEditor();
    else requestEditorAccess();
  });

  $$("[data-editor-close]").forEach((n) => n.addEventListener("click", closeEditor));
  $("#editorLogout")?.addEventListener("click", async () => {
    await cloudSignOut();
    closeEditor();
    toast("Sesión cerrada", "info");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && editor.isOpen) closeEditor();
  });

  $$(".editor__tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );

  const saveBtn = $("#editorSave");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const ok = saveConfig(state);
      if (ok) {
        renderApp();
        toast(cloudIsConfigured() ? "Guardado local; sincronizando…" : "Cambios guardados en este navegador", "success");
      }
    });
  }

  // Auto-guardado ligero al cambiar valores básicos (debounced)
  const autoSave = debounce(() => {
    saveConfig(state);
  }, 600);
  document.addEventListener("input", (e) => {
    if (editor.isOpen && e.target.closest(".editor__panel")) autoSave();
  });
}

/* ----------------------------------------------------------------------
 * 7b. Helpers de nomenclatura (slug, shortName, imageId)
 * ---------------------------------------------------------------------- */

function slugify(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/[^a-z0-9\s]/g, "") // quita especiales
    .trim()
    .replace(/\s+/g, "_");
}

function deriveShortName(name) {
  let s = slugify(name);
  // Quita prefijos de categoría comunes
  s = s.replace(/^(hamburguesa|arepa|salchipapa|picada)_/, "");
  // Quita "de_" residual (de "Arepa de Chorizo" -> "chorizo")
  if (s.startsWith("de_")) s = s.slice(3);
  // Quita sufijos comunes
  s = s.replace(/_tradicional$/, "").replace(/_sencilla$/, "");
  return s || slugify(name);
}

function deriveImageId(shortName, categoryShortName) {
  return `${shortName}_${categoryShortName}`;
}

function ensureProductMetadata(p, cat) {
  // Rellena campos derivados si faltan, sin tocar los que ya existen
  if (!p.shortName) p.shortName = deriveShortName(p.name || p.id || "producto");
  const catShort = cat.shortName || cat.id || "categoria";
  if (!p.imageId) p.imageId = deriveImageId(p.shortName, catShort);
  if (!p.imageAlt) p.imageAlt = `${p.name || "Producto"} de ${state.businessName || "Las Yulas"}`;
  return p;
}

function ensureCategoryMetadata(c) {
  if (!c.shortName) c.shortName = slugify(c.title || c.name || c.id || "categoria");
  if (!c.name) c.name = c.title || c.id || "CATEGORÍA";
  return c;
}

/* Normaliza un título para comparación: minúsculas, sin acentos ni espacios extra. */
function normalizeTitle(t) {
  return (t || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/* IDs de categorías que vienen de data.js (defaults). Se usan para preferir
   la categoría del usuario (id no-default) al deduplicar. */
const DEFAULT_CATEGORY_IDS = new Set(["hot-dogs", "burgers", "arepas", "salchipapas"]);

/* ----------------------------------------------------------------------
 * 7c. Migración idempotente de configuración
 *
 * Fusiona la configuración guardada en localStorage con los defaults de
 * data.js, AÑADIENDO solo categorías/productos que aún no existan. No
 * sobrescribe ni elimina los datos modificados por el usuario. Puede
 * ejecutarse múltiples veces sin crear duplicados.
 *
 * IMPORTANTE: las categorías se comparan por id Y por título normalizado.
 * Si el usuario creó una categoría con el mismo título que un default
 * (p.ej. "HAMBURGUESAS"), no se añade el default, sino que se fusionan
 * los productos del default en la categoría del usuario.
 *
 * Además, se ejecuta un paso de DEDUPLICACIÓN: si hay dos categorías con
 * el mismo título normalizado, se fusionan (preferiendo la del usuario,
 * id no-default) y se mueven los productos.
 * ---------------------------------------------------------------------- */

function migrateConfig(saved, defaults) {
  // 1) Mezcla de campos planos (theme, layout, etc.)
  const merged = mergeDefaults(saved, defaults);

  // Tombstones: IDs de productos y categorías eliminadas por el usuario.
  // Siempre se respetan: no se vuelven a añadir desde defaults.
  const deletedCats = new Set(merged.deletedCategoryIds || []);
  const deletedProds = new Set(merged.deletedProductIds || []);

  // 2) Sincronización de categorías y productos (match por id O título)
  const savedCats = Array.isArray(merged.categories) ? merged.categories : [];

  for (const defCat of defaults.categories) {
    // Si la categoría del default está en tombstones, saltarla completamente.
    if (deletedCats.has(defCat.id)) continue;

    ensureCategoryMetadata(defCat);
    for (const defProd of defCat.products) {
      ensureProductMetadata(defProd, defCat);
    }

    // Match por id O por título normalizado (case/accent-insensitive)
    let savedCat = savedCats.find(
      (c) =>
        c.id === defCat.id ||
        normalizeTitle(c.title) === normalizeTitle(defCat.title) ||
        normalizeTitle(c.name) === normalizeTitle(defCat.name)
    );

    if (!savedCat) {
      // No existe -> añadir la categoría completa (copia profunda)
      savedCat = structuredClone(defCat);
      // Filtrar productos del default que estén en tombstones
      savedCat.products = (savedCat.products || []).filter((p) => !deletedProds.has(p.id));
      savedCats.push(savedCat);
    } else {
      // Ya existe -> asegurar metadatos sin sobrescribir
      ensureCategoryMetadata(savedCat);
      if (!savedCat.shortName) savedCat.shortName = defCat.shortName;

      // Fusionar productos del default en la categoría guardada,
      // respetando tombstones (no re-añadir eliminados)
      const savedProds = Array.isArray(savedCat.products) ? savedCat.products : [];
      for (const defProd of defCat.products) {
        if (deletedProds.has(defProd.id)) continue;
        const exists = savedProds.find(
          (p) =>
            p.id === defProd.id ||
            (p.shortName && p.shortName === defProd.shortName) ||
            normalizeTitle(p.name) === normalizeTitle(defProd.name)
        );
        if (!exists) {
          const copy = structuredClone(defProd);
          ensureProductMetadata(copy, savedCat);
          savedProds.push(copy);
        } else {
          ensureProductMetadata(exists, savedCat);
        }
      }
      savedCat.products = savedProds;
    }
  }

  // 3) Deduplicación: fusionar categorías con el mismo título normalizado
  const beforeCount = savedCats.length;
  const dedupedCats = dedupCategories(savedCats);
  const changed = beforeCount !== dedupedCats.length;

  // 4) Reordenar por `order`
  dedupedCats.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  for (const c of dedupedCats) {
    if (Array.isArray(c.products)) {
      c.products.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    }
  }

  merged.categories = dedupedCats;
  // Marca para que init() sepa si debe persistir
  merged.__migrationChanged = changed;
  return merged;
}

/* Fusiona categorías duplicadas (mismo título normalizado) en una sola.
   Prefiere la categoría cuyo id NO es un default (es decir, la creada
   por el usuario). Mueve los productos de los duplicados al keeper. */
function dedupCategories(cats) {
  const groups = new Map();
  for (const c of cats) {
    const key = normalizeTitle(c.title) || normalizeTitle(c.name) || c.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const result = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    // Elegir keeper: preferir id no-default (categoría del usuario)
    let keeper = group[0];
    for (const c of group) {
      if (!DEFAULT_CATEGORY_IDS.has(c.id)) {
        keeper = c;
        break;
      }
    }
    // Mover productos de los duplicados al keeper
    const keeperProds = Array.isArray(keeper.products) ? [...keeper.products] : [];
    for (const c of group) {
      if (c === keeper) continue;
      const otherProds = Array.isArray(c.products) ? c.products : [];
      for (const p of otherProds) {
        const exists = keeperProds.find(
          (kp) =>
            kp.id === p.id ||
            (kp.shortName && p.shortName && kp.shortName === p.shortName) ||
            normalizeTitle(kp.name) === normalizeTitle(p.name)
        );
        if (!exists) {
          ensureProductMetadata(p, keeper);
          keeperProds.push(p);
        }
      }
    }
    keeper.products = keeperProds;
    result.push(keeper);
  }
  return result;
}

/* ----------------------------------------------------------------------
 * 8. Inicialización
 * ---------------------------------------------------------------------- */

async function init() {
  // En modo compartido, la configuración remota es la fuente de verdad.
  let remoteSaved = null;
  if (cloudIsConfigured()) {
    try { remoteSaved = await cloudFetchConfig(); }
    catch (e) { console.warn("No se pudo leer la configuración remota; se usará la copia local:", e); }
  }
  const saved = remoteSaved || loadConfig();
  // Migración idempotente: añade categorías/productos nuevos sin duplicar
  // y fusiona categorías duplicadas por título.
  state = migrateConfig(saved, structuredClone(DEFAULT_CONFIG));
  // Mantener copia local para carga rápida y tolerancia a desconexiones.
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.warn("No se pudo actualizar caché local:", e); }

  // Si la migración fusionó duplicados, persistir el resultado para que
  // no vuelvan a aparecer en la próxima carga.
  if (state.__migrationChanged) {
    delete state.__migrationChanged;
    saveConfig(state);
    console.info("[Las Yulas] Migración: se fusionaron categorías duplicadas y se guardó el resultado.");
  } else {
    delete state.__migrationChanged;
  }

  applyTheme(state);
  await renderApp();
  wireEditor();
  wireAuthModal();

  // Manejo global de errores de imagen (fallback automático)
  document.addEventListener(
    "error",
    (e) => {
      const target = e.target;
      if (target && target.tagName === "IMG" && !target.dataset.fallbackApplied && state.fallbackImage) {
        target.dataset.fallbackApplied = "1";
        target.src = state.fallbackImage;
      }
    },
    true
  );

  // Refresca el menú público periódicamente. No pisa el editor mientras se está usando.
  if (cloudIsConfigured()) {
    const interval = Math.max(10000, Number(cloudSettings().pollIntervalMs) || 20000);
    setInterval(async () => {
      if (editor.isOpen || document.visibilityState === "hidden") return;
      try {
        const remote = await cloudFetchConfig();
        if (!remote || JSON.stringify(remote) === JSON.stringify(state)) return;
        state = mergeDefaults(remote, structuredClone(DEFAULT_CONFIG));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
        applyTheme(state);
        await renderApp();
      } catch (e) { console.warn("No se pudo actualizar el menú remoto:", e); }
    }, interval);
  }
}

function mergeDefaults(saved, defaults) {
  if (!saved || typeof saved !== "object") return defaults;
  // Mezcla superficial profunda para campos nuevos del default
  const out = { ...defaults, ...saved };
  out.theme = { ...defaults.theme, ...(saved.theme || {}) };
  out.typography = { ...defaults.typography, ...(saved.typography || {}) };
  out.layout = { ...defaults.layout, ...(saved.layout || {}) };
  out.visibility = { ...defaults.visibility, ...(saved.visibility || {}) };
  out.currency = { ...defaults.currency, ...(saved.currency || {}) };
  out.logo = { ...defaults.logo, ...(saved.logo || {}) };
  out.banner = { ...defaults.banner, ...(saved.banner || {}) };
  out.footer = { ...defaults.footer, ...(saved.footer || {}) };
  out.editorAuth = { ...defaults.editorAuth, ...(saved.editorAuth || {}) };
  // Tombstones: arrays de IDs eliminados por el usuario. Si saved no los
  // tiene, se inicializan vacíos. Si los tiene, se conservan.
  out.deletedProductIds = Array.isArray(saved.deletedProductIds) ? saved.deletedProductIds : [];
  out.deletedCategoryIds = Array.isArray(saved.deletedCategoryIds) ? saved.deletedCategoryIds : [];
  out.categories = Array.isArray(saved.categories) ? saved.categories : defaults.categories;
  return out;
}

// Arranque
init().catch((e) => {
  console.error(e);
  const app = $("#app");
  if (app) app.innerHTML = `<p class="app-loading" style="color:#ff6b6b">Error al cargar el menú: ${e.message}</p>`;
});
