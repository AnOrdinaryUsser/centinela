#!/usr/bin/env python3
"""Prueba rápida de inferencia del modelo, sin levantar el servidor FastAPI.

Usa exactamente el mismo VertederoDetector que usa el model-service en
produccion (app/model.py), asi que si aqui carga "best.pt" de verdad, el
servidor tambien lo hara. Sirve para comprobar en segundos que el modelo
entrenado funciona, antes de pasar por todo el stack (frontend -> backend
-> model-service).

Dos modos de uso:

  1) Contra una imagen local ya descargada (rapido, sin red):
     python scripts/test_inference.py --image ruta/a/foto.jpg

  2) Contra una tile real de PNOA para unas coordenadas (descarga la
     ortofoto igual que hace la app):
     python scripts/test_inference.py --bounds 41.65 -4.73 41.66 -4.72

Sin argumentos, usa unas coordenadas de ejemplo en Castilla y Leon.

Cada tile probada (con las bounding boxes y la marca de agua dibujadas
encima, igual que ve el usuario en la app) se guarda en:

    model-service/tiles_output/tile_<timestamp>.jpg

Esa carpeta es, ahora mismo, la UNICA parte de todo el proyecto que
guarda tiles en disco: el model-service en produccion nunca escribe las
imagenes a disco (las devuelve en base64 dentro de la respuesta HTTP), y
el frontend solo las guarda en el localStorage del navegador, limitado a
las ultimas 8 ejecuciones (ver frontend/src/services/analyses.js). Si
quieres que la app guarde TODAS las tiles analizadas en el servidor de
forma permanente, es un cambio aparte que puedo hacer en
model-service/app/model.py (justo donde ya se genera `image_base64`).
"""

import argparse
import base64
import sys
from datetime import datetime
from pathlib import Path

# Permite ejecutar el script directamente (python scripts/test_inference.py)
# sin tener que instalar el paquete ni fijar PYTHONPATH a mano.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.model import VertederoDetector  # noqa: E402
from app.schemas import Bounds  # noqa: E402

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "tiles_output"

# Un punto de ejemplo dentro de Castilla y Leon (entorno de Valladolid),
# usado solo si no se pasan --bounds ni --image.
DEFAULT_BOUNDS = Bounds(south=41.640, west=-4.740, north=41.650, east=-4.730)


def run_on_bounds(detector: VertederoDetector, bounds: Bounds, confidence_threshold: float) -> None:
    print(f"Descargando tile PNOA para bounds={bounds.model_dump()} ...")
    detections, image_base64 = detector.predict(bounds, confidence_threshold)
    _report(detections, image_base64, detector.model_version)


def run_on_image(detector: VertederoDetector, image_path: Path, confidence_threshold: float) -> None:
    from PIL import Image

    image = Image.open(image_path).convert("RGB")
    print(f"Analizando imagen local: {image_path} ({image.size[0]}x{image.size[1]}px) ...")

    if detector.model is None:
        detections, boxes_xyxy = detector._predict_placeholder(DEFAULT_BOUNDS, confidence_threshold)  # noqa: SLF001
    else:
        detections, boxes_xyxy = detector._predict_real(image, DEFAULT_BOUNDS, confidence_threshold)  # noqa: SLF001

    image_base64 = detector._encode_image(image, boxes_xyxy, detector.model_version)  # noqa: SLF001
    _report(detections, image_base64, detector.model_version)


def _report(detections, image_base64: str, model_version: str) -> None:
    is_demo = model_version == "placeholder-demo"
    print()
    print(f"Motor: {model_version} {'(MODO SIMULADO — best.pt no cargado)' if is_demo else '(modelo real)'}")
    print(f"Detecciones: {len(detections)}")
    for i, d in enumerate(detections, start=1):
        print(f"  [{i}] {d.class_name} · confianza={d.confidence:.2f} · lon={d.longitude:.5f}, lat={d.latitude:.5f}")

    if not image_base64:
        print("(No se pudo obtener/guardar la imagen de esta tile.)")
        return

    OUTPUT_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = OUTPUT_DIR / f"tile_{timestamp}.jpg"
    out_path.write_bytes(base64.b64decode(image_base64))
    print(f"Tile guardada en: {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--image", type=Path, help="Ruta a una imagen local (640x640 recomendado) para analizar.")
    parser.add_argument(
        "--bounds",
        type=float,
        nargs=4,
        metavar=("SOUTH", "WEST", "NORTH", "EAST"),
        help="Bounding box WGS84 (grados decimales) de la que descargar una tile PNOA real.",
    )
    parser.add_argument(
        "--confidence",
        type=float,
        default=0.5,
        help="Umbral de confianza minimo (0-1). Por defecto 0.5, la app ahora permite 0.30-0.95 (el rango de produccion previsto por el spec es 0.85-0.99), para poder ver mas detecciones al probar.",
    )
    parser.add_argument(
        "--weights",
        type=str,
        default=None,
        help="Ruta a un checkpoint .pt distinto del que usa MODEL_WEIGHTS_PATH/.env (opcional).",
    )
    args = parser.parse_args()

    detector = VertederoDetector(weights_path=args.weights) if args.weights else VertederoDetector()

    if args.image:
        run_on_image(detector, args.image, args.confidence)
    else:
        bounds = Bounds(south=args.bounds[0], west=args.bounds[1], north=args.bounds[2], east=args.bounds[3]) if args.bounds else DEFAULT_BOUNDS
        run_on_bounds(detector, bounds, args.confidence)


if __name__ == "__main__":
    main()
