/* ============================================================
   app.js — Punto de entrada.
   Inicializa tema, router, vistas, cabecera, tabbar y el
   service worker. Orquesta el renderizado de cada vista.
   ============================================================ */

import { route, setNotFound, startRouter, navigate, getCurrentRoute } from './router.js';
import { qs, qsa, el, esc } from './utils.js';
import { setTheme, getTheme } from './theme.js';
import { setAccent, getAccent } from './accent.js';
import * as store from './store.js';

// Vistas
import { home } from './views/home.js';
import { session, sessionSummary, editSession } from './views/session.js';
import { exercises } from './views/exercises.js';
import { exerciseHistory } from './views/exercise-history.js';
import { groups } from './views/groups.js';
import { reports } from './views/reports.js';
import { goals } from './views/goals.js';
import { planner } from './views/planner.js';
import { achievements } from './views/achievements.js';
import { calendar } from './views/calendar.js';
import { weight } from './views/weight.js';
import { calculator } from './views/calculator.js';
import { settings } from './views/settings.js';
import { changelog } from './views/changelog.js';

const viewHost = qs('#view');
const titleEl = qs('#app-title');
const backBtn = qs('#back-btn');

let backTarget = false; // ruta de retroceso o false

/** Renderiza el resultado de una vista en el DOM. */
async function renderView(producer, ctx) {
  viewHost.innerHTML = '<div class="spinner"></div>';
  try {
    const result = await producer(ctx);
    titleEl.textContent = result.title || 'Gym Tracker';
    backTarget = result.back || false;
    backBtn.hidden = !backTarget;
    viewHost.innerHTML = '';
    viewHost.appendChild(result.node);
  } catch (err) {
    console.error(err);
    viewHost.innerHTML = '';
    viewHost.appendChild(el('<div class="empty"><p>Algo salió mal.</p><p class="faint">' + esc(err?.message || '') + '</p></div>'));
  }
}

/** Marca la pestaña activa de la tabbar. */
function syncTabbar() {
  const cur = getCurrentRoute() || '#/';
  qsa('.tab').forEach((tab) => {
    const r = tab.dataset.route;
    let active = false;
    if (r === '#/') active = cur === '#/' || cur.startsWith('#/session');
    else if (r === '#/settings') active = cur === '#/settings' || ['#/exercises', '#/groups', '#/weight', '#/calculator', '#/changelog'].includes(cur);
    else active = cur === r;
    tab.classList.toggle('active', active);
  });
}

/* ---------------- Rutas ---------------- */
route('/', (ctx) => renderView(home, ctx));
route('/session/:id', (ctx) => renderView(session, ctx));
route('/session/:id/summary', (ctx) => renderView(sessionSummary, ctx));
route('/session/:id/edit', (ctx) => renderView(editSession, ctx));
route('/exercises', (ctx) => renderView(exercises, ctx));
route('/exercise/:id/history', (ctx) => renderView(exerciseHistory, ctx));
route('/groups', (ctx) => renderView(groups, ctx));
route('/reports', (ctx) => renderView(reports, ctx));
route('/goals', (ctx) => renderView(goals, ctx));
route('/planner', (ctx) => renderView(planner, ctx));
route('/achievements', (ctx) => renderView(achievements, ctx));
route('/calendar', (ctx) => renderView(calendar, ctx));
route('/weight', (ctx) => renderView(weight, ctx));
route('/calculator', (ctx) => renderView(calculator, ctx));
route('/settings', (ctx) => renderView(settings, ctx));
route('/changelog', (ctx) => renderView(changelog, ctx));
setNotFound((ctx) => renderView(async () => ({
  title: 'No encontrado', back: '#/',
  node: el('<div class="empty"><p>Página no encontrada.</p></div>'),
}), ctx));

window.addEventListener('route:changed', syncTabbar);

/* ---------------- Cabecera ---------------- */
backBtn.onclick = () => {
  if (typeof backTarget === 'string') navigate(backTarget);
  else history.back();
};

/* ---------------- Service Worker ---------------- */
let _swRefreshing = false;
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // Ruta relativa para funcionar bajo subdirectorios (GitHub Pages).
  const swUrl = new URL('./service-worker.js', window.location.href);

  // Cuando un SW nuevo toma el control, recarga una vez para que la página
  // use los recursos recién cacheados (evita quedarse en la versión vieja tras
  // desplegar). En la primera instalación no había SW antes → no recargamos.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || _swRefreshing) return;
    _swRefreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register(swUrl.pathname).then((reg) => {
    // Comprueba si hay versión nueva al arrancar y cada vez que la app vuelve
    // a primer plano (reabrir la PWA en el móvil dispara la comprobación).
    reg.update();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update();
    });
  }).catch((e) => console.warn('SW no registrado', e));
}

/* ---------------- Almacenamiento persistente ----------------
   Marca los datos como "no desalojables" por el navegador (clave en iOS/Safari, que
   puede borrar IndexedDB de PWAs poco usadas). Silencioso; algunos navegadores lo
   conceden por heurística (app instalada, uso frecuente…). */
function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted()
        .then((p) => { if (!p) navigator.storage.persist(); })
        .catch(() => {});
    }
  } catch (e) { /* ignorar */ }
}

/* ---------------- Arranque ---------------- */
async function init() {
  setTheme(getTheme());
  setAccent(getAccent());
  requestPersistentStorage();
  await store.seedIfEmpty();
  await store.migrate();
  await store.seedAchievementBaseline(); // base para avisar de logros nuevos
  startRouter();
  syncTabbar();
  registerSW();
}

init();
