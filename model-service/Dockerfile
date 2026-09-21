# Production image for the model-service (FastAPI + YOLOv8/Ultralytics).
#
# python:3.11-slim (not a "-bullseye" full image) to keep the image small,
# but Ultralytics pulls in opencv-python under the hood, and opencv's
# compiled wheel dlopens libGL/libglib at import time - a plain slim base
# doesn't ship those shared libraries, so without this apt-get step the
# very first "import ultralytics" inside the container crashes with
# "ImportError: libGL.so.1: cannot open shared object file", not
# something you'd catch from requirements.txt alone.
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# best.pt is gitignored on purpose (trained weights don't belong in git
# history) - it has to be provided at deploy time by mounting weights/ as
# a volume (see docker-compose.prod.yml). Without it, app/model.py falls
# back to its "simulated detections" mode on its own; that's a deliberate
# feature for local development, not something this Dockerfile needs to
# special-case.
ENV MODEL_SERVICE_PORT=8000
EXPOSE 8000

# --host 0.0.0.0: uvicorn's own default is 127.0.0.1, which inside a
# container means "reachable from nothing outside this container, not
# even Docker's own network" - the opposite of what a service other
# containers must call needs. No --reload (dev-only, watches files on
# disk and needlessly costs CPU/memory in production).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
