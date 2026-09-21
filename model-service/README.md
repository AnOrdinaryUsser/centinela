# Model service — Centinela CyL

Microservicio en Python (FastAPI) que sirve el modelo de Deep Learning entrenado para detectar posibles vertederos ilegales en imagen aérea/satelital (PNOA). Se ejecuta como proceso independiente para no mezclar el runtime de Python/PyTorch con el backend en Node.js.

## El modelo

- **Arquitectura**: YOLOv8s (Ultralytics), tarea de detección de objetos.
- **Entrenamiento**: 200 épocas, batch 8, imagen 640×640, lr0 0.001 (ver `exp_1_e200_b8_lr0.001`).
- **Clase**: una única clase, `dump_site` (vertedero).
- **Métricas finales** (época 200): precisión 0.96, recall 0.88, mAP50 0.94, mAP50-95 0.77 — un modelo con muy buen rendimiento.

## Puesta en marcha

**Requiere Python 3.11**: es la versión para la que PyTorch/Ultralytics y el resto de dependencias tienen rueda precompilada en Windows. Si no la tienes, descárgala de [python.org](https://www.python.org/downloads/release/python-3119/) (marca "Add python.exe to PATH" al instalar).

En Windows (PowerShell):

```powershell
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

En Linux/macOS:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Comprueba que el venv usa la versión correcta con `python --version` (debe decir `Python 3.11.x`) antes de instalar nada.

**Copia tu checkpoint entrenado**: pon `best.pt` dentro de `model-service/weights/` (esa carpeta está excluida de git en `.gitignore` — los pesos no deben ir al repositorio; para producción/CI usa almacenamiento externo o Git LFS). Con la ruta por defecto (`MODEL_WEIGHTS_PATH=./weights/best.pt`) no hace falta tocar nada más.

```bash
uvicorn app.main:app --reload --port 8000
```

Si `weights/best.pt` no existe, el servicio arranca igualmente en **modo simulado** (genera detecciones aleatorias), para poder seguir desarrollando y probando el resto de la plataforma sin bloquear en la integración del modelo.

Documentación interactiva automática (Swagger UI, generada por FastAPI a partir de los tipos de Python) en `http://localhost:8000/docs`, y el spec OpenAPI en `http://localhost:8000/openapi.json`.

## Cómo funciona `/predict`

1. Recibe un `bounds` (bounding box WGS84 de una celda de la cuadrícula) y un `confidence_threshold` (0.30-0.95 mientras se prueba el modelo; el rango de produccion previsto por el spec es 0.85-0.99).
2. Pide esa zona al servicio WMS público de PNOA (`app/pnoa_client.py`) como una imagen de 960×960 (configurable con `MODEL_TILE_SIZE`; más píxeles que eso solo ayuda si el zoom del grid de análisis es lo bastante bajo como para que PNOA tenga detalle real de sobra que dar — ver el comentario de `TILE_SIZE` en `app/model.py`).
3. Pasa la imagen por el modelo YOLOv8 a su resolución de entrenamiento, 640×640 (`app/model.py`, `MODEL_INFERENCE_SIZE`) — independiente de `MODEL_TILE_SIZE`, así una imagen más nítida no desajusta la escala que el modelo espera.
4. Convierte cada caja detectada (en coordenadas de píxel) de vuelta a longitud/latitud reales, usando el propio `bounds` de la petición.
5. Devuelve las detecciones con su confianza y clase (`dump_site`) por encima del umbral pedido.

## Notas y siguientes pasos

- `MODEL_TILE_SIZE` debe coincidir razonablemente con el tamaño de celda que uses en el frontend (`cellSizeDegrees` en `GridSelector`): celdas demasiado grandes reducen la resolución efectiva vista por el modelo.
- El recorte se pide directamente al WMS público de PNOA en cada predicción; para un uso más intensivo conviene añadir una caché de tiles (por bounds) para no repetir peticiones idénticas.
- Si en el futuro entrenas una versión con más clases, `Detection.class_name` ya viaja en la respuesta — no haría falta tocar el backend ni el frontend para esa parte, solo el modelo.
