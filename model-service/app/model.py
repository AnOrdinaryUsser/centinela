"""Wrapper around the trained illegal-dumpsite detection model.

The real model is a YOLOv8s (Ultralytics) detector, trained for 200 epochs
at 640x640 with a single class: 'dump_site'. This is the only file that
should know about the Ultralytics/PyTorch API; everything else in the
service talks to VertederoDetector, not to the framework directly.
"""

import base64
import io
import os

from PIL import Image, ImageDraw, ImageFont

from app.pnoa_client import fetch_tile_image, pixel_to_lonlat
from app.schemas import Bounds, Detection

MODEL_WEIGHTS_PATH = os.getenv("MODEL_WEIGHTS_PATH", "./weights/best.pt")

# TILE_SIZE is how many pixels we ASK the PNOA WMS server for (both sides,
# square). PNOA "Maxima Actualidad" itself is natively ~0.25-0.50 m/pixel
# (confirmed against IGN's WMS capabilities); requesting more pixels than
# that native resolution can fill for a given ground footprint doesn't
# invent real detail, WMS just has to interpolate/upsample to satisfy the
# request - which is exactly what a too-blurry tile looks like. Bumped
# from 640 to 960 (still square) so tiles at low/mid analysis zooms (where
# 640px was leaving real PNOA detail on the table) come back sharper; see
# frontend/src/pages/MapPage.jsx for the matching MAX_TILE_ZOOM cap that
# keeps the grid from being drawn so fine it asks for MORE detail than
# PNOA actually has (which 960px alone can't fix - see MODEL_INFERENCE_SIZE
# below for why the model itself still runs at its original 640).
TILE_SIZE = int(os.getenv("MODEL_TILE_SIZE", "960"))

# The model was TRAINED at 640x640 (see module docstring). Feeding it a
# differently-scaled input than training used is its own kind of domain
# shift (object apparent size changes), so inference always runs at this
# fixed size regardless of TILE_SIZE - Ultralytics resizes the (now
# sharper, higher-res-fetched) image down to this for the forward pass and
# automatically rescales the resulting boxes back to the ORIGINAL image's
# pixel space, so detections/coordinates stay correct either way.
MODEL_INFERENCE_SIZE = 640


class VertederoDetector:
    def __init__(self, weights_path: str = MODEL_WEIGHTS_PATH):
        self.weights_path = weights_path
        self.model = None
        self.class_names: dict[int, str] = {}
        self._load_model(weights_path)

    def _load_model(self, weights_path: str) -> None:
        # There is no simulated/placeholder mode any more: this service is
        # useless without the real trained weights, so it refuses to start
        # rather than silently serving made-up detections that could be
        # mistaken for real ones. Copy best.pt into model-service/weights/
        # (or point MODEL_WEIGHTS_PATH at it) before starting this service.
        if not os.path.exists(weights_path):
            raise RuntimeError(
                f"[model-service] Weights file not found at '{weights_path}'. "
                "This service requires the real trained model to run - there is "
                "no demo/placeholder mode. Copy best.pt into model-service/weights/ "
                "(or set MODEL_WEIGHTS_PATH) and restart."
            )

        # Imported lazily: ultralytics (and the torch it pulls in) is a heavy
        # dependency, only needed once we actually have weights to load.
        from ultralytics import YOLO

        self.model = YOLO(weights_path)
        self.class_names = self.model.names  # e.g. {0: 'dump_site'}
        print(f"[model-service] Loaded '{weights_path}'. Classes: {self.class_names}")

    @property
    def model_version(self) -> str:
        return os.path.basename(self.weights_path)

    def predict(self, bounds: Bounds, confidence_threshold: float) -> tuple[list[Detection], str]:
        """Runs the real model over the tile covering `bounds`.

        Returns (detections, image_base64): the JPEG tile that was analyzed
        (with detection boxes drawn on it, if any), base64-encoded so the
        frontend can show exactly what the model looked at.
        """
        try:
            image = fetch_tile_image(bounds, width=TILE_SIZE, height=TILE_SIZE)
        except Exception as error:  # noqa: BLE001 - degrade gracefully, imagery is best-effort
            print(f"[model-service] WARNING: could not fetch PNOA tile ({error}). Continuing without image.")
            image = None

        detections, boxes_xyxy = self._predict_real(image, bounds, confidence_threshold)

        image_base64 = self._encode_image(image, boxes_xyxy) if image is not None else ""
        return detections, image_base64

    def _predict_real(
        self, image: Image.Image | None, bounds: Bounds, confidence_threshold: float
    ) -> tuple[list[Detection], list[tuple[float, float, float, float]]]:
        if image is None:
            return [], []

        results = self.model.predict(
            image, conf=confidence_threshold, imgsz=MODEL_INFERENCE_SIZE, verbose=False
        )[0]

        detections: list[Detection] = []
        boxes_xyxy: list[tuple[float, float, float, float]] = []
        for box in results.boxes:
            x_center, y_center, _box_width, _box_height = box.xywh[0].tolist()
            confidence = float(box.conf[0])
            class_id = int(box.cls[0])
            lon, lat = pixel_to_lonlat(x_center, y_center, bounds, TILE_SIZE, TILE_SIZE)
            detections.append(
                Detection(
                    longitude=lon,
                    latitude=lat,
                    confidence=round(confidence, 3),
                    class_name=self.class_names.get(class_id, "unknown"),
                )
            )
            boxes_xyxy.append(tuple(box.xyxy[0].tolist()))
        return detections, boxes_xyxy

    @staticmethod
    def _encode_image(
        image: Image.Image, boxes_xyxy: list[tuple[float, float, float, float]]
    ) -> str:
        """Draws detection boxes (if any) plus a visible watermark on a copy
        of the tile and returns it as a base64-encoded JPEG string. The
        watermark exists so it's unambiguous, just by looking at the image,
        that it was processed by the trained model and not just a raw PNOA
        crop. Deliberately does NOT print the weights filename/engine name
        here - that detail stays server-side, out of anything a user sees
        per cell."""
        annotated = image.copy().convert("RGB")
        draw = ImageDraw.Draw(annotated, "RGBA")

        for x1, y1, x2, y2 in boxes_xyxy:
            draw.rectangle([x1, y1, x2, y2], outline="#f9b115", width=3)

        width, height = annotated.size
        bar_height = 26
        draw.rectangle([0, height - bar_height, width, height], fill=(4, 20, 15, 190))

        try:
            font = ImageFont.load_default(size=13)
        except TypeError:  # older Pillow without the `size` kwarg
            font = ImageFont.load_default()

        label = "CENTINELA · YOLOv8"
        draw.text((8, height - bar_height + 6), label, fill="#22e3ac", font=font)

        # quality=90 (was 85): a bigger, sharper TILE_SIZE fetch (above)
        # deserves a re-encode that doesn't immediately throw part of it
        # away again. This does mean each tile's base64 payload is bigger
        # (roughly proportional to TILE_SIZE^2, so ~2.25x from the 640->960
        # bump alone, a bit more from the quality bump) - relevant because
        # the frontend keeps these in the browser's localStorage history
        # (see frontend/src/services/analyses.js getStorageUsage/the
        # storage-usage bar in AnalysisPage), which now fills up faster.
        buffer = io.BytesIO()
        annotated.save(buffer, format="JPEG", quality=90)
        return base64.b64encode(buffer.getvalue()).decode("ascii")


# Singleton instance used by the API layer.
detector = VertederoDetector()
