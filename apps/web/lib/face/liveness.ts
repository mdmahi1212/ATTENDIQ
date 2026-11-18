import type { FrameFeatures } from "@/lib/face/features";

/**
 * Active liveness: a random sequence of 3 challenges. Each challenge needs a CHANGE (open->closed->open,
 * neutral->smile, centre->turn->centre), which a printed photo or a frozen screen cannot produce.
 * Pure state machine: feed frames, read the state. Reused by enrollment and self-verify.
 */

export type Challenge = "blink" | "turn_left" | "turn_right" | "smile";
export const ALL_CHALLENGES: readonly Challenge[] = ["blink", "turn_left", "turn_right", "smile"];

export const CHALLENGE_TEXT: Record<Challenge, string> = {
  blink: "Blink your eyes",
  turn_left: "Turn your head to your left, then back",
  turn_right: "Turn your head to your right, then back",
  smile: "Smile",
};

export const LIVENESS = {
  eyesOpen: 0.25,
  eyesClosed: 0.5,
  smileOff: 0.3,
  smileOn: 0.55,
  smileHoldMs: 250,
  yawCentre: 0.12,
  yawTurn: 0.28,
  challengeTimeoutMs: 8000,
  faceLostMs: 1000,
  multipleFacesMs: 300,
} as const;

export type LivenessState =
  | { status: "running"; index: number; challenge: Challenge; step: number; total: number }
  | { status: "passed"; challenges: Challenge[]; durationMs: number }
  | { status: "failed"; reason: "timeout" | "face_lost" | "multiple_faces"; challenge: Challenge };

/** Pick `n` distinct challenges with an injectable random source (tests pass a seeded one). */
export function pickChallenges(n = 3, random: () => number = Math.random): Challenge[] {
  const pool = [...ALL_CHALLENGES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

export class LivenessSession {
  private index = 0;
  private step = 0; // progress inside the current challenge
  private challengeStart: number | null = null;
  private sessionStart: number | null = null;
  private lastFaceAt: number | null = null;
  private multiSince: number | null = null;
  private smileSince: number | null = null;
  private result: LivenessState | null = null;

  constructor(readonly challenges: Challenge[]) {
    if (challenges.length === 0) throw new Error("need at least one challenge");
  }

  get state(): LivenessState {
    if (this.result) return this.result;
    return { status: "running", index: this.index, challenge: this.challenges[this.index], step: this.step, total: this.challenges.length };
  }

  feed(f: FrameFeatures): LivenessState {
    if (this.result) return this.result;
    this.sessionStart ??= f.t;
    this.challengeStart ??= f.t;
    const challenge = this.challenges[this.index];

    // Exactly one face must stay in view the whole time (no swapping a photo in mid-way).
    if (f.faces > 1) {
      this.multiSince ??= f.t;
      if (f.t - this.multiSince >= LIVENESS.multipleFacesMs) return this.fail("multiple_faces", challenge);
      return this.state;
    }
    this.multiSince = null;
    if (f.faces === 0) {
      if (this.lastFaceAt !== null && f.t - this.lastFaceAt >= LIVENESS.faceLostMs) return this.fail("face_lost", challenge);
      if (f.t - this.challengeStart >= LIVENESS.challengeTimeoutMs) return this.fail("timeout", challenge);
      return this.state;
    }
    this.lastFaceAt = f.t;

    if (this.advance(challenge, f)) {
      this.index += 1;
      this.step = 0;
      this.smileSince = null;
      this.challengeStart = f.t;
      if (this.index >= this.challenges.length) {
        this.result = { status: "passed", challenges: [...this.challenges], durationMs: f.t - (this.sessionStart ?? f.t) };
        return this.result;
      }
      return this.state;
    }
    if (f.t - this.challengeStart >= LIVENESS.challengeTimeoutMs) return this.fail("timeout", challenge);
    return this.state;
  }

  /** Returns true when the challenge is complete. `step` tracks the phases. */
  private advance(c: Challenge, f: FrameFeatures): boolean {
    switch (c) {
      case "blink":
        if (this.step === 0 && f.blink < LIVENESS.eyesOpen) this.step = 1; // eyes open
        else if (this.step === 1 && f.blink > LIVENESS.eyesClosed) this.step = 2; // closed
        else if (this.step === 2 && f.blink < LIVENESS.eyesOpen) return true; // open again
        return false;
      case "smile":
        if (this.step === 0 && f.smile < LIVENESS.smileOff) this.step = 1; // neutral first
        else if (this.step === 1 && f.smile > LIVENESS.smileOn) {
          this.smileSince ??= f.t;
          if (f.t - this.smileSince >= LIVENESS.smileHoldMs) return true;
        } else if (this.step === 1) this.smileSince = null;
        return false;
      case "turn_left":
      case "turn_right": {
        const dir = c === "turn_left" ? 1 : -1; // yaw > 0 = the person's left
        if (this.step === 0 && Math.abs(f.yaw) < LIVENESS.yawCentre) this.step = 1;
        else if (this.step === 1 && dir * f.yaw > LIVENESS.yawTurn) this.step = 2;
        else if (this.step === 2 && Math.abs(f.yaw) < LIVENESS.yawCentre) return true;
        return false;
      }
    }
  }

  private fail(reason: "timeout" | "face_lost" | "multiple_faces", challenge: Challenge): LivenessState {
    this.result = { status: "failed", reason, challenge };
    return this.result;
  }
}
