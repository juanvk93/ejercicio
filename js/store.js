/* ============================================================
   store.js — Lógica de dominio sobre la BBDD.
   Maneja ejercicios, grupos, sesiones y peso corporal,
   además de cálculos de estadísticas y progresión.
   ============================================================ */

import * as db from './db.js';
import { STORES } from './db.js';
import { uid, num, round } from './utils.js';
import { unitLabel } from './prefs.js';

/* ---------------- Ejercicios ---------------- */
export async function listExercises() {
  const all = await db.getAll(STORES.EXERCISES);
  return all.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
export function getExercise(id) { return db.get(STORES.EXERCISES, id); }

export function saveExercise({ id, name, tags = [], unilateral = false, notes = '', movement = '' }) {
  const ex = {
    id: id || uid(),
    name: name.trim(),
    tags: (tags || []).map((t) => String(t).trim()).filter(Boolean),
    unilateral: !!unilateral, // un brazo/pierna cada vez → el volumen cuenta el doble
    movement: ['push', 'pull', 'legs'].includes(movement) ? movement : '', // para el equilibrio muscular
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

/** Patrón de movimiento del ejercicio: 'push' | 'pull' | 'legs' | '' (sin clasificar). */
export function exerciseMovement(ex) {
  return ['push', 'pull', 'legs'].includes(ex?.movement) ? ex.movement : '';
}

/** Todas las etiquetas existentes, ordenadas. */
export async function allTags() {
  const exs = await db.getAll(STORES.EXERCISES);
  const set = new Set();
  for (const e of exs) for (const t of exerciseTags(e)) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Migra datos antiguos: `muscle` (texto) → `tags` (array); elimina `unit` por ejercicio;
 * y siembra el patrón de movimiento (`movement`) inferido de las etiquetas la primera vez
 * (el usuario lo corrige luego en el ejercicio).
 */
export async function migrate() {
  const exs = await db.getAll(STORES.EXERCISES);
  for (const e of exs) {
    let changed = false;
    if (!Array.isArray(e.tags)) {
      e.tags = e.muscle ? [e.muscle] : [];
      delete e.muscle;
      delete e.unit;
      changed = true;
    }
    if (e.movement === undefined) { e.movement = inferMovement(exerciseTags(e)); changed = true; }
    if (changed) await db.put(STORES.EXERCISES, e);
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

/* ---------------- Planificación semanal ---------------- */
const PLANNER_ID = 'week';
/** Índice de día de la semana con lunes=0 … domingo=6 (hora local). */
function weekdayIndex(ts) { return (new Date(ts).getDay() + 6) % 7; }

/** Devuelve 7 arrays de ids de grupo (índice 0 = lunes). */
export async function getPlanner() {
  const rec = await db.get(STORES.PLANNER, PLANNER_ID);
  const days = rec && Array.isArray(rec.days) ? rec.days : [];
  return Array.from({ length: 7 }, (_, i) => (Array.isArray(days[i]) ? days[i] : []));
}
/** Guarda la planificación (7 arrays de ids de grupo). */
export function savePlanner(days) {
  const norm = Array.from({ length: 7 }, (_, i) => (Array.isArray(days[i]) ? days[i].filter(Boolean) : []));
  return db.put(STORES.PLANNER, { id: PLANNER_ID, days: norm });
}
/** Grupos planificados para hoy (objetos de grupo existentes, en orden). */
export async function todayPlannedGroups() {
  const days = await getPlanner();
  const ids = days[weekdayIndex(Date.now())] || [];
  if (!ids.length) return [];
  const byId = new Map((await listGroups()).map((g) => [g.id, g]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

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
      return { date: s.startedAt, sets: found.sets.map((st) => ({ reps: st.reps, weight: st.weight, type: st.type })) };
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
      ? last.sets.map((s) => ({ reps: s.reps, weight: s.weight, ...(s.type ? { type: s.type } : {}), done: false }))
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
 * Crea (sin guardar) una nueva sesión activa a partir de una sesión pasada:
 * repite los mismos ejercicios (en orden) precargando la última vez de cada uno.
 * Conserva los grupos y el nombre; el temporizador se hereda si la pasada lo tenía.
 */
export async function buildSessionFromPast(pastSession, opts = {}) {
  const ids = (pastSession.exercises || []).map((e) => e.exerciseId).filter(Boolean);
  const exercises = await buildSessionExercises(ids);
  return {
    id: uid(),
    groupIds: [...(pastSession.groupIds || [])],
    groupName: pastSession.groupName || 'Entreno repetido',
    status: 'active',
    startedAt: opts.startedAt || Date.now(),
    finishedAt: null,
    restTimer: normalizeRestTimer(pastSession.restTimer),
    trackRpe: !!pastSession.trackRpe,
    exercises,
  };
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
    restTimer: normalizeRestTimer(opts.restTimer),
    trackRpe: !!opts.trackRpe,
    exercises,
  };
}

/** Normaliza la configuración del temporizador de descanso (mín. 5 s, 90 por defecto). */
function normalizeRestTimer(rt = {}) {
  return { enabled: !!rt.enabled, seconds: Math.max(5, Math.round(num(rt.seconds) || 90)) };
}

/**
 * Crea (sin guardar) una sesión libre/vacía: sin grupo y sin ejercicios. El usuario
 * añade ejercicios sobre la marcha con "+ Ejercicio"/"+ Grupo".
 */
export function buildEmptySession(opts = {}) {
  return {
    id: uid(),
    groupIds: [],
    groupName: opts.name || 'Sesión libre',
    status: 'active',
    startedAt: opts.startedAt || Date.now(),
    finishedAt: null,
    restTimer: normalizeRestTimer(opts.restTimer),
    trackRpe: !!opts.trackRpe,
    exercises: [],
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

/**
 * Añade ejercicios sueltos (por id) a una sesión en curso, sin duplicar.
 * No modifica los grupos de la sesión. Guarda y devuelve cuántos se añadieron.
 */
export async function addExercisesToSession(session, exerciseIds) {
  const existing = new Set((session.exercises || []).map((e) => e.exerciseId));
  const added = await buildSessionExercises(exerciseIds, existing);
  session.exercises = [...(session.exercises || []), ...added];
  await saveSession(session);
  return added.length;
}

/* ---------------- Peso corporal ---------------- */
export async function listBodyweight() {
  const all = await db.getAll(STORES.BODYWEIGHT);
  return all.sort((a, b) => a.date.localeCompare(b.date));
}
export async function saveBodyweight({ id, date, weight }) {
  // Un único registro por día: si ya hay uno en esa fecha, se actualiza (no se duplica).
  if (!id) {
    const existing = (await db.getAll(STORES.BODYWEIGHT)).find((r) => r.date === date);
    if (existing) id = existing.id;
  }
  const r = { id: id || uid(), date, weight: round(num(weight), 2) };
  return db.put(STORES.BODYWEIGHT, r);
}
export function deleteBodyweight(id) { return db.remove(STORES.BODYWEIGHT, id); }

/* ---------------- Medidas corporales ---------------- */
/** Tipos de medida sugeridos (además de los que el usuario haya creado). */
export const DEFAULT_MEASUREMENTS = ['Cintura', 'Pecho', 'Bíceps', 'Muslo', 'Cadera', 'Cuello', 'Gemelo'];

/** Registros de medidas (todas o de un tipo), ordenados por fecha. */
export async function listMeasurements(type = null) {
  const all = await db.getAll(STORES.MEASUREMENTS);
  const filtered = type ? all.filter((m) => m.type === type) : all;
  return filtered.sort((a, b) => a.date.localeCompare(b.date));
}
export async function saveMeasurement({ id, type, date, value }) {
  const t = String(type).trim();
  // Un único registro por tipo y día: si ya existe, se actualiza (no se duplica).
  if (!id) {
    const existing = (await db.getAll(STORES.MEASUREMENTS)).find((m) => m.type === t && m.date === date);
    if (existing) id = existing.id;
  }
  const r = { id: id || uid(), type: t, date, value: round(num(value), 2) };
  return db.put(STORES.MEASUREMENTS, r);
}
export function deleteMeasurement(id) { return db.remove(STORES.MEASUREMENTS, id); }

/** Tipos de medida existentes + sugeridos, ordenados. */
export async function measurementTypes() {
  const all = await db.getAll(STORES.MEASUREMENTS);
  const set = new Set(DEFAULT_MEASUREMENTS);
  for (const m of all) if (m.type) set.add(m.type);
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

/* ---------------- Objetivos / metas ---------------- */
export async function listGoals() {
  const all = await db.getAll(STORES.GOALS);
  return all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
export function saveGoal({ id, exerciseId, metric = 'topWeight', target, createdAt }) {
  const g = {
    id: id || uid(),
    exerciseId,
    metric: metric === 'est1RM' ? 'est1RM' : 'topWeight',
    target: round(num(target), 2),
    createdAt: createdAt || Date.now(), // se conserva al editar (se pasa el original)
  };
  return db.put(STORES.GOALS, g);
}
export function deleteGoal(id) { return db.remove(STORES.GOALS, id); }

/**
 * Progreso de cada objetivo: valor actual (mejor histórico del ejercicio según
 * la métrica), porcentaje y si ya se ha alcanzado. Reaprovecha personalRecords.
 */
export async function goalProgress() {
  const [goals, prs, exs] = await Promise.all([listGoals(), personalRecords(), db.getAll(STORES.EXERCISES)]);
  const prMap = new Map(prs.map((r) => [r.exerciseId, r]));
  const nameMap = new Map(exs.map((e) => [e.id, e.name]));
  return goals.map((g) => {
    const pr = prMap.get(g.exerciseId);
    const current = pr ? (g.metric === 'est1RM' ? pr.best1RM.value : pr.topWeight.weight) : 0;
    const pct = g.target > 0 ? Math.min(100, Math.round((current / g.target) * 100)) : 0;
    return {
      ...g,
      name: nameMap.get(g.exerciseId) || '(ejercicio borrado)',
      current: round(current, 1),
      pct,
      achieved: current >= g.target && g.target > 0,
    };
  });
}

/* ---------------- Estadísticas ---------------- */

/** Sesiones finalizadas, opcionalmente desde un timestamp (ms), de más reciente a más antigua. */
async function finishedSessions(since = null) {
  const sessions = (await listSessions()).filter((s) => s.status === 'finished');
  return since ? sessions.filter((s) => s.startedAt >= since) : sessions;
}

/**
 * 1RM estimado con la fórmula de Epley: peso × (1 + reps/30).
 * Para 1 repetición es el propio peso. Devuelve 0 si faltan datos.
 */
export function epley1RM(weight, reps) {
  const w = num(weight), r = num(reps);
  if (w <= 0 || r <= 0) return 0;
  return r === 1 ? w : round(w * (1 + r / 30), 1);
}

/**
 * Serie "de trabajo": tiene datos (reps o peso) y NO es de calentamiento. Las series de
 * calentamiento (`type:'warmup'`) no cuentan como volumen ni como serie efectiva en ningún
 * cálculo. Los tipos 'failure' (al fallo) y 'drop' sí cuentan como trabajo.
 */
function isWorkingSet(st) {
  return !!st && st.type !== 'warmup' && (num(st.reps) > 0 || num(st.weight) > 0);
}

/** Estadísticas de una única sesión. */
export function sessionStats(session) {
  let totalSets = 0, totalReps = 0, totalVolume = 0;
  let rpeSum = 0, rpeCount = 0;
  const perExercise = [];
  for (const ex of session.exercises || []) {
    // Unilateral: se hace con ambos lados, así que el volumen cuenta el doble.
    const factor = ex.unilateral ? 2 : 1;
    const counted = (ex.sets || []).filter(isWorkingSet);
    let vol = 0, reps = 0, topWeight = 0;
    for (const s of counted) {
      const r = num(s.reps), w = num(s.weight);
      vol += r * w * factor;
      reps += r;
      if (w > topWeight) topWeight = w;
      if (s.rpe != null && num(s.rpe) > 0) { rpeSum += num(s.rpe); rpeCount++; }
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
    avgRpe: rpeCount ? round(rpeSum / rpeCount, 1) : null,
    exerciseCount: perExercise.length, perExercise,
  };
}

/** Serie temporal de un ejercicio a lo largo de las sesiones finalizadas. */
export async function exerciseProgress(exerciseId, { since = null } = {}) {
  const sessions = (await finishedSessions(since)).reverse();
  const series = [];
  for (const s of sessions) {
    const ex = (s.exercises || []).find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const counted = (ex.sets || []).filter(isWorkingSet);
    if (!counted.length) continue;
    const factor = ex.unilateral ? 2 : 1;
    let vol = 0, top = 0, best1RM = 0;
    for (const st of counted) {
      vol += num(st.reps) * num(st.weight) * factor;
      if (num(st.weight) > top) top = num(st.weight);
      const rm = epley1RM(st.weight, st.reps);
      if (rm > best1RM) best1RM = rm;
    }
    series.push({ date: s.startedAt, volume: round(vol, 1), topWeight: round(top, 1), est1RM: round(best1RM, 1) });
  }
  return series;
}

/**
 * Historial completo de un ejercicio: cada sesión finalizada que lo contiene,
 * con sus series y estadísticas (volumen, peso máx y 1RM est.), de más reciente
 * a más antigua, más un resumen agregado.
 */
export async function exerciseHistory(exerciseId) {
  const sessions = (await finishedSessions()).sort((a, b) => b.startedAt - a.startedAt);
  const entries = [];
  let bestWeight = 0, best1RM = 0, totalVolume = 0, totalSets = 0;
  for (const s of sessions) {
    const ex = (s.exercises || []).find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const counted = (ex.sets || []).filter(isWorkingSet);
    if (!counted.length) continue;
    const factor = ex.unilateral ? 2 : 1;
    let vol = 0, top = 0, rm = 0, reps = 0;
    for (const st of counted) {
      vol += num(st.reps) * num(st.weight) * factor;
      reps += num(st.reps);
      if (num(st.weight) > top) top = num(st.weight);
      const r = epley1RM(st.weight, st.reps);
      if (r > rm) rm = r;
    }
    if (top > bestWeight) bestWeight = top;
    if (rm > best1RM) best1RM = rm;
    totalVolume += vol; totalSets += counted.length;
    entries.push({
      sessionId: s.id, date: s.startedAt, unilateral: !!ex.unilateral,
      sets: counted.map((st) => ({ reps: num(st.reps), weight: num(st.weight), rpe: st.rpe != null ? num(st.rpe) : null })),
      volume: round(vol, 1), topWeight: round(top, 1), est1RM: round(rm, 1), reps,
    });
  }
  return {
    entries,
    sessionCount: entries.length,
    bestWeight: round(bestWeight, 1),
    best1RM: round(best1RM, 1),
    totalVolume: round(totalVolume, 1),
    totalSets,
  };
}

/** Resumen global para la pantalla de informes. */
export async function globalStats({ since = null } = {}) {
  const sessions = await finishedSessions(since);
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

/** Resumen de los últimos 7 días (sesiones finalizadas). */
export async function weekStats() {
  const since = Date.now() - 7 * 24 * 3600 * 1000;
  const sessions = (await listSessions()).filter((s) => s.status === 'finished' && s.startedAt >= since);
  let volume = 0, sets = 0, durationMs = 0;
  for (const s of sessions) {
    const st = sessionStats(s);
    volume += st.totalVolume; sets += st.totalSets; durationMs += st.duration;
  }
  return { count: sessions.length, volume: round(volume, 1), sets, durationMs };
}

/** Volumen y series acumulados por etiqueta (grupo muscular) en sesiones finalizadas. */
export async function volumeByTag({ since = null } = {}) {
  const exs = await db.getAll(STORES.EXERCISES);
  const tagMap = new Map(exs.map((e) => [e.id, exerciseTags(e)]));
  const sessions = await finishedSessions(since);
  const agg = new Map(); // tag -> { volume, sets, reps }

  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      const factor = ex.unilateral ? 2 : 1;
      const counted = (ex.sets || []).filter(isWorkingSet);
      if (!counted.length) continue;
      let vol = 0, reps = 0;
      for (const st of counted) { vol += num(st.reps) * num(st.weight) * factor; reps += num(st.reps); }
      const tags = tagMap.get(ex.exerciseId) || [];
      const keys = tags.length ? tags : ['Sin etiqueta'];
      for (const t of keys) {
        const a = agg.get(t) || { volume: 0, sets: 0, reps: 0 };
        a.volume += vol; a.sets += counted.length; a.reps += reps;
        agg.set(t, a);
      }
    }
  }
  return [...agg.entries()]
    .map(([tag, v]) => ({ tag, volume: round(v.volume, 1), sets: v.sets, reps: v.reps }))
    .sort((a, b) => b.volume - a.volume);
}

/** Estadísticas de duración de las sesiones finalizadas. */
export async function durationStats({ since = null } = {}) {
  const sessions = (await finishedSessions(since)).filter(
    (s) => s.startedAt && s.finishedAt && s.finishedAt > s.startedAt);
  const series = sessions.slice().reverse().map((s) => ({ date: s.startedAt, ms: s.finishedAt - s.startedAt }));
  const totalMs = series.reduce((a, d) => a + d.ms, 0);
  const avgMs = series.length ? totalMs / series.length : 0;
  const longestMs = series.reduce((m, d) => (d.ms > m ? d.ms : m), 0);
  return { count: series.length, totalMs, avgMs, longestMs, series };
}

/** Lunes (00:00 local) de la semana que contiene el timestamp. */
function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lunes=0 … domingo=6
  return d.getTime();
}

/**
 * Frecuencia de entrenamiento por semanas (lunes a domingo, hora local):
 * serie continua de semanas (incluye semanas sin sesión), media de
 * sesiones/semana y rachas de semanas consecutivas con al menos una sesión.
 * La semana en curso sin sesión todavía no rompe la racha actual.
 */
export async function frequencyStats({ since = null } = {}) {
  const sessions = await finishedSessions(since);
  if (!sessions.length) return { count: 0, weeks: [], avgPerWeek: 0, currentStreak: 0, bestStreak: 0 };

  const counts = new Map(); // inicio de semana (ms) -> nº de sesiones
  for (const s of sessions) {
    const k = weekStart(s.startedAt);
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  // Serie continua desde la primera semana hasta la actual (suma días, robusto frente a DST).
  const weeks = [];
  const last = weekStart(Date.now());
  for (let t = Math.min(...counts.keys()); t <= last; ) {
    weeks.push({ start: t, count: counts.get(t) || 0 });
    const d = new Date(t);
    d.setDate(d.getDate() + 7);
    t = d.getTime();
  }

  let bestStreak = 0, run = 0;
  for (const w of weeks) { run = w.count ? run + 1 : 0; if (run > bestStreak) bestStreak = run; }

  let currentStreak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].count) currentStreak++;
    else if (i === weeks.length - 1) continue; // semana en curso sin entrenar aún
    else break;
  }

  return {
    count: sessions.length,
    weeks,
    avgPerWeek: round(sessions.length / weeks.length, 1),
    currentStreak,
    bestStreak,
  };
}

/**
 * Récords personales por ejercicio sobre TODO el histórico (sesiones finalizadas):
 * mejor peso, mejor serie (mayor peso×reps) y mejor 1RM estimado, con la fecha
 * de la primera vez que se lograron. `isRecent` marca récords de los últimos 28 días.
 */
export async function personalRecords() {
  const exs = await db.getAll(STORES.EXERCISES);
  const tagMap = new Map(exs.map((e) => [e.id, exerciseTags(e)]));
  const sessions = (await finishedSessions()).reverse(); // cronológico: la fecha del récord es la primera vez
  const map = new Map(); // exerciseId -> récord
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      for (const st of ex.sets || []) {
        const w = num(st.weight), r = num(st.reps);
        if (st.type === 'warmup' || w <= 0 || r <= 0) continue; // los calentamientos no cuentan
        let rec = map.get(ex.exerciseId);
        if (!rec) {
          rec = { exerciseId: ex.exerciseId, name: ex.name, tags: tagMap.get(ex.exerciseId) || [], topWeight: null, bestSet: null, best1RM: null };
          map.set(ex.exerciseId, rec);
        }
        rec.name = ex.name; // se queda con el nombre del snapshot más reciente
        const rm = epley1RM(w, r);
        if (!rec.topWeight || w > rec.topWeight.weight) rec.topWeight = { weight: w, reps: r, date: s.startedAt };
        if (!rec.bestSet || w * r > rec.bestSet.weight * rec.bestSet.reps) rec.bestSet = { weight: w, reps: r, date: s.startedAt };
        if (!rec.best1RM || rm > rec.best1RM.value) rec.best1RM = { value: rm, weight: w, reps: r, date: s.startedAt };
      }
    }
  }
  const recentSince = Date.now() - 28 * 24 * 3600 * 1000;
  return [...map.values()]
    .map((r) => ({
      ...r,
      isRecent: [r.topWeight, r.bestSet, r.best1RM].some((x) => x && x.date >= recentSince),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Series de trabajo por etiqueta en los últimos 7 días (clave en hipertrofia). */
export async function weeklySetsByTag() {
  const since = Date.now() - 7 * 24 * 3600 * 1000;
  const exs = await db.getAll(STORES.EXERCISES);
  const tagMap = new Map(exs.map((e) => [e.id, exerciseTags(e)]));
  const sessions = await finishedSessions(since);
  const agg = new Map();
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      const counted = (ex.sets || []).filter(isWorkingSet);
      if (!counted.length) continue;
      const tags = tagMap.get(ex.exerciseId) || [];
      const keys = tags.length ? tags : ['Sin etiqueta'];
      for (const t of keys) agg.set(t, (agg.get(t) || 0) + counted.length);
    }
  }
  return [...agg.entries()].map(([tag, sets]) => ({ tag, sets })).sort((a, b) => b.sets - a.sets);
}

/* Inferencia del patrón de movimiento a partir de las etiquetas. SOLO se usa para sembrar
   datos antiguos en `migrate()`; las clasificaciones nuevas son explícitas (campo `movement`). */
const MOVEMENT_KEYWORDS = {
  legs: ['pierna', 'cuadricep', 'muslo', 'femoral', 'isquio', 'gluteo', 'gemelo', 'pantorrilla', 'sentadilla', 'aductor', 'abductor', 'cadera'],
  push: ['pecho', 'pectoral', 'hombro', 'deltoid', 'tricep', 'press', 'fondo', 'empuj'],
  pull: ['espalda', 'dorsal', 'bicep', 'antebrazo', 'remo', 'jalon', 'dominada', 'trapecio', 'tiron'],
};
function deburr(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function inferMovement(tags) {
  const blob = (tags || []).map(deburr).join(' ');
  // Pierna primero: evita que "prensa/leg press" caiga en empuje por la palabra "press".
  for (const m of ['legs', 'push', 'pull']) {
    if (MOVEMENT_KEYWORDS[m].some((k) => blob.includes(k))) return m;
  }
  return '';
}

/**
 * Volumen por patrón de movimiento (empuje/tirón/pierna/sin clasificar) para el informe de
 * equilibrio muscular. Se basa en el campo `movement` del ejercicio (explícito, no en etiquetas).
 * El factor ×2 de los unilaterales se respeta.
 */
export async function muscleBalance({ since = null } = {}) {
  const exs = await db.getAll(STORES.EXERCISES);
  const moveMap = new Map(exs.map((e) => [e.id, exerciseMovement(e)]));
  const sessions = await finishedSessions(since);
  const vol = { push: 0, pull: 0, legs: 0, other: 0 };
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      const factor = ex.unilateral ? 2 : 1;
      const counted = (ex.sets || []).filter(isWorkingSet);
      if (!counted.length) continue;
      let v = 0;
      for (const st of counted) v += num(st.reps) * num(st.weight) * factor;
      const m = moveMap.get(ex.exerciseId) || '';
      if (m === 'push' || m === 'pull' || m === 'legs') vol[m] += v;
      else vol.other += v;
    }
  }
  return { push: round(vol.push, 1), pull: round(vol.pull, 1), legs: round(vol.legs, 1), other: round(vol.other, 1) };
}

/** Serie temporal del RPE medio por sesión (solo sesiones que lo registraron). */
export async function rpeTrend({ since = null } = {}) {
  const sessions = (await finishedSessions(since)).slice().sort((a, b) => a.startedAt - b.startedAt);
  const series = [];
  for (const s of sessions) {
    const st = sessionStats(s);
    if (st.avgRpe != null) series.push({ date: s.startedAt, avgRpe: st.avgRpe });
  }
  return series;
}

/**
 * Catálogo de logros con su estado (desbloqueado y progreso) según los datos.
 * Cada logro tiene una categoría (`cat`) para agruparlos en la vista y, opcional-
 * mente, un sufijo (`suffix`) para la línea de progreso (p. ej. unidad de peso o "h").
 */
export async function achievements() {
  const HOUR = 3600 * 1000;
  const sessions = await finishedSessions();

  // Una sola pasada por las sesiones para todas las métricas acumuladas / máximas.
  let totalVolume = 0, totalReps = 0, totalSets = 0, totalDuration = 0;
  let maxSessionVolume = 0, maxSessionDuration = 0;
  let maxTopWeight = 0, max1RM = 0;
  let earlyCount = 0, nightCount = 0, weekendCount = 0;
  const exIds = new Set();
  for (const s of sessions) {
    const st = sessionStats(s);
    totalVolume += st.totalVolume;
    totalReps += st.totalReps;
    totalSets += st.totalSets;
    totalDuration += st.duration;
    if (st.totalVolume > maxSessionVolume) maxSessionVolume = st.totalVolume;
    if (st.duration > maxSessionDuration) maxSessionDuration = st.duration;
    const d = new Date(s.startedAt);
    const h = d.getHours(), dow = d.getDay();
    if (h < 7) earlyCount++;
    if (h >= 22) nightCount++;
    if (dow === 0 || dow === 6) weekendCount++;
    for (const ex of s.exercises || []) {
      exIds.add(ex.exerciseId);
      for (const set of ex.sets || []) {
        const w = num(set.weight), r = num(set.reps);
        if (set.type === 'warmup' || w <= 0 || r <= 0) continue; // solo series de trabajo reales
        if (w > maxTopWeight) maxTopWeight = w;
        const rm = epley1RM(w, r);
        if (rm > max1RM) max1RM = rm;
      }
    }
  }

  const [freq, prs, tags, bw, goals] = await Promise.all([
    frequencyStats(), personalRecords(), volumeByTag(), listBodyweight(), goalProgress(),
  ]);

  const u = unitLabel();
  const sc = sessions.length;
  const bs = freq.bestStreak || 0;
  const prCount = prs.length;
  const tagCount = tags.filter((t) => t.tag !== 'Sin etiqueta').length;
  const bwCount = bw.length;
  const goalsDone = goals.filter((g) => g.achieved).length;
  const totalHours = round(totalDuration / HOUR, 1);
  const longestMin = Math.round(maxSessionDuration / 60000);

  const catalog = [
    // ---- Constancia (sesiones + rachas) ----
    { cat: 'Constancia', id: 's1', icon: '🏁', title: 'Primer entreno', desc: 'Completa tu primera sesión', value: sc, target: 1 },
    { cat: 'Constancia', id: 's10', icon: '💪', title: 'Cogiendo el ritmo', desc: '10 sesiones completadas', value: sc, target: 10 },
    { cat: 'Constancia', id: 's50', icon: '🦾', title: 'Veterano', desc: '50 sesiones completadas', value: sc, target: 50 },
    { cat: 'Constancia', id: 's100', icon: '🏛️', title: 'Centenario', desc: '100 sesiones completadas', value: sc, target: 100 },
    { cat: 'Constancia', id: 's250', icon: '🗿', title: 'Leyenda', desc: '250 sesiones completadas', value: sc, target: 250 },
    { cat: 'Constancia', id: 'st2', icon: '⚡', title: 'Constante', desc: 'Racha de 2 semanas seguidas', value: bs, target: 2 },
    { cat: 'Constancia', id: 'st4', icon: '🔥', title: 'Un mes seguido', desc: 'Racha de 4 semanas', value: bs, target: 4 },
    { cat: 'Constancia', id: 'st12', icon: '🌋', title: 'Imparable', desc: 'Racha de 12 semanas', value: bs, target: 12 },
    { cat: 'Constancia', id: 'st26', icon: '🏔️', title: 'Medio año en racha', desc: 'Racha de 26 semanas', value: bs, target: 26 },
    { cat: 'Constancia', id: 'st52', icon: '🏅', title: 'Un año sin fallar', desc: 'Racha de 52 semanas', value: bs, target: 52 },

    // ---- Volumen (kg·reps levantados) ----
    { cat: 'Volumen', id: 'v50k', icon: '🪙', title: 'Calentando motores', desc: '50.000 de volumen total', value: totalVolume, target: 50000 },
    { cat: 'Volumen', id: 'v100k', icon: '🏋️', title: '100k levantados', desc: '100.000 de volumen total', value: totalVolume, target: 100000 },
    { cat: 'Volumen', id: 'v500k', icon: '⚙️', title: 'Medio millón', desc: '500.000 de volumen total', value: totalVolume, target: 500000 },
    { cat: 'Volumen', id: 'v1m', icon: '🌟', title: 'Un millón', desc: '1.000.000 de volumen total', value: totalVolume, target: 1000000 },
    { cat: 'Volumen', id: 'v2m', icon: '💎', title: 'Dos millones', desc: '2.000.000 de volumen total', value: totalVolume, target: 2000000 },
    { cat: 'Volumen', id: 'sv10k', icon: '🦣', title: 'Día bestia', desc: '10.000 de volumen en una sola sesión', value: maxSessionVolume, target: 10000 },
    { cat: 'Volumen', id: 'sv20k', icon: '🐘', title: 'Megadía', desc: '20.000 de volumen en una sola sesión', value: maxSessionVolume, target: 20000 },

    // ---- Esfuerzo (repeticiones + series) ----
    { cat: 'Esfuerzo', id: 'r1k', icon: '🔂', title: 'Mil repeticiones', desc: '1.000 repeticiones totales', value: totalReps, target: 1000 },
    { cat: 'Esfuerzo', id: 'r10k', icon: '🔄', title: 'Diez mil reps', desc: '10.000 repeticiones totales', value: totalReps, target: 10000 },
    { cat: 'Esfuerzo', id: 'r50k', icon: '📈', title: 'Cincuenta mil reps', desc: '50.000 repeticiones totales', value: totalReps, target: 50000 },
    { cat: 'Esfuerzo', id: 'set500', icon: '🧱', title: 'Constructor', desc: '500 series completadas', value: totalSets, target: 500 },
    { cat: 'Esfuerzo', id: 'set2k', icon: '🏗️', title: 'Arquitecto', desc: '2.000 series completadas', value: totalSets, target: 2000 },

    // ---- Fuerza (récords + pesos máximos) ----
    { cat: 'Fuerza', id: 'pr1', icon: '🏆', title: 'Primer récord', desc: 'Registra tu primer récord', value: prCount, target: 1 },
    { cat: 'Fuerza', id: 'pr10', icon: '👑', title: 'Coleccionista de PRs', desc: 'Récords en 10 ejercicios', value: prCount, target: 10 },
    { cat: 'Fuerza', id: 'pr25', icon: '💍', title: 'Maestro de récords', desc: 'Récords en 25 ejercicios', value: prCount, target: 25 },
    { cat: 'Fuerza', id: 'w100', icon: '🏋️‍♂️', title: 'Club de los 100', desc: `Levanta 100 ${u} en una sola serie`, value: maxTopWeight, target: 100, suffix: u },
    { cat: 'Fuerza', id: 'w140', icon: '🦏', title: 'Bestia parda', desc: `Levanta 140 ${u} en una sola serie`, value: maxTopWeight, target: 140, suffix: u },
    { cat: 'Fuerza', id: 'rm150', icon: '🚀', title: '1RM de 150', desc: `1RM estimado de 150 ${u}`, value: Math.round(max1RM), target: 150, suffix: u },

    // ---- Dedicación (tiempo entrenado) ----
    { cat: 'Dedicación', id: 't10h', icon: '⏱️', title: 'Diez horas', desc: '10 horas entrenadas en total', value: totalHours, target: 10, suffix: 'h' },
    { cat: 'Dedicación', id: 't50h', icon: '⏰', title: 'Cincuenta horas', desc: '50 horas entrenadas en total', value: totalHours, target: 50, suffix: 'h' },
    { cat: 'Dedicación', id: 't100h', icon: '🕰️', title: 'Cien horas', desc: '100 horas entrenadas en total', value: totalHours, target: 100, suffix: 'h' },
    { cat: 'Dedicación', id: 'long90', icon: '🏃', title: 'Maratoniano', desc: 'Una sesión de 90 minutos', value: longestMin, target: 90, suffix: 'min' },

    // ---- Variedad (ejercicios + grupos musculares) ----
    { cat: 'Variedad', id: 'ex10', icon: '🧭', title: 'Explorador', desc: '10 ejercicios distintos realizados', value: exIds.size, target: 10 },
    { cat: 'Variedad', id: 'ex25', icon: '🗺️', title: 'Aventurero', desc: '25 ejercicios distintos realizados', value: exIds.size, target: 25 },
    { cat: 'Variedad', id: 'tag5', icon: '🎨', title: 'Cuerpo completo', desc: '5 grupos musculares distintos', value: tagCount, target: 5 },
    { cat: 'Variedad', id: 'tag10', icon: '🌈', title: 'Todoterreno', desc: '10 grupos musculares distintos', value: tagCount, target: 10 },

    // ---- Hábitos (horarios + seguimiento) ----
    { cat: 'Hábitos', id: 'early', icon: '🌅', title: 'Madrugador', desc: 'Entrena antes de las 7:00', value: earlyCount, target: 1 },
    { cat: 'Hábitos', id: 'night', icon: '🦉', title: 'Búho nocturno', desc: 'Entrena a partir de las 22:00', value: nightCount, target: 1 },
    { cat: 'Hábitos', id: 'weekend', icon: '🏖️', title: 'Finde activo', desc: '10 sesiones en fin de semana', value: weekendCount, target: 10 },
    { cat: 'Hábitos', id: 'bw10', icon: '⚖️', title: 'A control', desc: 'Registra tu peso corporal 10 veces', value: bwCount, target: 10 },
    { cat: 'Hábitos', id: 'goal1', icon: '🎯', title: 'Meta cumplida', desc: 'Alcanza uno de tus objetivos', value: goalsDone, target: 1 },
  ];

  return catalog.map((a) => ({
    ...a,
    suffix: a.suffix || '',
    unlocked: a.value >= a.target,
    pct: a.target > 0 ? Math.min(100, Math.round((a.value / a.target) * 100)) : 0,
  }));
}

/* ---------------- Logros desbloqueados (para avisar al conseguir uno nuevo) ---------------- */
const ACH_KEY = 'gt-achievements-unlocked';
function readAchBaseline() { try { return JSON.parse(localStorage.getItem(ACH_KEY)); } catch (e) { return null; } }

/** Fija la base de logros desbloqueados si aún no existe (sin avisar). */
export async function seedAchievementBaseline() {
  if (Array.isArray(readAchBaseline())) return;
  const list = await achievements();
  localStorage.setItem(ACH_KEY, JSON.stringify(list.filter((a) => a.unlocked).map((a) => a.id)));
}

/** Rehace la base con el estado actual (tras importar o borrar datos, para no avisar en masa). */
export async function resetAchievementBaseline() {
  localStorage.removeItem(ACH_KEY);
  await seedAchievementBaseline();
}

/**
 * Recalcula los logros, actualiza la base guardada y devuelve los **recién desbloqueados**
 * (para celebrarlos). La primera vez (sin base) solo siembra y no devuelve nada.
 */
export async function syncAchievements() {
  const list = await achievements();
  const now = list.filter((a) => a.unlocked).map((a) => a.id);
  const prev = readAchBaseline();
  localStorage.setItem(ACH_KEY, JSON.stringify(now));
  if (!Array.isArray(prev)) return [];
  const prevSet = new Set(prev);
  return list.filter((a) => a.unlocked && !prevSet.has(a.id));
}

/**
 * Reto semanal: sesiones finalizadas en la semana en curso (lunes–domingo) frente a un
 * objetivo (nº de días con grupo en el planificador, o 3 por defecto).
 */
export async function weeklyGoal() {
  const days = await getPlanner();
  const planned = days.filter((d) => Array.isArray(d) && d.length).length;
  const target = planned || 3;
  const start = weekStart(Date.now());
  const sessions = await finishedSessions();
  const done = sessions.filter((s) => weekStart(s.startedAt) === start).length;
  return { done, target };
}

/** Fuerza relativa: mejor peso de cada ejercicio ÷ peso corporal actual. null si no hay peso. */
export async function relativeStrength() {
  const bw = await listBodyweight();
  if (!bw.length) return null;
  const bodyweight = num(bw[bw.length - 1].weight); // listBodyweight va de más antiguo a más reciente
  if (!(bodyweight > 0)) return null;
  const prs = await personalRecords();
  const items = prs
    .map((r) => ({ name: r.name, topWeight: r.topWeight.weight, ratio: round(r.topWeight.weight / bodyweight, 2) }))
    .sort((a, b) => b.ratio - a.ratio);
  return { bodyweight: round(bodyweight, 1), items };
}

/* ---------------- Rutinas (plantillas del planificador) y semana de descarga ----------------
   Se guardan en el mismo store `planner`: las plantillas con id 'tpl:<uid>' y la descarga en
   un registro aparte 'deload'. No requieren cambiar el esquema de IndexedDB. */
const DELOAD_ID = 'deload';
export async function listRoutines() {
  const all = await db.getAll(STORES.PLANNER);
  return all
    .filter((r) => typeof r.id === 'string' && r.id.startsWith('tpl:'))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export function saveRoutine({ id, name, days }) {
  const norm = Array.from({ length: 7 }, (_, i) => (Array.isArray(days[i]) ? days[i].filter(Boolean) : []));
  return db.put(STORES.PLANNER, { id: id || ('tpl:' + uid()), name: String(name).trim() || 'Rutina', days: norm, updatedAt: Date.now() });
}
export function deleteRoutine(id) { return db.remove(STORES.PLANNER, id); }
/** Aplica una plantilla: copia sus días al planificador de la semana. */
export async function applyRoutine(id) {
  const r = await db.get(STORES.PLANNER, id);
  if (!r || !Array.isArray(r.days)) return false;
  await savePlanner(r.days);
  return true;
}
export async function isDeloadWeek() {
  const r = await db.get(STORES.PLANNER, DELOAD_ID);
  return !!(r && r.value);
}
export function setDeloadWeek(on) { return db.put(STORES.PLANNER, { id: DELOAD_ID, value: !!on }); }

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
