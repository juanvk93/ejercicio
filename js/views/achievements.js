/* ============================================================
   achievements.js — Logros / medallas.
   Hitos de sesiones, rachas, volumen total y récords.
   ============================================================ */

import { el, esc } from '../utils.js';
import * as store from '../store.js';

export async function achievements() {
  const node = el('<div></div>');
  const list = await store.achievements();
  const unlocked = list.filter((a) => a.unlocked).length;

  node.appendChild(el(`
    <div class="card center">
      <div style="font-size:34px;line-height:1">🏅</div>
      <div style="font-weight:800;font-size:22px;margin-top:6px">${unlocked} / ${list.length}</div>
      <div class="muted">logros desbloqueados</div>
    </div>`));

  const wrap = el('<div class="mt"></div>');
  for (const a of list) {
    const card = el(`
      <div class="card${a.unlocked ? '' : ' ach-locked'}" style="margin-bottom:10px">
        <div class="row" style="gap:14px">
          <span class="av av-lg" style="font-size:22px">${a.icon}</span>
          <div class="grow">
            <div class="title" style="font-weight:700">${esc(a.title)}${a.unlocked ? ' <span class="badge" style="background:var(--success);color:#fff">✓</span>' : ''}</div>
            <div class="sub muted">${esc(a.desc)}</div>
            ${a.unlocked ? '' : `<div class="bar-track" style="height:6px;margin-top:8px"><div class="bar-fill" style="width:${Math.max(2, a.pct)}%"></div></div>`}
          </div>
        </div>
      </div>`);
    wrap.appendChild(card);
  }
  node.appendChild(wrap);

  return { title: 'Logros', back: '#/settings', node };
}
