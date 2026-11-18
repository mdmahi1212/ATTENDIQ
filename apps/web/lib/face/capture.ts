import type { FrameFeatures } from "@/lib/face/features";

/** Enrollment pose set: 2 frames each, auto-captured when the head is in the right direction. */
export type Pose = "front" | "left" | "right" | "up" | "down";
export const POSES: readonly Pose[] = ["front", "left", "right", "up", "down"];
export const FRAMES_PER_POSE = 2;

export const POSE_TEXT: Record<Pose, string> = {
  front: "Look straight at the camera",
  left: "Turn slightly to your left",
  right: "Turn slightly to your right",
  up: "Tilt your chin slightly up",
  down: "Tilt your chin slightly down",
};

/**
 * `pitchDelta` = pitch - neutral pitch measured while looking straight (people differ a lot in the
 * absolute value). Slight angles only: big turns give worse embeddings.
 */
export function classifyPose(yaw: number, pitchDelta: number): Pose | null {
  const ay = Math.abs(yaw);
  if (ay < 0.08 && Math.abs(pitchDelta) < 0.06) return "front";
  if (Math.abs(pitchDelta) < 0.1) {
    if (yaw >= 0.15 && yaw <= 0.45) return "left";
    if (yaw <= -0.15 && yaw >= -0.45) return "right";
  }
  if (ay < 0.12) {
    if (pitchDelta <= -0.07 && pitchDelta >= -0.25) return "up";
    if (pitchDelta >= 0.07 && pitchDelta <= 0.25) return "down";
  }
  return null;
}

export type Shot = { pose: Pose; t: number };

/** Decides when to take the next picture. */
export class CapturePlan {
  readonly shots: Shot[] = [];
  private lastShotAt = -Infinity;

  constructor(private readonly minGapMs = 350) {}

  /** The pose we are currently asking for, or null when done. */
  get target(): Pose | null {
    for (const p of POSES) if (this.count(p) < FRAMES_PER_POSE) return p;
    return null;
  }

  get done(): boolean {
    return this.target === null;
  }

  get progress(): number {
    return this.shots.length / (POSES.length * FRAMES_PER_POSE);
  }

  count(p: Pose): number {
    return this.shots.filter((s) => s.pose === p).length;
  }

  /** True when this frame should be captured (caller then grabs the image and calls `record`). */
  shouldCapture(f: Pick<FrameFeatures, "t" | "yaw">, pitchDelta: number, framingOk: boolean): boolean {
    const target = this.target;
    if (!target || !framingOk) return false;
    if (f.t - this.lastShotAt < this.minGapMs) return false;
    return classifyPose(f.yaw, pitchDelta) === target;
  }

  record(t: number): Shot {
    const pose = this.target;
    if (!pose) throw new Error("capture already complete");
    const shot = { pose, t };
    this.shots.push(shot);
    this.lastShotAt = t;
    return shot;
  }
}

/** Median of the pitch values seen while looking straight: the person's neutral pitch. */
export function neutralPitch(samples: number[]): number | null {
  if (samples.length < 5) return null;
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
