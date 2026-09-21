"""Client for fetching PNOA orthoimagery tiles via WMS.

This is the piece that turns a grid cell's bounding box into the actual
image the model looks at, and turns the model's pixel-space detections back
into real-world coordinates.
"""

import io
import os

import requests
from PIL import Image

from app.schemas import Bounds

PNOA_WMS_URL = os.getenv("PNOA_WMS_URL", "https://www.ign.es/wms-inspire/pnoa-ma")
PNOA_LAYER = os.getenv("PNOA_LAYER", "OI.OrthoimageCoverage")


def fetch_tile_image(bounds: Bounds, width: int = 960, height: int = 960) -> Image.Image:
    """Fetches a single PNOA orthoimage tile covering `bounds` via WMS GetMap.

    Uses WMS 1.1.1 with SRS=EPSG:4326, where the bbox is given in
    (minLon, minLat, maxLon, maxLat) order. That keeps pixel_to_lonlat()
    below a simple linear mapping (WMS 1.3.0 would swap axis order for
    EPSG:4326 and is easy to get backwards, so 1.1.1 is used deliberately).
    """
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": PNOA_LAYER,
        "STYLES": "",
        "SRS": "EPSG:4326",
        "BBOX": f"{bounds.west},{bounds.south},{bounds.east},{bounds.north}",
        "WIDTH": width,
        "HEIGHT": height,
        # PNG (lossless) instead of JPEG here: this is the server's OWN
        # render of the tile, before we do our own single JPEG re-encode
        # in model.py (_encode_image). Asking for JPEG at this step meant
        # compressing twice - IGN's server, then ours - for no reason;
        # asking for PNG means only our own encode introduces any loss.
        "FORMAT": "image/png",
    }
    response = requests.get(PNOA_WMS_URL, params=params, timeout=30)
    response.raise_for_status()
    return Image.open(io.BytesIO(response.content)).convert("RGB")


def pixel_to_lonlat(x: float, y: float, bounds: Bounds, width: int, height: int) -> tuple[float, float]:
    """Converts a pixel coordinate (origin top-left) of a fetched tile back
    to WGS84 (longitude, latitude), assuming the linear WMS bbox mapping
    used by fetch_tile_image() above.
    """
    lon = bounds.west + (x / width) * (bounds.east - bounds.west)
    # Image y grows downward while latitude grows upward, so it's flipped.
    lat = bounds.north - (y / height) * (bounds.north - bounds.south)
    return lon, lat
