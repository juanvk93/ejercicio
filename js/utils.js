/* ============================================================
   utils.js — Utilidades compartidas: DOM, formato, IDs,
   toast, modales y gráficas SVG.
   ============================================================ */

/* ---------- IDs y fechas ---------- */
export function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Convierte un valor a Date interpretando las cadenas 'YYYY-MM-DD' como
 * fecha LOCAL (no UTC). Sin esto, `new Date('2026-06-01')` se interpreta como
 * medianoche UTC y en zonas horarias detrás de UTC muestra el día anterior.
 */
function toLocalDate(value) {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(value);
}

export function fmtDate(value) {
  return toLocalDate(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateShort(value) {
  return toLocalDate(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function fmtTime(value) {
  return new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/** Construye un timestamp (ms) a partir de fecha 'YYYY-MM-DD' y hora 'HH:MM' (hora local). */
export function tsFromDateTime(dateStr, timeStr) {
  const d = dateStr || todayISO();
  const t = /^\d{2}:\d{2}/.test(timeStr || '') ? timeStr : '00:00';
  const ms = new Date(`${d}T${t}`).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

/** Devuelve 'YYYY-MM-DD' (hora local) a partir de un timestamp. */
export function dateInputValue(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Devuelve 'HH:MM' (hora local) a partir de un timestamp. */
export function timeInputValue(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Cronómetro legible (M:SS o H:MM:SS) para mostrar tiempo transcurrido en vivo. */
export function fmtClock(ms) {
  if (!ms || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/** Duración legible entre dos timestamps (ms). */
export function fmtDuration(ms) {
  if (!ms || ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

/* ---------- Números ---------- */
export function round(n, decimals = 1) {
  const f = Math.pow(10, decimals);
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

export function num(v, fallback = 0) {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

/** Formatea un número quitando decimales innecesarios. */
export function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(round(n, 1));
}

export const LB_TO_KG = 0.45359237;
export function lbToKg(lb) { return round(num(lb) * LB_TO_KG, 2); }
export function kgToLb(kg) { return round(num(kg) / LB_TO_KG, 2); }

/* ---------- Discos por lado (compartido por la calculadora y la sesión) ---------- */
// Discos habituales por unidad (de mayor a menor) y peso de barra olímpica por defecto.
export const PLATES = { kg: [20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] };
export const DEFAULT_BAR = { kg: 20, lb: 45 };

/** Reparte el peso de un lado en discos (algoritmo voraz). */
export function platesPerSide(target, bar, plates) {
  const perSide = round((target - bar) / 2, 2);
  if (perSide <= 0) return { list: [], leftover: 0, perSide };
  const list = [];
  let rem = perSide;
  for (const p of plates) {
    let count = 0;
    while (rem >= p - 1e-9) { rem = round(rem - p, 2); count++; }
    if (count) list.push({ plate: p, count });
  }
  return { list, leftover: round(rem, 2), perSide };
}

/* ---------- DOM helpers ---------- */
export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

/** Escapa texto para inserción segura en HTML. */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/* ---------- Toast ---------- */
let _toastTimer = null;
export function toast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = 'toast' + (type ? ' ' + type : ''); }, 2400);
}

/* ---------- Modal genérico (bottom sheet) ---------- */
/**
 * Muestra un modal. content puede ser HTMLElement o string HTML.
 * Devuelve { close } y resuelve cuando se cierra.
 */
let _activeModalClose = null;
export function showModal(title, content, { onClose } = {}) {
  // Singleton: cierra cualquier modal anterior para evitar diálogos apilados
  // (p. ej. por un doble toque que abriría dos confirmaciones a la vez).
  if (_activeModalClose) _activeModalClose();

  const backdrop = el('<div class="modal-backdrop"></div>');
  const modal = el('<div class="modal" role="dialog" aria-modal="true"></div>');
  modal.appendChild(el('<div class="modal-handle"></div>'));
  if (title) modal.appendChild(el(`<h3>${esc(title)}</h3>`));
  const body = el('<div class="modal-body"></div>');
  if (typeof content === 'string') body.innerHTML = content;
  else body.appendChild(content);
  modal.appendChild(body);
  backdrop.appendChild(modal);

  function close() {
    if (_activeModalClose === close) _activeModalClose = null;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);

  document.body.appendChild(backdrop);
  _activeModalClose = close;
  return { close, modal, body };
}

/** Confirmación con promesa. */
export function confirmDialog(message, { okText = 'Eliminar', danger = true } = {}) {
  return new Promise((resolve) => {
    const content = el(`
      <div>
        <p class="muted" style="margin-top:0">${esc(message)}</p>
        <div class="btn-row mt">
          <button class="btn ghost" data-act="cancel">Cancelar</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(okText)}</button>
        </div>
      </div>`);
    const { close } = showModal('Confirmar', content, { onClose: () => resolve(false) });
    content.querySelector('[data-act="cancel"]').onclick = () => close();
    content.querySelector('[data-act="ok"]').onclick = () => { resolve(true); close(); };
  });
}

/* ---------- Gráfica de líneas SVG ---------- */
/**
 * Genera un SVG de gráfica de líneas.
 * points: [{ x: label, y: number }]
 */
export function lineChart(points, { unit = '', height = 180 } = {}) {
  if (!points || points.length === 0) {
    return '<div class="empty"><p>Sin datos suficientes.</p></div>';
  }
  const W = 320, H = height;
  const padL = 38, padR = 12, padT = 16, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const ys = points.map((p) => p.y);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) { min = min - 1; max = max + 1; }
  const range = max - min;

  const n = points.length;
  const xAt = (i) => padL + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const yAt = (v) => padT + innerH - ((v - min) / range) * innerH;

  // Líneas de cuadrícula y etiquetas Y (3 niveles)
  let grid = '';
  for (let k = 0; k <= 2; k++) {
    const v = min + (range * k) / 2;
    const y = yAt(v);
    grid += `<line class="chart-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="chart-axis-label" x="4" y="${(y + 3).toFixed(1)}">${fmtNum(round(v, 1))}</text>`;
  }

  const linePts = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(' ');
  const areaPts = `${padL},${padT + innerH} ${linePts} ${(W - padR)},${padT + innerH}`;

  const dots = points.map((p, i) =>
    `<circle class="chart-dot" cx="${xAt(i).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="3"/>`).join('');

  // Etiquetas X: primera, media y última para no saturar
  const idxs = n <= 4 ? points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const xLabels = idxs.map((i) => {
    const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
    return `<text class="chart-axis-label" x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(points[i].x)}</text>`;
  }).join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfica de progreso">
        ${grid}
        <polygon class="chart-area" points="${areaPts}"/>
        <polyline class="chart-line" points="${linePts}"/>
        ${dots}
        ${xLabels}
      </svg>
    </div>`;
}

/* ---------- Gráfica de barras SVG ---------- */
/**
 * Genera un SVG de gráfica de barras. El eje Y siempre parte de 0.
 * points: [{ x: label, y: number }]
 */
export function barChart(points, { height = 160 } = {}) {
  if (!points || points.length === 0) {
    return '<div class="empty"><p>Sin datos suficientes.</p></div>';
  }
  const W = 320, H = height;
  const padL = 30, padR = 12, padT = 16, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(...points.map((p) => p.y), 1);
  const n = points.length;
  const slot = innerW / n;
  const barW = Math.max(2, Math.min(26, slot * 0.7));

  // Líneas de cuadrícula y etiquetas Y (3 niveles)
  let grid = '';
  for (let k = 0; k <= 2; k++) {
    const v = (max * k) / 2;
    const y = padT + innerH - (v / max) * innerH;
    grid += `<line class="chart-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="chart-axis-label" x="4" y="${(y + 3).toFixed(1)}">${fmtNum(round(v, 1))}</text>`;
  }

  const bars = points.map((p, i) => {
    const h = (p.y / max) * innerH;
    const x = padL + slot * i + (slot - barW) / 2;
    const y = padT + innerH - h;
    if (p.y <= 0) return '';
    return `<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 2).toFixed(1)}" rx="2"/>`;
  }).join('');

  // Etiquetas X: primera, media y última para no saturar
  const idxs = n <= 4 ? points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const xLabels = idxs.map((i) => {
    const cx = padL + slot * i + slot / 2;
    const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
    const x = i === 0 ? padL : (i === n - 1 ? W - padR : cx);
    return `<text class="chart-axis-label" x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(points[i].x)}</text>`;
  }).join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfica de barras">
        ${grid}
        ${bars}
        ${xLabels}
      </svg>
    </div>`;
}

/* ---------- Imágenes ---------- */
/**
 * Comprime una imagen (File/Blob) reescalándola con un canvas y reencodándola a JPEG.
 * Limita el lado largo a `maxEdge` (sin ampliar) y devuelve `{ dataUrl, w, h }`.
 * Reencodear vía canvas también normaliza la orientación EXIF y convierte HEIC (iOS)
 * a JPEG. Procesa de una en una para no disparar la memoria en móvil.
 */
export function compressImage(file, { maxEdge = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || '')) { reject(new Error('No es una imagen')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) throw new Error('Imagen vacía');
        const scale = Math.min(1, maxEdge / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), w: cw, h: ch });
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')); };
    img.src = url;
  });
}

/* ---------- Visor de fotos a pantalla completa (lightbox) ---------- */
/**
 * Abre un visor a pantalla completa para una lista de fotos `[{ dataUrl }]`.
 * Permite navegar entre ellas (flechas, teclado y deslizar) y cerrar (✕, fondo, Esc).
 */
export function openLightbox(photos, startIndex = 0) {
  if (!Array.isArray(photos) || !photos.length) return;
  let idx = Math.max(0, Math.min(startIndex, photos.length - 1));
  const single = photos.length <= 1;

  const overlay = el('<div class="lightbox" role="dialog" aria-modal="true" aria-label="Visor de fotos"></div>');
  const imgWrap = el('<div class="lb-img-wrap"></div>');
  const img = document.createElement('img');
  img.className = 'lb-img';
  img.alt = 'Foto del ejercicio';
  imgWrap.appendChild(img);

  const closeBtn = el('<button class="lb-btn lb-close" type="button" aria-label="Cerrar">✕</button>');
  closeBtn.onclick = close;

  function paint() { img.src = photos[idx].dataUrl; if (counter) counter.textContent = `${idx + 1} / ${photos.length}`; }
  function go(d) { idx = (idx + d + photos.length) % photos.length; paint(); }
  function close() { overlay.remove(); document.removeEventListener('keydown', onKey, true); }
  // Captura el evento y detiene su propagación para que, si el visor se abrió sobre un modal
  // (p. ej. el editor de ejercicios), Esc/flechas no lleguen también al modal de debajo.
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (!single && e.key === 'ArrowLeft') { e.stopPropagation(); go(-1); }
    else if (!single && e.key === 'ArrowRight') { e.stopPropagation(); go(1); }
  }

  let counter = null;
  overlay.appendChild(closeBtn);
  overlay.appendChild(imgWrap);
  if (!single) {
    const prevBtn = el('<button class="lb-btn lb-prev" type="button" aria-label="Anterior">‹</button>');
    const nextBtn = el('<button class="lb-btn lb-next" type="button" aria-label="Siguiente">›</button>');
    counter = el('<div class="lb-counter"></div>');
    prevBtn.onclick = () => go(-1);
    nextBtn.onclick = () => go(1);
    overlay.appendChild(prevBtn);
    overlay.appendChild(nextBtn);
    overlay.appendChild(counter);
  }

  // Cerrar al tocar el fondo (no la imagen). Deslizar para cambiar de foto.
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target === imgWrap) close(); });
  let sx = null;
  overlay.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (!single && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  });

  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  paint();
}
