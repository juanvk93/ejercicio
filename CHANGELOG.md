# Changelog

Todos los cambios relevantes de **Gym Tracker** se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar]

### Añadido
- **Planificador semanal:** asigna grupos a cada día de la semana (Ajustes → Planificador,
  `#/planner`). Inicio muestra **"Hoy toca"** con el entreno del día y un botón para empezarlo.
  Nuevo almacén `planner`. (`js/views/planner.js`, `js/views/home.js`, `js/store.js`, `js/db.js`)
- **Sesión libre/vacía:** empezar un entreno sin grupo y añadir ejercicios sobre la marcha,
  desde el modal de nueva sesión. (`js/views/home.js`, `js/store.js` → `buildEmptySession`)
- **Series por grupo muscular a la semana:** en Informes, nº de series por etiqueta en los
  últimos 7 días con zonas de referencia (bajo/óptimo/alto, ~10–20 series). (`js/views/reports.js`,
  `js/store.js` → `weeklySetsByTag`)
- **Equilibrio muscular:** en Informes, reparto de volumen empuje/tirón y tren superior/inferior
  para detectar descompensaciones (clasifica las etiquetas por palabras clave). (`js/store.js` →
  `muscleBalance`, `js/views/reports.js`)
- **Tendencia de RPE:** en Informes, gráfica del RPE medio por sesión (fatiga). (`js/store.js` →
  `rpeTrend`, `js/views/reports.js`)
- **Calendario tipo heatmap:** vista de constancia de las últimas 12 semanas por intensidad de
  volumen. (`js/views/calendar.js`, `css/styles.css`)
- **Logros / medallas:** hitos por sesiones, rachas, volumen total y récords, con progreso
  (Ajustes → Logros, `#/achievements`). (`js/views/achievements.js`, `js/store.js` → `achievements`)
- **Cronómetro en vivo de la sesión:** duración actual en la cabecera de la sesión activa.
  (`js/views/session.js`, `js/utils.js` → `fmtClock`)
- **Esquemas de series rápidos:** botón "Esquema" para rellenar 5×5, 3×10, pirámide… de un toque.
  (`js/views/session.js`)
- **Calculadora de 1RM y calentamiento:** estima el 1RM (Epley), muestra tabla de % y una rampa
  de calentamiento. (`js/views/calculator.js`)
- **Historial por ejercicio:** desde la lista de ejercicios (icono de reloj) se abre
  `#/exercise/:id/history` con todas las sesiones finalizadas que lo incluyen, sus series
  (resaltando el peso máximo), RPE y un resumen (peso máx, mejor 1RM, volumen, series).
  (`js/views/exercise-history.js`, `js/store.js` → `exerciseHistory`)
