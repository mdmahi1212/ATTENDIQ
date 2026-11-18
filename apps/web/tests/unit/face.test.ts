import { describe, expect, it } from "vitest";
import { CapturePlan, classifyPose, FRAMES_PER_POSE, neutralPitch, POSES } from "@/lib/face/capture";
import { DUPLICATE_SIMILARITY, duplicateDecision, enrollMetaSchema, meanVector, normalise, selectEmbeddings, type FaceApiResult } from "@/lib/face/enroll";
import { blendshape, boundingBox, guidance, headPose, meanLuma, type FrameFeatures, type Point } from "@/lib/face/features";
import { ALL_CHALLENGES, LIVENESS, LivenessSession, pickChallenges, type Challenge } from "@/lib/face/liveness";

// ---------------------------------------------------------------- helpers
const BOX = { x: 0.3, y: 0.25, w: 0.4, h: 0.5 };
function frame(t: number, over: Partial<FrameFeatures> = {}): FrameFeatures {
  return { t, faces: 1, blink: 0.05, smile: 0.05, yaw: 0, pitch: 0.4, box: BOX, brightness: 120, ...over };
}

/** Plays a sequence of [durationMs, overrides] segments at ~30 fps. */
function stream(segments: [number, Partial<FrameFeatures>][], start = 0): FrameFeatures[] {
  const out: FrameFeatures[] = [];
  let t = start;
  for (const [dur, over] of segments) {
    for (let e = 0; e < dur; e += 33) out.push(frame((t += 33), over));
  }
  return out;
}

const run = (s: LivenessSession, frames: FrameFeatures[]) => frames.reduce((_, f) => s.feed(f), s.state);

const ACTION: Record<Challenge, [number, Partial<FrameFeatures>][]> = {
  blink: [[300, {}], [150, { blink: 0.8 }], [300, {}]],
  smile: [[300, {}], [500, { smile: 0.8 }], [200, {}]],
  turn_left: [[300, {}], [400, { yaw: 0.4 }], [300, {}]],
  turn_right: [[300, {}], [400, { yaw: -0.4 }], [300, {}]],
};

/** Synthetic 468-point mesh: eyes at (0.4,0.4)/(0.6,0.4), nose shifted by yaw/pitch. */
function mesh(noseDx = 0, noseDy = 0.08): Point[] {
  const pts: Point[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
  pts[33] = { x: 0.4, y: 0.4 };
  pts[263] = { x: 0.6, y: 0.4 };
  pts[1] = { x: 0.5 + noseDx, y: 0.4 + noseDy };
  pts[10] = { x: 0.5, y: 0.2 };
  pts[152] = { x: 0.5, y: 0.75 };
  pts[234] = { x: 0.32, y: 0.45 };
  pts[454] = { x: 0.68, y: 0.45 };
  return pts;
}

function unit(seed: number, dim = 512): number[] {
  let x = seed;
  const v = Array.from({ length: dim }, () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648 - 0.5;
  });
  return normalise(v);
}
/** A vector with cosine ~`sim` to `base`. */
function near(base: number[], sim: number, seed: number): number[] {
  const noise = unit(seed);
  const d = noise.reduce((s, v, i) => s + v * base[i], 0);
  const orth = normalise(noise.map((v, i) => v - d * base[i]));
  const k = Math.sqrt(1 - sim * sim);
  return normalise(base.map((v, i) => sim * v + k * orth[i]));
}

