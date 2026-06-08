/* ============================================================
   achievements.js — Logros / medallas.
   Hitos de constancia, volumen, esfuerzo, fuerza, dedicación,
   variedad y hábitos. Agrupados por categoría.
   ============================================================ */

import { el, esc } from '../utils.js';
import * as store from '../store.js';

/* Número legible para la línea de progreso: separadores de miles en es-ES. */
function fmtBig(n) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

/* Icono representativo de cada categoría (para el título de sección). */
const CAT_ICON = {
  Constancia: '🔥',
  Volumen: '🏋️',
  Esfuerzo: '🔁',
  Fuerza: '💪',
  Dedicación: '⏱️',
  Variedad: '🧭',
  Hábitos: '🌙',
};

export async function achievements() {
  const node = el('<div></div>');
  const list = await store.achievements();
  const unlocked = list.filter((a) => a.unlocked).length;
  const pctTotal = list.length ? Math.round((unlocked / list.length) * 100) : 0;

  // Cabecera-resumen con progreso global.
  node.appendChild(el(`
    <div class="card center">
      <div style="font-size:34px;line-height:1">🏅</div>
      <div style="font-weight:800;font-size:22px;margin-top:6px">${unlocked} / ${list.length}</div>
      <div class="muted">logros desbloqueados</div>
      <div class="bar-track" style="height:8px;margin-top:12px"><div class="bar-fill" style="width:${Math.max(2, pctTotal)}%"></div></div>
    </div>`));

  // Agrupa por categoría conservando el orden del catálogo.
  const groups = [];
  for (const a of list) {
    let g = groups.find((x) => x.cat === a.cat);
    if (!g) { g = { cat: a.cat, items: [] }; groups.push(g); }
    g.items.push(a);
  }

  for (const g of groups) {
    const done = g.items.filter((a) => a.unlocked).length;
    node.appendChild(el(
      `<div class="section-title">${CAT_ICON[g.cat] || '🏅'} ${esc(g.cat)} · ${done}/${g.items.length}</div>`));

    const wrap = el('<div></div>');
    for (const a of g.items) {
      const card = el(`
        <div class="card${a.unlocked ? ' ach-unlocked' : ' ach-locked'}" style="margin-bottom:10px">
          <div class="row" style="gap:14px">
            <span class="av av-lg" style="font-size:22px">${a.icon}</span>
            <div class="grow">
              <div class="title" style="font-weight:700">${esc(a.title)}${a.unlocked ? ' <span class="badge" style="background:var(--success);color:#fff">✓</span>' : ''}</div>
              <div class="sub muted">${esc(a.desc)}</div>
              ${a.unlocked ? '' : `
                <div class="row between muted" style="font-size:12px;margin-top:8px">
                  <span>${fmtBig(a.value)} / ${fmtBig(a.target)}${a.suffix ? ' ' + esc(a.suffix) : ''}</span>
                  <span>${a.pct}%</span>
                </div>
                <div class="bar-track" style="height:6px;margin-top:5px"><div class="bar-fill" style="width:${Math.max(2, a.pct)}%"></div></div>`}
            </div>
          </div>
        </div>`);
      wrap.appendChild(card);
    }
    node.appendChild(wrap);
  }

  return { title: 'Logros', back: '#/settings', node };
}
