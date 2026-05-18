from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import random  # Remove this when you plug in your real model

app = FastAPI(title="AI Forgery Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DetectionResult(BaseModel):
    filename: str
    verdict: str          # "AUTHENTIC" | "SUSPICIOUS" | "FAKE DETECTED"
    ai_generated: float   # 0.0 – 1.0
    tampering: float      # 0.0 – 1.0
    authenticity: float   # 0.0 – 1.0
    deepfake_risk: float  # 0.0 – 1.0
    ela: float            # 0.0 – 1.0
    dct: float            # 0.0 – 1.0
    prnu: float           # 0.0 – 1.0
    semantic: float       # 0.0 – 1.0
    noise: float          # 0.0 – 1.0


@app.get("/")
def root():
    return {"message": "AI Forgery Detection API is running"}


@app.post("/detect", response_model=DetectionResult)
async def detect_forgery(file: UploadFile = File(...)):
    contents = await file.read()  # Pass `contents` to your real model here

    # ── DUMMY VALUES — replace with your model's output ──────────────────
    roll = random.random()

    if roll < 0.33:
        verdict = "AUTHENTIC"
        base = 0.08
    elif roll < 0.66:
        verdict = "SUSPICIOUS"
        base = 0.45
    else:
        verdict = "FAKE DETECTED"
        base = 0.82

    def jit():
        return round(min(0.99, max(0.01, base + (random.random() - 0.5) * 0.25)), 3)

    return DetectionResult(
        filename=file.filename,
        verdict=verdict,
        ai_generated=jit(),
        tampering=jit(),
        authenticity=round(1 - base + (random.random() - 0.5) * 0.15, 3),
        deepfake_risk=jit(),
        ela=jit(),
        dct=jit(),
        prnu=round(1 - jit(), 3),
        semantic=jit(),
        noise=jit(),
    )