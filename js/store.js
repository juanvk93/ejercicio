/* ============================================================
   store.js — Lógica de dominio sobre la BBDD.
   Maneja ejercicios, grupos, sesiones y peso corporal,
   además de cálculos de estadísticas y progresión.
   ============================================================ */

import * as db from './db.js';
import { STORES } from './db.js';
import { uid, num, round } from './utils.js';

/* ---------------- Ejercicios ---------------- */
export async function listExercises() {
  const all = await db.getAll(STORES.EXERCISES);
  return all.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
export function getExercise(id) { return db.get(STORES.EXERCISES, id); }

export function saveExercise({ id, name, tags = [], unilateral = false, notes = '' }) {
  const ex = {
    id: id || uid(),
    name: name.trim(),
    tags: (tags || []).map((t) => String(t).trim()).filter(Boolean),
    unilateral: !!unilateral, // un brazo/pierna cada vez → el volumen cuenta el doble
    notes: notes.trim(),
    updatedAt: Date.now(),
  };
  return db.put(STORES.EXERCISES, ex);
}

/** Etiquetas (grupos musculares) de un ejercicio, con compatibilidad con datos antiguos. */
export function exerciseTags(ex) {
  if (Array.isArray(ex?.tags)) return ex.tags;
  if (ex?.muscle) return [ex.muscle];
  return [];
}

/** Todas las etiquetas existentes, ordenadas. */
export async function allTags() {
  const exs = await db.getAll(STORES.EXERCISES);
  const set = new Set();
  for (const e of exs) for (const t of exerciseTags(e)) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Migra datos antiguos: `muscle` (texto) → `tags` (array); elimina `unit` por ejercicio. */
export async function migrate() {
  const exs = await db.getAll(STORES.EXERCISES);
  for (const e of exs) {
    if (!Array.isArray(e.tags)) {
      e.tags = e.muscle ? [e.muscle] : [];
      delete e.muscle;
      delete e.unit;
      await db.put(STORES.EXERCISES, e);
    }
  }
}

export async function deleteExercise(id) {
  // Lo quitamos también de cualquier grupo que lo referencie.
  const groups = await db.getAll(STORES.GROUPS);
  await Promise.all(
    groups
      .filter((g) => g.exerciseIds.includes(id))
      .map((g) => db.put(STORES.GROUPS, { ...g, exerciseIds: g.exerciseIds.filter((x) => x !== id) }))
  );
  return db.remove(STORES.EXERCISES, id);
}

/* ---------------- Grupos de ejercicios ---------------- */
export async function listGroups() {
  const all = await db.getAll(STORES.GROUPS);
  return all.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
export function getGroup(id) { return db.get(STORES.GROUPS, id); }

export function saveGroup({ id, name, exerciseIds = [] }) {
  const g = { id: id || uid(), name: name.trim(), exerciseIds, updatedAt: Date.now() };
  return db.put(STORES.GROUPS, g);
}
export function deleteGroup(id) { return db.remove(STORES.GROUPS, id); }

/* ---------------- Sesiones ---------------- */
export async function listSessions() {
  const all = await db.getAll(STORES.SESSIONS);
  return all.sort((a, b) => b.startedAt - a.startedAt);
}
export function getSession(id) { return db.get(STORES.SESSIONS, id); }
export function saveSession(session) { return db.put(STORES.SESSIONS, session); }
export function deleteSession(id) { return db.remove(STORES.SESSIONS, id); }

export async function getActiveSession() {
  const active = await db.getSessionsByStatus('active');
  return active.sort((a, b) => b.startedAt - a.startedAt)[0] || null;
}

/**
 * Busca el último registro (sesión finalizada) de un ejercicio para
 * sugerir series/reps/peso de "la última vez".
 */
export async function getLastExerciseRecord(exerciseId, excludeSessionId = null) {
  const sessions = await listSessions();
  for (const s of sessions) {
    if (s.id === excludeSessionId) continue;
    if (s.status !== 'finished') continue;
    const found = (s.exercises || []).find((e) => e.exerciseId === exerciseId);
    if (found && found.sets && found.sets.length) {
      return { date: s.startedAt, sets: found.sets.map((st) => ({ reps: st.reps, weight: st.weight })) };
    }
  }
  return null;
}

/**
 * Construye los objetos "ejercicio de sesión" para una lista de ids,
 * sin duplicados (respetando `existingIds`) y precargando las series de la
 * última vez para cada uno.
 */
export async function buildSessionExercises(exerciseIds, existingIds = new Set()) {
  const result = [];
  for (const exId of exerciseIds) {
    if (existingIds.has(exId)) continue;
    existingIds.add(exId);
    const ex = await getExercise(exId);
    if (!ex) continue;
    const last = await getLastExerciseRecord(exId);
    // Series iniciales: copia de la última vez, o una serie vacía.
    const baseSets = last && last.sets.length
      ? last.sets.map((s) => ({ reps: s.reps, weight: s.weight, done: false }))
      : [{ reps: 0, weight: 0, done: false }];
    result.push({
      exerciseId: exId,
      name: ex.name,
      unilateral: !!ex.unilateral,
      previous: last ? { date: last.date, sets: last.sets } : null,
      sets: baseSets,
    });
  }
  return result;
}

/**
 * Crea (sin guardar todavía) una nueva sesión a partir de uno o varios grupos,
 * combinando sus ejercicios sin duplicados. `opts.startedAt` permite definir día/hora.
 */
export async function buildNewSession(groups, opts = {}) {
  const groupList = Array.isArray(groups) ? groups : [groups];
  const exerciseIds = [];
  for (const g of groupList) for (const id of (g.exerciseIds || [])) exerciseIds.push(id);

  const exercises = await buildSessionExercises(exerciseIds);

  return {
    id: uid(),
    groupIds: groupList.map((g) => g.id),
    groupName: groupList.map((g) => g.name).join(' + '),
    status: 'active',
    startedAt: opts.startedAt || Date.now(),
    finishedAt: null,
    exercises,
  };
}

/**
 * Añade los ejercicios de uno o varios grupos a una sesión en curso,
 * sin duplicar los que ya están. Guarda y devuelve cuántos se añadieron.
 */
export async function addGroupsToSession(session, groups) {
  const groupList = Array.isArray(groups) ? groups : [groups];
  const existing = new Set((session.exercises || []).map((e) => e.exerciseId));
  const ids = [];
  for (const g of groupList) for (const id of (g.exerciseIds || [])) ids.push(id);

  const added = await buildSessionExercises(ids, existing);
  session.exercises = [...(session.exercises || []), ...added];

  // Actualiza la lista de grupos y el nombre combinado.
  const groupIds = [...new Set([...(session.groupIds || []), ...groupList.map((g) => g.id)])];
  session.groupIds = groupIds;
  const names = session.groupName ? session.groupName.split(' + ') : [];
  for (const g of groupList) if (!names.includes(g.name)) names.push(g.name);
  session.groupName = names.join(' + ');

  await saveSession(session);
  return added.length;
}

/* ---------------- Peso corporal ---------------- */
export async function listBodyweight() {
  const all = await db.getAll(STORES.BODYWEIGHT);
  return all.sort((a, b) => a.date.localeCompare(b.date));
}
export function saveBodyweight({ id, date, weight }) {
  const r = { id: id || uid(), date, weight: round(num(weight), 2) };
  return db.put(STORES.BODYWEIGHT, r);
}
export function deleteBodyweight(id) { return db.remove(STORES.BODYWEIGHT, id); }

/* ---------------- Estadísticas ---------------- */

/** Estadísticas de una única sesión. */
export function sessionStats(session) {
  let totalSets = 0, totalReps = 0, totalVolume = 0;
  const perExercise = [];
  for (const ex of session.exercises || []) {
    // Unilateral: se hace con ambos lados, así que el volumen cuenta el doble.
    const factor = ex.unilateral ? 2 : 1;
    const counted = (ex.sets || []).filter((s) => num(s.reps) > 0 || num(s.weight) > 0);
    let vol = 0, reps = 0, topWeight = 0;
    for (const s of counted) {
      const r = num(s.reps), w = num(s.weight);
      vol += r * w * factor;
      reps += r;
      if (w > topWeight) topWeight = w;
    }
    totalSets += counted.length;
    totalReps += reps;
    totalVolume += vol;
    perExercise.push({
      name: ex.name, unilateral: !!ex.unilateral,
      sets: counted.length, reps, volume: round(vol, 1), topWeight: round(topWeight, 1),
    });
  }
  const duration = session.finishedAt && session.startedAt ? session.finishedAt - session.startedAt : 0;
  return {
    totalSets, totalReps, totalVolume: round(totalVolume, 1), duration,
    exerciseCount: perExercise.length, perExercise,
  };
}

/** Serie temporal de un ejercicio a lo largo de las sesiones finalizadas. */
export async function exerciseProgress(exerciseId) {
  const sessions = (await listSessions()).filter((s) => s.status === 'finished').reverse();
  const series = [];
  for (const s of sessions) {
    const ex = (s.exercises || []).find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const counted = (ex.sets || []).filter((st) => num(st.reps) > 0 || num(st.weight) > 0);
    if (!counted.length) continue;
    const factor = ex.unilateral ? 2 : 1;
    let vol = 0, top = 0;
    for (const st of counted) {
      vol += num(st.reps) * num(st.weight) * factor;
      if (num(st.weight) > top) top = num(st.weight);
    }
    series.push({ date: s.startedAt, volume: round(vol, 1), topWeight: round(top, 1) });
  }
  return series;
}

/** Resumen global para la pantalla de informes. */
export async function globalStats() {
  const sessions = (await listSessions()).filter((s) => s.status === 'finished');
  let totalVolume = 0, totalSets = 0, totalReps = 0;
  const volumeByDate = [];
  for (const s of sessions.slice().reverse()) {
    const st = sessionStats(s);
    totalVolume += st.totalVolume;
    totalSets += st.totalSets;
    totalReps += st.totalReps;
    volumeByDate.push({ date: s.startedAt, volume: st.totalVolume });
  }
  return {
    sessionCount: sessions.length,
    totalVolume: round(totalVolume, 1),
    totalSets, totalReps,
    volumeByDate,
  };
}

/* ---------------- Datos de ejemplo (semilla) ---------------- */
export async function seedIfEmpty() {
  const ex = await db.getAll(STORES.EXERCISES);
  if (ex.length) return false;

  const defs = [
    { name: 'Curl de bíceps con mancuerna', tags: ['Bíceps'] },
    { name: 'Curl en polea', tags: ['Bíceps'] },
    { name: 'Curl martillo', tags: ['Bíceps', 'Antebrazo'] },
    { name: 'Jalón al pecho', tags: ['Espalda'] },
    { name: 'Remo con barra', tags: ['Espalda'] },
    { name: 'Remo en polea', tags: ['Espalda'] },
    { name: 'Press de banca', tags: ['Pecho'] },
    { name: 'Aperturas con mancuerna', tags: ['Pecho'] },
    { name: 'Sentadilla', tags: ['Pierna'] },
    { name: 'Prensa de pierna', tags: ['Pierna'] },
  ];
  const created = [];
  for (const d of defs) {
    created.push(await saveExercise({ name: d.name, tags: d.tags }));
  }
  const byTag = (t) => created.filter((c) => (c.tags || []).includes(t)).map((c) => c.id);

  await saveGroup({ name: 'Bíceps y Espalda', exerciseIds: [...byTag('Bíceps'), ...byTag('Espalda')] });
  await saveGroup({ name: 'Pecho', exerciseIds: byTag('Pecho') });
  await saveGroup({ name: 'Pierna', exerciseIds: byTag('Pierna') });
  return true;
}