// ---------------------------------------------------------------- features
describe("face features", () => {
  it("yaw is 0 facing forward and positive when the nose moves toward image-right (person's left)", () => {
    expect(headPose(mesh(0)).yaw).toBeCloseTo(0);
    expect(headPose(mesh(0.06)).yaw).toBeCloseTo(0.3);
    expect(headPose(mesh(-0.06)).yaw).toBeCloseTo(-0.3);
  });
  it("pitch grows when looking down", () => {
    expect(headPose(mesh(0, 0.12)).pitch).toBeGreaterThan(headPose(mesh(0, 0.08)).pitch);
  });
  it("bounding box covers all landmarks", () => {
    const b = boundingBox(mesh());
    expect(b.x).toBeCloseTo(0.32);
    expect(b.w).toBeCloseTo(0.36);
    expect(b.h).toBeCloseTo(0.55);
  });
  it("blendshape averages named scores and treats missing as 0", () => {
    const cats = [{ categoryName: "eyeBlinkLeft", score: 0.8 }, { categoryName: "eyeBlinkRight", score: 0.6 }];
    expect(blendshape(cats, "eyeBlinkLeft", "eyeBlinkRight")).toBeCloseTo(0.7);
    expect(blendshape(cats, "mouthSmileLeft")).toBe(0);
  });
  it("mean luma of pure white and black", () => {
    expect(meanLuma(new Uint8ClampedArray([255, 255, 255, 255]))).toBeCloseTo(255);
    expect(meanLuma(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]))).toBe(0);
  });
  it("guidance checks faces, size, centring and light in order", () => {
    expect(guidance({ faces: 0, box: null, brightness: null })).toBe("no_face");
    expect(guidance({ faces: 2, box: BOX, brightness: 120 })).toBe("multiple_faces");
    expect(guidance({ faces: 1, box: { ...BOX, w: 0.15 }, brightness: 120 })).toBe("move_closer");
    expect(guidance({ faces: 1, box: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }, brightness: 120 })).toBe("move_back");
    expect(guidance({ faces: 1, box: { ...BOX, x: 0.55 }, brightness: 120 })).toBe("center_face");
    expect(guidance({ faces: 1, box: BOX, brightness: 30 })).toBe("too_dark");
    expect(guidance({ faces: 1, box: BOX, brightness: 240 })).toBe("too_bright");
    expect(guidance({ faces: 1, box: BOX, brightness: 120 })).toBe("ok");
  });
});

// ---------------------------------------------------------------- liveness
describe("liveness challenges", () => {
  it("picks 3 distinct challenges, reproducibly with a seeded random", () => {
    const seq = (seed: number) => {
      let s = seed;
      return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    };
    const a = pickChallenges(3, seq(7));
    expect(new Set(a).size).toBe(3);
    expect(a.every((c) => ALL_CHALLENGES.includes(c))).toBe(true);
    expect(pickChallenges(3, seq(7))).toEqual(a);
  });

  it.each(ALL_CHALLENGES)("passes a live %s", (c) => {
    const s = new LivenessSession([c]);
    expect(run(s, stream(ACTION[c])).status).toBe("passed");
  });

  it("passes a full 3-challenge sequence and reports the duration", () => {
    const challenges: Challenge[] = ["turn_right", "blink", "smile"];
    const s = new LivenessSession(challenges);
    const st = run(s, stream(challenges.flatMap((c) => ACTION[c])));
    expect(st.status).toBe("passed");
    if (st.status === "passed") {
      expect(st.challenges).toEqual(challenges);
      expect(st.durationMs).toBeGreaterThan(2000);
    }
  });

  it("a static photo (no change) times out", () => {
    const s = new LivenessSession(["blink"]);
    const st = run(s, stream([[LIVENESS.challengeTimeoutMs + 200, {}]]));
    expect(st).toMatchObject({ status: "failed", reason: "timeout" });
  });

  it("eyes that are always closed never pass blink (needs open -> closed -> open)", () => {
    const s = new LivenessSession(["blink"]);
    expect(run(s, stream([[3000, { blink: 0.9 }]])).status).toBe("running");
  });

  it("starting already smiling does not pass: a neutral face must come first", () => {
    const s = new LivenessSession(["smile"]);
    expect(run(s, stream([[2000, { smile: 0.9 }]])).status).toBe("running");
    expect(run(s, stream([[300, { smile: 0.1 }], [400, { smile: 0.9 }]], 2000)).status).toBe("passed");
  });

  it("a smile flicker shorter than the hold time does not count", () => {
    const s = new LivenessSession(["smile"]);
    expect(run(s, stream([[300, {}], [100, { smile: 0.9 }], [300, {}]])).status).toBe("running");
  });

  it("turning the wrong way does not pass turn_left", () => {
    const s = new LivenessSession(["turn_left"]);
    expect(run(s, stream(ACTION.turn_right)).status).toBe("running");
  });

  it("turning but never coming back to centre does not pass", () => {
    const s = new LivenessSession(["turn_left"]);
    expect(run(s, stream([[300, {}], [2000, { yaw: 0.4 }]])).status).toBe("running");
  });

  it("fails when a second face stays in view", () => {
    const s = new LivenessSession(["blink"]);
    const st = run(s, stream([[300, {}], [LIVENESS.multipleFacesMs + 100, { faces: 2 }]]));
    expect(st).toMatchObject({ status: "failed", reason: "multiple_faces" });
  });

  it("tolerates a one-frame second-face glitch", () => {
    const s = new LivenessSession(["blink"]);
    const frames = stream(ACTION.blink);
    frames.splice(5, 0, { ...frames[5], faces: 2 });
    expect(run(s, frames).status).toBe("passed");
  });

  it("fails when the face disappears for too long (photo swapped out)", () => {
    const s = new LivenessSession(["blink"]);
    const st = run(s, stream([[300, {}], [LIVENESS.faceLostMs + 100, { faces: 0 }]]));
    expect(st).toMatchObject({ status: "failed", reason: "face_lost" });
  });

  it("is final once failed or passed", () => {
    const s = new LivenessSession(["blink"]);
    run(s, stream([[300, {}], [LIVENESS.faceLostMs + 100, { faces: 0 }]]));
    expect(run(s, stream(ACTION.blink, 5000)).status).toBe("failed");
  });
});

