"""Pydantic request/response models for the model-service API.

These type annotations are what FastAPI uses to auto-generate the OpenAPI
schema and the interactive Swagger UI at /docs, so keep them accurate.
"""

from pydantic import BaseModel, Field


class Bounds(BaseModel):
    """Bounding box of a grid cell, in WGS84 decimal degrees."""

    north: float = Field(..., example=41.66)
    south: float = Field(..., example=41.65)
    east: float = Field(..., example=-4.72)
    west: float = Field(..., example=-4.73)


class PredictRequest(BaseModel):
    bounds: Bounds
    # Was ge=0.85 (the product spec's intended production range) - widened
    # down to 0.30 so a lower threshold can be used while testing a freshly
    # trained model, to see whether it's detecting anything at all before
    # deciding it's confident enough for the stricter production range. If
    # this is still ge=0.85 in your deployed model-service, this endpoint
    # will reject (422) any request below that, no matter what the
    # frontend's slider is set to - both sides need to agree.
    confidence_threshold: float = Field(
        default=0.90,
        ge=0.30,
        le=0.95,
        description="Minimum confidence score (0.30-0.95) for a detection to be reported.",
    )


class Detection(BaseModel):
    longitude: float
    latitude: float
    confidence: float = Field(..., ge=0.0, le=1.0)
    class_name: str = Field(
        default="dump_site",
        description="Class detected by the YOLO model (this project's trained model has a single class: dump_site).",
    )


class PredictResponse(BaseModel):
    detections: list[Detection]
    model_version: str
    image_base64: str = Field(
        default="",
        description=(
            "Imagen PNOA analizada (recorte de la celda), codificada en base64 "
            "como JPEG, para poder mostrarla en el frontend junto a las "
            "detecciones. Vacia si no se pudo obtener la imagen."
        ),
    )
