# apps/face-api

Stateless face embedding service: **images in → 512-d embeddings + quality out**.
FastAPI + InsightFace `buffalo_l` (SCRFD detector + ArcFace recogniser) on CPU via onnxruntime.
It has **no database credentials**; only the Next.js server calls it (header `X-Face-Api-Secret`).

| Endpoint | |
|---|---|
| `GET /health` | `{status, model_loaded, model, version}` |
| `POST /embed` | multipart `images` (1–12 files, ≤ 4 MB each) → one result per image: `{ok, det_score, face_px, blur, embedding?}` or `{ok:false, reason}` with reason `no_face`, `multiple_faces`, `face_too_small`, `low_detection_score`, `too_blurry`, `not_an_image`, `image_too_large`, `bad_embedding`. 401 without the secret, 413 for too many images. |

## Install (Windows 11, tested)

```powershell
cd apps\face-api
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\pip.exe install -r requirements.txt
copy .env.example .env        # then set FACE_API_SECRET (same value as FACE_API_SECRET in apps/web/.env.local)
```

Notes:
- **Python 3.11** (64-bit). Versions are pinned in `requirements.txt` (insightface 2.1, onnxruntime 1.32.0, numpy 2.4, OpenCV 5.1).
- insightface 2.1 installs from a wheel here, so **no Visual C++ Build Tools** were needed. If pip ever tries to compile
  insightface, install "Desktop development with C++" from the Visual Studio Build Tools and retry.
- **Windows Smart App Control** blocks onnxruntime's/onnx's unsigned DLLs ("An Application Control policy has blocked this
  file"). On this machine it had to be turned off (Windows Security → App & browser control → Smart App Control).
  This is a device security setting: only the owner should change it.
- The model pack (~280 MB) downloads on first start into `models/` (gitignored).

## Run

```powershell
# from the repo root: uvicorn + a Cloudflare quick tunnel, publishes the tunnel URL to the web app
powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1
# local only
powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1 -NoTunnel
```

The deployed web app finds the face-api through `private.app_config.face_api_url` (or the `FACE_API_URL` env var,
which wins when set; use `http://127.0.0.1:8000` for local dev). The script publishes the tunnel URL with
`POST /api/edge/v1/face-api-url` using this laptop's edge device key from `apps/edge/.env`
(`EDGE_DEVICE_KEY`, `API_BASE_URL`); without those it prints the SQL to run instead.

**Tunnel choice.** A *quick tunnel* (`*.trycloudflare.com`) needs no account but gets a new URL on every start and has
no uptime guarantee: fine for development and demos. A *named tunnel* keeps a fixed hostname but needs a Cloudflare
account and a domain on Cloudflare:

```powershell
cloudflared tunnel login
cloudflared tunnel create face
cloudflared tunnel route dns face face.<your-domain>
powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1 -TunnelName face -PublicUrl https://face.<your-domain>
```

## Test

```powershell
.\.venv\Scripts\activate; ruff check .; pytest
```

`tests/test_api.py` and `tests/test_quality.py` use a fake engine (fast). `tests/test_model.py` runs the real model on
InsightFace's bundled sample photo (skipped if the model has not been downloaded yet).

Threshold evaluation on your own photos: `scripts/face-eval.py eval` (folder `eval/<person>/*.jpg`, gitignored), see
`docs/face-eval.md`.

## Licence of the model

The InsightFace **code** is MIT, but the pretrained **`buffalo_l` models are for non-commercial research use only**
(see the InsightFace repository). This project is a university course prototype. Any commercial deployment must licence
the models from InsightFace or swap in a model with a commercial licence.