// ---------------------------------------------------------------- capture
describe("pose capture plan", () => {
  it("classifies the five poses and rejects big angles", () => {
    expect(classifyPose(0, 0)).toBe("front");
    expect(classifyPose(0.25, 0)).toBe("left");
    expect(classifyPose(-0.25, 0.02)).toBe("right");
    expect(classifyPose(0.02, -0.12)).toBe("up");
    expect(classifyPose(-0.03, 0.12)).toBe("down");
    expect(classifyPose(0.7, 0)).toBeNull();
    expect(classifyPose(0, 0.5)).toBeNull();
    expect(classifyPose(0.25, 0.2)).toBeNull();
  });

  it("asks for poses in order, 2 frames each, with a gap between shots", () => {
    const plan = new CapturePlan(350);
    expect(plan.target).toBe("front");
    expect(plan.shouldCapture({ t: 0, yaw: 0.25 }, 0, true)).toBe(false); // wrong pose
    expect(plan.shouldCapture({ t: 0, yaw: 0 }, 0, false)).toBe(false); // bad framing
    expect(plan.shouldCapture({ t: 0, yaw: 0 }, 0, true)).toBe(true);
    plan.record(0);
    expect(plan.shouldCapture({ t: 100, yaw: 0 }, 0, true)).toBe(false); // too soon
    expect(plan.shouldCapture({ t: 400, yaw: 0 }, 0, true)).toBe(true);
    plan.record(400);
    expect(plan.target).toBe("left");
  });

  it("completes after every pose has its frames", () => {
    const plan = new CapturePlan(0);
    const angle = { front: [0, 0], left: [0.25, 0], right: [-0.25, 0], up: [0, -0.12], down: [0, 0.12] } as const;
    let t = 0;
    while (!plan.done) {
      const [yaw, dp] = angle[plan.target!];
      expect(plan.shouldCapture({ t: (t += 10), yaw }, dp, true)).toBe(true);
      plan.record(t);
    }
    expect(plan.shots).toHaveLength(POSES.length * FRAMES_PER_POSE);
    expect(plan.progress).toBe(1);
    expect(() => plan.record(t + 1)).toThrow();
  });

  it("neutral pitch is the median, once enough samples exist", () => {
    expect(neutralPitch([0.4, 0.41])).toBeNull();
    expect(neutralPitch([0.4, 0.9, 0.41, 0.39, 0.42])).toBe(0.41);
  });
});

