/* ============================================================
   accent.js — Color de acento de la app.
   Cambia el color primario (botones, dot del título, gráficas,
   barras…). Los tonos concretos de cada acento (claro/oscuro)
   viven en css/styles.css como :root[data-accent="…"].
   Se persiste en localStorage y se aplica como atributo
   data-accent en <html> (sin parpadeo: ver script de <head>).
   ============================================================ */

const KEY = 'gt-accent';

/* Paleta predefinida. `swatch` es el color de muestra para el selector
   (se usa el tono vivo del tema oscuro, se ve bien en ambos temas). */
export const ACCENTS = [
  { id: 'blue', name: 'Azul', swatch: '#4f8cff' },
  { id: 'green', name: 'Verde', swatch: '#35c26b' },
  { id: 'teal', name: 'Turquesa', swatch: '#22c7bb' },
  { id: 'violet', name: 'Morado', swatch: '#9b6dff' },
  { id: 'pink', name: 'Rosa', swatch: '#ff6cae' },
  { id: 'orange', name: 'Naranja', swatch: '#ff924d' },
];

export function getAccent() {
  const v = localStorage.getItem(KEY);
  return ACCENTS.some((a) => a.id === v) ? v : 'blue';
}

export function setAccent(id) {
  const v = ACCENTS.some((a) => a.id === id) ? id : 'blue';
  localStorage.setItem(KEY, v);
  document.documentElement.setAttribute('data-accent', v);
  return v;
}
