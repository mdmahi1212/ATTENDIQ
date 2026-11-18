import { z } from "zod";

/** Public tunnel URL of the face-api: https + hostname only (no path, port, credentials or query). */
export const faceApiUrlSchema = z
  .string()
  .max(200)
  .regex(/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i);
