#!/bin/bash
# Lanzador para macOS: doble clic para arrancar la app en local.
# Sirve la carpeta por HTTP (necesario para ES modules y el Service Worker)
# y abre el navegador. Cierra esta ventana o pulsa Ctrl+C para detener.

cd "$(dirname "$0")" || exit 1
PORT=8000

# Busca un puerto libre a partir de 8000.
while lsof -i :"$PORT" >/dev/null 2>&1; do PORT=$((PORT+1)); done

echo "Sirviendo Gym Tracker en http://localhost:$PORT"
echo "(Cierra esta ventana o pulsa Ctrl+C para detener el servidor)"

# Abre el navegador tras un instante.
( sleep 1; open "http://localhost:$PORT" ) &

exec python3 -m http.server "$PORT"
