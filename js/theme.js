/* ============================================================
   theme.js — Gestión del tema (oscuro por defecto / claro).
   Persiste en localStorage y sincroniza la meta theme-color.
   ============================================================ */

const KEY = 'gt-theme';

export function getTheme() {
  return localStorage.getItem(KEY) || 'dark';
}

export function setTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  localStorage.setItem(KEY, t);
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0f1115' : '#f4f6fb');
  updateThemeIcon(t);
  return t;
}

export function toggleTheme() {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/** Dibuja el icono sol/luna según el tema actual. */
export function updateThemeIcon(theme = getTheme()) {
  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  if (theme === 'dark') {
    // Luna
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  } else {
    // Sol
    icon.innerHTML = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  }
}
