"""FastAPI application exposing the trained dumpsite-detection model.

Swagger UI is generated automatically by FastAPI from the type hints in
app/schemas.py and is available at /docs (ReDoc at /redoc, raw spec at
/openapi.json) with zero extra configuration.
"""

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.model import detector
from app.schemas import PredictRequest, PredictResponse

load_dotenv()

app = FastAPI(
    title="Centinela CyL — Model Service",
    description=(
        "Servicio que sirve el modelo YOLOv8 entrenado para detectar "
        "posibles vertederos ilegales (clase 'dump_site') en imagen "
        "aerea/satelital (PNOA)."
    ),
    version=detector.model_version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Salud"])
def health_check():
    """Simple liveness check used by the backend and by deployment tooling."""
    return {
        "status": "ok",
        "model_version": detector.model_version,
        "classes": detector.class_names,
    }


@app.post("/predict", response_model=PredictResponse, tags=["Prediccion"])
def predict(request: PredictRequest):
    """Runs the trained model over the imagery covering the given bounds.

    Devuelve la lista de detecciones (longitud, latitud, confianza, clase)
    por encima del umbral de confianza indicado, junto con la propia imagen
    PNOA analizada (en base64) con las cajas de deteccion dibujadas.
    """
    detections, image_base64 = detector.predict(request.bounds, request.confidence_threshold)
    return PredictResponse(
        detections=detections,
        model_version=detector.model_version,
        image_base64=image_base64,
    )
