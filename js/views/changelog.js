/* ============================================================
   changelog.js — Registro de cambios (Novedades).
   Lee CHANGELOG.md (Keep a Changelog, en español) y lo renderiza
   dentro de la app. Es la única fuente de verdad: para actualizar
   las novedades basta con editar CHANGELOG.md.
   ============================================================ */

import { el, esc, fmtDate } from '../utils.js';

// Icono por tipo de cambio (encabezados ### del changelog).
const CAT_ICON = {
  'Añadido': '✨',
  'Cambiado': '🔧',
  'Obsoleto': '🗑️',
  'Eliminado': '🗑️',
  'Corregido': '🐛',
  'Seguridad': '🔒',
};

/* Formato en línea mínimo: **negrita**, `código`, *cursiva*, [texto](url)→texto.
   Se escapa primero el HTML; los marcadores markdown sobreviven y luego se
   convierten. (No es un parser general, solo cubre lo que usamos en el changelog.) */
function inline(s) {
  let h = esc(s);
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');     // enlaces → solo el texto
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');      // `código`
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); // **negrita** (antes que cursiva)
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');         // *cursiva*
  return h;
}

/* Separa "[1.1.0] - 2026-06-09" o "[Sin publicar]" en versión + fecha legible. */
function parseHeader(s) {
  const m = /^\[([^\]]+)\](?:\s*-\s*(.+))?$/.exec(s);
  if (!m) return { ver: s, date: '' };
  let date = '';
  if (m[2]) {
    const d = m[2].trim();
    date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDate(d) : d;
  }
  return { ver: m[1], date };
}

/* Convierte el texto markdown en una lista de versiones con sus secciones. */
function parseChangelog(md) {
  const versions = [];
  let ver = null, sec = null, item = null;
  const pushItem = () => { if (item != null && sec) { sec.items.push(item.trim()); } item = null; };

  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (line.startsWith('## ')) {                       // versión
      pushItem();
      const { ver: v, date } = parseHeader(line.slice(3).trim());
      ver = { ver: v, date, sections: [] };
      versions.push(ver);
      sec = null;
    } else if (line.startsWith('### ')) {               // categoría
      pushItem();
      if (!ver) continue;
      sec = { name: line.slice(4).trim(), items: [] };
      ver.sections.push(sec);
    } else if (line.startsWith('# ')) {                 // título del documento → ignorar
      continue;
    } else if (/^\s*-\s+/.test(line)) {                 // nuevo ítem de lista
      pushItem();
      item = line.replace(/^\s*-\s+/, '');
    } else if (item != null && line.trim() !== '') {    // continuación del ítem (sangría)
      item += ' ' + line.trim();
    } else if (line.trim() === '') {                    // línea en blanco → cierra el ítem
      pushItem();
    }
  }
  pushItem();
  return versions.filter((v) => v.sections.length); // descarta versiones vacías (p. ej. "Sin publicar")
}

function versionCard(v) {
  const secs = v.sections.map((sec) => {
    const items = sec.items.map((it) => `<li>${inline(it)}</li>`).join('');
    return `<div class="cl-sec"><div class="cl-sec-name">${CAT_ICON[sec.name] || '•'} ${esc(sec.name)}</div><ul class="cl-list">${items}</ul></div>`;
  }).join('');
  const date = v.date ? `<span class="cl-date muted">${esc(v.date)}</span>` : '';
  return `<div class="card cl-version"><div class="cl-head"><span class="cl-ver">${esc(v.ver)}</span>${date}</div>${secs}</div>`;
}

export async function changelog() {
  const node = el('<div></div>');

  let md;
  try {
    const res = await fetch(new URL('./CHANGELOG.md', window.location.href));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    md = await res.text();
  } catch (e) {
    node.appendChild(el('<div class="empty"><p>No se pudo cargar el registro de cambios.</p><p class="faint">Comprueba tu conexión.</p></div>'));
    return { title: 'Novedades', back: '#/settings', node };
  }

  const versions = parseChangelog(md);
  if (!versions.length) {
    node.appendChild(el('<div class="empty"><p>Sin cambios registrados.</p></div>'));
    return { title: 'Novedades', back: '#/settings', node };
  }

  node.appendChild(el('<p class="muted" style="margin-top:0">Historial de cambios de Gym Tracker.</p>'));
  for (const v of versions) node.appendChild(el(versionCard(v)));

  return { title: 'Novedades', back: '#/settings', node };
}