// ---------------------------------------------------------------- server rules
describe("enrollment rules", () => {
  const person = unit(1);
  const good = (v: number[], det = 0.8): FaceApiResult => ({ ok: true, embedding: v, det_score: det, face_px: 200, blur: 120, live: true, live_score: 0.99 });

  it("keeps good, consistent images and reports rejected ones with reasons", () => {
    const results: FaceApiResult[] = [
      good(near(person, 0.8, 11)),
      { ok: false, reason: "too_blurry", det_score: 0.7, face_px: 180, blur: 20 },
      good(near(person, 0.8, 12)),
      good(near(person, 0.8, 13)),
      good(unit(99)), // someone else
      good(near(person, 0.8, 14)),
    ];
    const { kept, dropped } = selectEmbeddings(results, ["front", "front", "left", "left", "right", "right"]);
    expect(kept.map((k) => k.index)).toEqual([0, 2, 3, 5]);
    expect(dropped).toEqual([
      { index: 1, pose: "front", reason: "too_blurry" },
      { index: 4, pose: "right", reason: "inconsistent" },
    ]);
  });

  it("photos that are not live (print / screen) are dropped; unclear liveness too; can be relaxed for dev", () => {
    const r = [good(near(person, 0.8, 21)), { ...good(near(person, 0.8, 22)), live: false, live_score: 0.03 }, { ...good(near(person, 0.8, 23)), live: null, live_score: null }];
    const { kept, dropped } = selectEmbeddings(r, ["front", "front", "left"]);
    expect(kept.map((k) => k.index)).toEqual([0]);
    expect(dropped).toEqual([
      { index: 1, pose: "front", reason: "not_live" },
      { index: 2, pose: "left", reason: "liveness_unclear" },
    ]);
    expect(selectEmbeddings(r, ["front", "front", "left"], false).kept).toHaveLength(3);
  });

  it("mean vector is unit length", () => {
    const m = meanVector([unit(1), unit(2), unit(3)]);
    expect(Math.hypot(...m)).toBeCloseTo(1);
  });

  it("flags review when another student is above the duplicate threshold", () => {
    expect(duplicateDecision([])).toEqual({ status: "active", best: null });
    expect(duplicateDecision([{ student_id: "a", similarity: 0.3 }, { student_id: "b", similarity: DUPLICATE_SIMILARITY }]).status).toBe("active");
    const d = duplicateDecision([{ student_id: "a", similarity: 0.3 }, { student_id: "b", similarity: 0.72 }]);
    expect(d).toEqual({ status: "review", best: { student_id: "b", similarity: 0.72 } });
  });

  it("metadata requires a passed liveness with 3 known challenges and 5-10 poses", () => {
    const ok = {
      poses: ["front", "front", "left", "left", "right"],
      liveness: { passed: true, challenges: ["blink", "smile", "turn_left"], duration_ms: 5000 },
      consent_version: "v1",
    };
    expect(enrollMetaSchema.safeParse(ok).success).toBe(true);
    expect(enrollMetaSchema.safeParse({ ...ok, poses: ["front"] }).success).toBe(false);
    expect(enrollMetaSchema.safeParse({ ...ok, poses: [...ok.poses, "sideways"] }).success).toBe(false);
    expect(enrollMetaSchema.safeParse({ ...ok, liveness: { ...ok.liveness, passed: false } }).success).toBe(false);
    expect(enrollMetaSchema.safeParse({ ...ok, liveness: { ...ok.liveness, challenges: ["blink", "jump", "smile"] } }).success).toBe(false);
  });
});

describe("face-api URL publishing", () => {
  it("accepts https hostnames only", async () => {
    const { faceApiUrlSchema } = await import("@/lib/face/url");
    expect(faceApiUrlSchema.safeParse("https://abc-def-123.trycloudflare.com").success).toBe(true);
    expect(faceApiUrlSchema.safeParse("https://face.example.ac.kr").success).toBe(true);
    for (const bad of ["http://abc.trycloudflare.com", "https://abc.com/path", "https://a.com?x=1", "https://user@a.com", "https://a.com:8000", "https://localhost", "https://a.com'); drop table x;--"]) {
      expect(faceApiUrlSchema.safeParse(bad).success).toBe(false);
    }
  });
});