- **RPE/RIR por serie (opcional):** se activa al crear la sesión ("Registrar RPE/RIR por
  serie", desmarcado por defecto); añade una columna RPE por serie. El resumen muestra el
  RPE medio. (`js/views/home.js`, `js/views/session.js`, `js/store.js`)
- **Medidas corporales:** la pantalla de peso pasa a "Peso y medidas" con un selector de
  tipo (cintura, pecho, bíceps, muslo, cadera, cuello, gemelo…) además del peso corporal;
  cada tipo tiene su evolución, gráfica e historial. Nuevo almacén `measurements`.
  (`js/views/weight.js`, `js/store.js`, `js/db.js`)
- **Repetir una sesión pasada:** botón "Repetir entreno" en el resumen y en las sesiones
  recientes de Inicio; crea una nueva sesión activa con los mismos ejercicios precargando
  la última vez. (`js/views/session.js` → `repeatSession`, `js/store.js` → `buildSessionFromPast`)
- **Editar sesiones pasadas:** botón "Editar series" en el resumen abre `#/session/:id/edit`
  para corregir reps, pesos, RPE, añadir/quitar ejercicios o notas de una sesión finalizada.
  (`js/views/session.js` → `editSession`)
- **Objetivos / metas:** nueva sección (Ajustes → Objetivos, `#/goals`) para fijar metas por
  ejercicio (peso máximo o 1RM estimado) con barra de progreso calculada a partir de los
  récords personales y aviso "¡Logrado!". Nuevo almacén `goals`. (`js/views/goals.js`, `js/store.js`)
- **Objetivos — aviso en vivo al cumplirlos:** durante la sesión, al completar una serie que
  alcanza un objetivo aún no logrado, salta un toast "🎯 ¡Objetivo cumplido!" (junto a la
  detección de récord). (`js/views/session.js`)
- **Objetivos — separados por estado:** la pantalla de Objetivos divide en "En progreso" y
  "Logrados (N)". (`js/views/goals.js`)
- **Objetivos — resumen en Inicio:** tarjeta "X de N logrados · Y en progreso" que enlaza a
  Objetivos. (`js/views/home.js`)
- **Notas de sesión:** campo de texto libre en la sesión activa (y al editar); se muestra en
  el resumen. (`js/views/session.js`)
- **Buscador de ejercicios por nombre** en el configurador de ejercicios. (`js/views/exercises.js`)
- **Superseries:** botón para enlazar un ejercicio con el siguiente dentro de la sesión
  (badge "⛓ Superserie" y borde de acento). (`js/views/session.js`)
- **Temporizador de descanso entre series (opcional):** se activa al crear la sesión
  desde "Nueva Sesión" (desmarcado por defecto) eligiendo los segundos. Al completar
  una serie arranca una barra flotante con cuenta atrás, controles −15/+15, pausa y
  saltar; al terminar suena un pitido (WebAudio, sin archivos) y vibra el móvil.
  (`js/views/home.js`, `js/views/session.js`, `js/store.js`, `css/styles.css`)
- **Detección de récord en vivo:** al marcar una serie como completada, si bate tu
  récord previo de peso o de 1RM estimado para ese ejercicio, aparece un aviso
  motivador. (`js/views/session.js`)
- **Progresión automática:** botón "+X" en cada ejercicio con historial que sube el
  peso de la última vez un escalón (2,5 kg / 5 lb) sobre todas las series.
  (`js/views/session.js`)
- **Calculadora de discos:** en la sección de calculadora, indica el peso objetivo y el
  de la barra y muestra qué discos cargar a cada lado (avisa si no sale exacto).
  (`js/views/calculator.js`)
- **Informes — filtro de periodo:** toggle horizontal «Todo · 1A · YTD · 6M · 3M ·
  1M · 2S» que filtra todas las estadísticas y gráficas de la pantalla (resumen,
  volumen, frecuencia, duración, grupo muscular y progreso por ejercicio). YTD parte
  del 1 de enero del año en curso; meses y años se calculan con fechas reales. Los
  récords personales son la excepción: siempre sobre todo el histórico.
  (`js/views/reports.js`, `js/store.js`)
- **Informes — filtrar récords por grupo muscular:** selector de etiqueta en la
  sección de récords personales (`store.personalRecords` ahora incluye las `tags`
  del ejercicio). (`js/views/reports.js`, `js/store.js`)
- **Informes — frecuencia y constancia:** racha actual y mejor racha de semanas
  consecutivas entrenadas (lunes a domingo, hora local; la semana en curso sin
  sesión aún no rompe la racha), media de sesiones/semana y gráfica de barras de
  sesiones por semana (`store.frequencyStats`, `utils.barChart`).
- **Informes — récords personales:** lista por ejercicio con peso máximo, mejor
  serie (mayor peso×reps) y 1RM estimado (fórmula de Epley), con la fecha de la
  primera vez que se lograron y distintivo «Nuevo PR» si son de los últimos 28
  días. Con más de 8 ejercicios se colapsa tras un botón «Ver todos»
  (`store.personalRecords`, `store.epley1RM`).
- **Informes — 1RM estimado como métrica:** tercera opción en la gráfica de
  progreso por ejercicio, junto a peso máximo y volumen (`store.exerciseProgress`
  ahora incluye `est1RM` por sesión).

### Corregido
- **El temporizador de descanso no se cerraba (se quedaba congelado en 0:00):** la barra
  usa `display:flex`, que anulaba el atributo `hidden` (las reglas de autor ganan a la del
  navegador), así que al pulsar ✕ o al llegar a 0 se marcaba oculta pero seguía visible.
  Se añade `[hidden]:not(.icon-btn) { display: none !important }`, que también corrige otros
  elementos `flex/grid` ocultables (p. ej. la fila de métricas de Informes). (`css/styles.css`)
- **Calculadora de discos:** se quitan los discos de 25 kg del juego de kilos. (`js/views/calculator.js`)
- **La PWA no se actualizaba en el móvil tras desplegar:** el registro del service
  worker no comprobaba si había versión nueva ni recargaba al activarse. Ahora la app
  llama a `registration.update()` al arrancar y al volver a primer plano, y se recarga
  una sola vez cuando el SW nuevo toma el control (`controllerchange`), de modo que la
  versión recién desplegada se aplica sin reinstalar. (`js/app.js`)
- **Fechas un día desfasadas (zona horaria):** `fmtDate`/`fmtDateShort` interpretaban
  las cadenas `'YYYY-MM-DD'` (registros de peso corporal) como medianoche **UTC**, por
  lo que en zonas horarias detrás de UTC se mostraba el día anterior. Ahora se interpretan
  como fecha **local**. (`js/utils.js`)
- **Sesión "fantasma" tras descartar/finalizar:** el autosave con debounce (~350 ms)
  podía re-escribir la sesión *después* de borrarla o finalizarla si quedaba un guardado
  pendiente. Ahora se cancela el temporizador en ambas acciones. (`js/views/session.js`)
- **Pérdida parcial de datos al importar un backup malformado:** una fila sin `id` hacía
  que `put` lanzara `DataError` mientras el `clear()` ya encolado podía confirmarse,
  dejando datos borrados y mostrando "Error al importar". La importación ahora filtra las
  filas que no sean objetos con `id`. (`js/db.js`)
- **Duración negativa al cruzar la medianoche:** en el resumen, una sesión con hora de fin
  anterior a la de inicio (entrenamiento que cruza las 00:00) calculaba una duración
  negativa (`—`). Ahora se asume el día siguiente para la hora de fin. (`js/views/session.js`)

### Seguridad
- **XSS reflejado menor:** el mensaje de error de una vista (`err.message`) se insertaba
  en el DOM sin escapar. Ahora se escapa con `esc()`. (`js/app.js`)

### Cambiado
- **Esquema de IndexedDB a `DB_VERSION = 3`:** nuevos almacenes `measurements` (medidas
  corporales), `goals` (objetivos) y `planner` (planificación semanal). El backup
  (exportar/importar) y el borrado de datos los incluyen. (`js/db.js`, `js/views/settings.js`)
- **Buscador de ejercicios separado del botón "+ Nuevo ejercicio"** con un margen superior.
  (`js/views/exercises.js`)
- Caché del Service Worker subida a `gym-tracker-v30` (incluye `planner.js` y `achievements.js`
  en el app-shell) para invalidar la versión anterior. (`service-worker.js`)
