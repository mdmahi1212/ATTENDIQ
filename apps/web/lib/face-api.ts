import "server-only";
import { faceApiResultSchema, type FaceApiResult } from "@/lib/face/enroll";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side client for apps/face-api (stateless: images in, embeddings out).
 * URL: FACE_API_URL env if set (local dev), otherwise private.app_config 'face_api_url', which
 * scripts/start-face-api.ps1 updates whenever the tunnel URL changes.
 */

export class FaceApiError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "unreachable" | "bad_response",
  ) {
    super(message);
  }
}

async function faceApiUrl(): Promise<string> {
  const fromEnv = process.env.FACE_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const { data, error } = await createAdminClient().rpc("get_app_config", { p_key: "face_api_url" });
  if (error || !data) throw new FaceApiError("face-api URL is not configured (run scripts/start-face-api.ps1)", "not_configured");
  return data.replace(/\/+$/, "");
}

function secret(): string {
  const s = process.env.FACE_API_SECRET;
  if (!s) throw new FaceApiError("FACE_API_SECRET is not set", "not_configured");
  return s;
}

/** Stored in face_profiles.model_version so a model change can force re-enrollment. */
export const FACE_MODEL_VERSION = "insightface-buffalo_l";

/** POST /embed with up to 12 JPEGs. One result per image, in order. */
export async function embedImages(images: Blob[]): Promise<FaceApiResult[]> {
  const url = await faceApiUrl();
  const form = new FormData();
  images.forEach((img, i) => form.append("images", img, `img${i}.jpg`));
  let res: Response;
  try {
    res = await fetch(`${url}/embed`, {
      method: "POST",
      headers: { "X-Face-Api-Secret": secret() },
      body: form,
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch (e) {
    throw new FaceApiError(`face-api unreachable: ${(e as Error).message}`, "unreachable");
  }
  if (!res.ok) throw new FaceApiError(`face-api returned ${res.status}`, res.status >= 500 || res.status === 404 ? "unreachable" : "bad_response");
  const body: unknown = await res.json().catch(() => null);
  const parsed = faceApiResultSchema.safeParse(body);
  if (!parsed.success || parsed.data.length !== images.length) throw new FaceApiError("face-api response was not understood", "bad_response");
  return parsed.data;
}
