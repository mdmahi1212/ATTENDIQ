// Self-hosts the MediaPipe Face Landmarker runtime under public/mediapipe/ (gitignored):
//  - the WASM files, copied from the pinned @mediapipe/tasks-vision package (no network)
//  - the face_landmarker.task model, downloaded once from Google's model bucket
// Runs automatically before `npm run dev` and `npm run build` (also on Vercel).
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "mediapipe");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MODEL = join(out, "face_landmarker.task");

mkdirSync(join(out, "wasm"), { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  copyFileSync(join(wasmSrc, f), join(out, "wasm", f));
}

if (!existsSync(MODEL) || statSync(MODEL).size < 1_000_000) {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1_000_000) throw new Error(`model download looks wrong (${buf.length} bytes)`);
  writeFileSync(MODEL, buf);
  console.log(`mediapipe: downloaded face_landmarker.task (${(buf.length / 1e6).toFixed(1)} MB)`);
}
console.log("mediapipe: runtime ready in public/mediapipe/");
