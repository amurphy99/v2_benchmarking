// @ts-check
/**
 * Procedural motion for the 3D Reachy Mini: turns the app's conversational
 * state + live audio levels into robot-frame targets for RobotViewer.
 *
 * Base behavior per state (breathing, perking up, thinking, speech wobble,
 * droop) + primary emotion and dance moves the model can trigger with tools.
 * All output is in the robot frame (X fwd, Y left, Z up, metres/rad),
 * so this layer could later be swapped for a real daemon state stream.
 */

import * as THREE from "three";
// @ts-ignore -- the query string is intentional browser cache busting.
import { HeadWobbler } from "./head-wobbler.js";

// Visual calibration knobs — flip if a direction reads wrong on the rig.
const PITCH_DOWN = 1; // +pitch tilts the head down
const ANT_UP = 1; // +antenna value points antennas up/forward

// How fast the pose blends when the conversational state changes (seconds).
const STATE_BLEND_S = 0.7;
// Mic level smoothing (like the orb: snappy attack, gentle release).
const MIC_ATTACK = 0.5;
const MIC_RELEASE = 0.12;
// Match the physical robot's breathing move: 15 degrees at 0.5 Hz. The shared
// semantic value becomes opposite-signed joint targets via toJointAntennas(),
// making the antennas open and close symmetrically.
const BREATHING_ANTENNA_SWAY = THREE.MathUtils.degToRad(15);
const BREATHING_ANTENNA_HZ = 0.5;
// The official conversation app freezes antennas while user speech is active,
// then blends them back into their current move after VAD reports speech stop.
const ANTENNA_UNFREEZE_BLEND_S = 0.4;
// Keep dance timing identical to reachy_mini_dances_library 0.2.1.
export const DANCE_BPM = 114;
const DANCE_BEATS_PER_SECOND = DANCE_BPM / 60;
const DEG = Math.PI / 180;

const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)");

/** @typedef {{ x: number, y: number, z: number, roll: number, pitch: number, yaw: number, bodyYaw: number, antennas: [number, number] }} Pose */

/** @returns {Pose} */
const zeroPose = () => ({ x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0, bodyYaw: 0, antennas: [0, 0] });

/** Convert semantic right/left "up" values to the robot's mirrored joint signs.
 * @param {[number, number]} antennas @returns {[number, number]} */
const toJointAntennas = (antennas) => [-antennas[0], antennas[1]];

/** @param {number} u */
const smoothstep = (u) => u * u * (3 - 2 * u);

/** Exact port of the dance library's oscillation_motion primitive.
 * @param {number} tBeats @param {number} amplitude @param {number} subcycles
 * @param {number} [phaseOffset] @param {"sin" | "triangle" | "square"} [waveform] */
function oscillation(tBeats, amplitude, subcycles, phaseOffset = 0, waveform = "sin") {
  const phase = 2 * Math.PI * (subcycles * tBeats + phaseOffset);
  if (waveform === "triangle") return amplitude * (2 / Math.PI) * Math.asin(Math.sin(phase));
  if (waveform === "square") return amplitude * Math.sign(Math.sin(phase));
  return amplitude * Math.sin(phase);
}

/** Exact port of the dance library's transient_motion primitive.
 * @param {number} tBeats @param {number} amplitude @param {number} duration
 * @param {number} [delay] @param {number} [repeatEvery] */
function transientMotion(tBeats, amplitude, duration, delay = 0, repeatEvery = 0) {
  const start = repeatEvery > 0
    ? Math.floor((tBeats - delay) / repeatEvery) * repeatEvery + delay
    : delay;
  if (start <= tBeats && tBeats < start + duration) {
    return amplitude * smoothstep((tBeats - start) / duration);
  }
  return 0;
}

/** Return semantic antenna values that become the library's exact joint
 * offsets after toJointAntennas() applies the GLB's mirrored left joint.
 * @param {number} tBeats @param {number} amplitude @param {number} subcycles
 * @param {"wiggle" | "both"} [move] @param {number} [phaseOffset]
 * @param {"sin" | "triangle" | "square"} [waveform] @returns {[number, number]} */
function danceAntennas(tBeats, amplitude, subcycles, move = "wiggle", phaseOffset = 0, waveform = "sin") {
  const value = oscillation(tBeats, amplitude, subcycles, phaseOffset, waveform);
  return move === "both" ? [-value, value] : [-value, -value];
}

/** Normal idle antenna motion used before and after the listening freeze.
 * @param {number} t @returns {[number, number]} */
const breathingAntennas = (t) => {
  const sway = ANT_UP * BREATHING_ANTENNA_SWAY
    * Math.sin(2 * Math.PI * BREATHING_ANTENNA_HZ * t);
  return [sway, sway];
};

// ── Base behaviors ──────────────────────────────────────────────────────────
// Each returns a Pose given time t (s), mic level (0..1) and AI voice level
// (0..1). Amplitudes: head z reach is ~+26/-50 mm; angles in radians.

/** @type {Record<string, (t: number, mic: number, ai: number) => Pose>} */
const BEHAVIORS = {
  idle(t) {
    const p = zeroPose();
    p.z = 0.004 * Math.sin((2 * Math.PI * t) / 4.6); // slow breathing
    p.pitch = PITCH_DOWN * 0.02 * Math.sin((2 * Math.PI * t) / 5.3 + 1.2);
    // pseudo-random gaze drift from incommensurate sines
    p.yaw = 0.08 * Math.sin(0.31 * t) + 0.05 * Math.sin(0.13 * t + 2.1);
    p.roll = 0.02 * Math.sin(0.17 * t + 0.7);
    p.bodyYaw = 0.05 * Math.sin(0.09 * t);
    p.antennas = breathingAntennas(t);
    return p;
  },
  listening(t, mic) {
    const p = zeroPose();
    p.z = 0.008 + 0.003 * Math.sin((2 * Math.PI * t) / 3.8); // perked up
    p.pitch = PITCH_DOWN * (-0.04 + mic * 0.08); // attentive, nods to the voice
    p.yaw = 0.03 * Math.sin(0.23 * t);
    p.roll = 0.015 * Math.sin(0.19 * t + 1);
    p.antennas = breathingAntennas(t);
    return p;
  },
  "user-speaking"(t, mic) {
    const p = BEHAVIORS.listening(t, mic, 0);
    p.pitch += PITCH_DOWN * mic * 0.05;
    p.roll += 0.02 * Math.sin((2 * Math.PI * t) / 2.6);
    return p;
  },
  processing(t) {
    const p = zeroPose();
    p.z = 0.006;
    p.pitch = PITCH_DOWN * -0.12; // look up…
    p.yaw = 0.22 + 0.02 * Math.sin(1.1 * t); // …and aside: thinking
    p.roll = 0.06;
    p.antennas = breathingAntennas(t);
    return p;
  },
  "ai-speaking"(t) {
    // All dynamic head motion while talking comes from the official 6-DOF
    // HeadWobbler; antennas keep their normal breathing move.
    const p = zeroPose();
    p.z = 0.004;
    p.pitch = PITCH_DOWN * -0.02;
    p.antennas = breathingAntennas(t);
    return p;
  },
  error(t) {
    const p = zeroPose();
    p.z = -0.02;
    p.pitch = PITCH_DOWN * 0.22; // droop
    p.yaw = 0.02 * Math.sin(0.2 * t);
    p.antennas = [ANT_UP * -0.5, ANT_UP * -0.5];
    return p;
  },
};
// States without a behavior of their own fall back to idle (connecting,
// queued, your-turn…).

// ── Recorded emotion library ────────────────────────────────────────────────
// This is the conversation app's resolver verbatim in data form. The selected
// motion is fetched from the pinned official dataset through the same-origin
// server route and sampled as a primary full-body trajectory at its native
// 50 Hz timestamps.
const CURATED_EMOTION_MOVES = [
  "anxiety1", "boredom2", "dance2", "dance3", "downcast1", "dying1",
  "exhausted1", "grateful1", "helpful1", "loving1", "rage1", "reprimand1",
  "resigned1", "sad1", "sad2", "scared1", "sleep1", "surprised1",
  "thoughtful1", "welcoming2", "amazed1", "attentive1", "attentive2",
  "boredom1", "confused1", "disgusted1", "displeased1", "displeased2",
  "fear1", "impatient2", "irritated1", "irritated2", "laughing1",
  "laughing2", "lonely1", "no1", "no_excited1", "no_sad1", "reprimand2",
  "shy1", "success1", "success2", "surprised2", "thoughtful2", "uncertain1",
  "understanding2", "yes1",
];

/** @type {Record<string, string[]>} */
export const EMOTION_INTENT_TO_MOVES = {
  happy: ["laughing2", "laughing1"],
  excited: ["dance3", "dance2"],
  loving: ["loving1"],
  grateful: ["grateful1"],
  success: ["success1", "success2"],
  thinking: ["thoughtful1", "thoughtful2"],
  attentive: ["attentive1", "attentive2"],
  confused: ["confused1"],
  uncertain: ["uncertain1"],
  sad: ["sad1", "sad2", "downcast1"],
  downcast: ["downcast1", "sad1"],
  lonely: ["lonely1"],
  angry: ["rage1", "irritated2", "irritated1"],
  irritated: ["irritated1", "irritated2", "displeased2"],
  displeased: ["displeased1", "displeased2"],
  disgusted: ["disgusted1"],
  scared: ["scared1", "fear1", "anxiety1"],
  anxious: ["anxiety1", "fear1", "scared1"],
  surprised: ["surprised1", "surprised2", "amazed1"],
  amazed: ["amazed1", "surprised1"],
  calming: ["calming1"],
  relief: ["relief1", "relief2"],
  impatient: ["impatient2"],
  embarrassed: ["shy1"],
  bored: ["boredom2", "boredom1"],
  tired: ["exhausted1", "sleep1"],
  sleepy: ["sleep1", "exhausted1"],
  yes: ["yes1", "understanding2"],
  yes_understanding: ["understanding2"],
  no: ["no1"],
  no_sad: ["no_sad1"],
  no_excited: ["no_excited1"],
  no_firm: ["no1"],
  welcoming: ["welcoming2"],
  greeting: ["welcoming2"],
  goodbye: ["loving1", "welcoming2"],
  go_away: ["go_away1"],
  helpful: ["helpful1"],
  dance: ["dance2", "dance3"],
  electric: ["electric1"],
  dying: ["dying1"],
};

const ALLOWED_EMOTION_MOVES = new Set([
  ...CURATED_EMOTION_MOVES,
  ...Object.values(EMOTION_INTENT_TO_MOVES).flat(),
]);

/** @param {unknown} value */
function normalizeEmotionKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Match the nuanced intent fallback used by the official app.
 * @param {string} key @returns {string | null} */
function keywordEmotionIntent(key) {
  const tokens = new Set(key.split("_"));
  /** @type {Array<[string[], string]>} */
  const patterns = [
    [["no", "sad"], "no_sad"],
    [["no", "excited"], "no_excited"],
    [["no", "firm"], "no_firm"],
    [["yes", "understanding"], "yes_understanding"],
  ];
  for (const [words, intent] of patterns) {
    if (words.every((word) => tokens.has(word))) return intent;
  }
  return null;
}

/** Resolve an intent or recorded ID exactly like the conversation app.
 * @param {unknown} requested @returns {string} */
export function resolveEmotionName(requested) {
  const key = normalizeEmotionKey(requested);
  if (key && key !== "random" && ALLOWED_EMOTION_MOVES.has(key)) return key;
  const intent = EMOTION_INTENT_TO_MOVES[key] ? key : keywordEmotionIntent(key);
  const candidate = intent ? EMOTION_INTENT_TO_MOVES[intent]?.[0] : null;
  if (candidate) return candidate;
  return CURATED_EMOTION_MOVES[Math.floor(Math.random() * CURATED_EMOTION_MOVES.length)];
}

/** @typedef {{ name: string, times: number[], frames: Array<{ head: number[][], antennas: number[], body_yaw?: number }>, duration: number }} RecordedEmotionClip */

/** Validate the dataset payload before it enters the animation loop.
 * @param {string} name @param {unknown} payload @returns {RecordedEmotionClip} */
export function parseEmotionClip(name, payload) {
  const data = /** @type {any} */ (payload);
  const times = data?.time;
  const frames = data?.set_target_data;
  if (!Array.isArray(times) || !Array.isArray(frames) || times.length < 2 || times.length !== frames.length) {
    throw new Error(`Invalid trajectory for ${name}.`);
  }
  // RecordedMove.duration is the timestamp span (last - first), even though
  // evaluate() receives elapsed time starting at zero.
  const duration = Number(times[times.length - 1]) - Number(times[0]);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid duration for ${name}.`);
  return { name, times, frames, duration };
}

/** Load a recorded pose and project its rounded 3x3 block back onto SO(3),
 * matching scipy Rotation.from_matrix in the robot SDK. Dataset matrices are
 * serialized to six decimals, so two Newton polar iterations remove that
 * rounding skew before quaternion interpolation.
 * @param {THREE.Matrix4} matrix @param {number[][]} rows */
function setRigidMatrixFromRows(matrix, rows) {
  if (!Array.isArray(rows) || rows.length !== 4 || rows.some((row) => !Array.isArray(row) || row.length !== 4)) {
    throw new Error("Invalid recorded head pose.");
  }
  let a = Number(rows[0][0]); let b = Number(rows[0][1]); let c = Number(rows[0][2]);
  let d = Number(rows[1][0]); let e = Number(rows[1][1]); let f = Number(rows[1][2]);
  let g = Number(rows[2][0]); let h = Number(rows[2][1]); let i = Number(rows[2][2]);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error("Invalid recorded head rotation.");
    const invDet = 1 / det;
    const ia = (e * i - f * h) * invDet;
    const ib = (f * g - d * i) * invDet;
    const ic = (d * h - e * g) * invDet;
    const id = (c * h - b * i) * invDet;
    const ie = (a * i - c * g) * invDet;
    const iff = (b * g - a * h) * invDet;
    const ig = (b * f - c * e) * invDet;
    const ih = (c * d - a * f) * invDet;
    const ii = (a * e - b * d) * invDet;
    a = 0.5 * (a + ia); b = 0.5 * (b + ib); c = 0.5 * (c + ic);
    d = 0.5 * (d + id); e = 0.5 * (e + ie); f = 0.5 * (f + iff);
    g = 0.5 * (g + ig); h = 0.5 * (h + ih); i = 0.5 * (i + ii);
  }
  matrix.set(
    a, b, c, rows[0][3],
    d, e, f, rows[1][3],
    g, h, i, rows[2][3],
    0, 0, 0, 1,
  );
}

/** Flatten a three.js matrix into the row-major wire format used by the
 * daemon and RobotViewer. @param {THREE.Matrix4} matrix @returns {number[]} */
function matrixToRowMajor(matrix) {
  const e = matrix.elements;
  return [
    e[0], e[4], e[8], e[12],
    e[1], e[5], e[9], e[13],
    e[2], e[6], e[10], e[14],
    e[3], e[7], e[11], e[15],
  ];
}

// Faithful JavaScript port of the twenty public moves in
// reachy_mini_dances_library 0.2.1. Tracks take musical time in beats and use
// the package's default amplitudes, phases, waveforms, paths and durations.
/** @type {Record<string, { beats: number, track: (tBeats: number) => Partial<Pose> }>} */
export const DANCES = {
  simple_nod: { beats: 4, track(t) {
    return {
      pitch: oscillation(t, 20 * DEG, 1),
      antennas: danceAntennas(t, 45 * DEG, 1),
    };
  } },
  head_tilt_roll: { beats: 4, track(t) {
    return {
      roll: oscillation(t, 15 * DEG, 0.5),
      antennas: danceAntennas(t, 45 * DEG, 0.5),
    };
  } },
  side_to_side_sway: { beats: 4, track(t) {
    return {
      y: oscillation(t, 0.04, 0.5),
      antennas: danceAntennas(t, 45 * DEG, 0.5),
    };
  } },
  dizzy_spin: { beats: 4, track(t) {
    return {
      roll: oscillation(t, 15 * DEG, 0.25),
      pitch: oscillation(t, 15 * DEG, 0.25, 0.25),
      antennas: danceAntennas(t, 45 * DEG, 0.25),
    };
  } },
  stumble_and_recover: { beats: 4, track(t) {
    return {
      y: oscillation(t, 0.015, 0.25, 0.5),
      pitch: oscillation(t, 10 * DEG, 0.5),
      yaw: oscillation(t, 25 * DEG, 0.25),
      antennas: danceAntennas(t, 50 * DEG, 0.25, "both"),
    };
  } },
  headbanger_combo: { beats: 4, track(t) {
    return {
      z: oscillation(t, 0.015, 1, 0.1),
      pitch: oscillation(t, 30 * DEG, 1),
      antennas: danceAntennas(t, 40 * DEG, 1, "both"),
    };
  } },
  interwoven_spirals: { beats: 8, track(t) {
    return {
      roll: oscillation(t, 15 * DEG, 0.125),
      pitch: oscillation(t, 20 * DEG, 0.25, 0.25),
      yaw: oscillation(t, 25 * DEG, 0.5, 0.5),
      antennas: danceAntennas(t, 45 * DEG, 0.125),
    };
  } },
  sharp_side_tilt: { beats: 6, track(t) {
    return {
      roll: oscillation(t, 22 * DEG, 1, 0, "triangle"),
      antennas: danceAntennas(t, 45 * DEG, 1, "wiggle", 0, "triangle"),
    };
  } },
  side_peekaboo: { beats: 10, track(t) {
    const phase = t % 10;
    let y = 0;
    let z = 0;
    let pitch = 0;
    if (phase < 1) {
      z = -0.04 * smoothstep(phase);
    } else if (phase < 3) {
      const u = (phase - 1) / 2;
      z = -0.04 * (1 - smoothstep(u));
      y = 0.03 * smoothstep(u);
      pitch = 20 * DEG * Math.sin(u * Math.PI);
    } else if (phase < 5) {
      const u = (phase - 3) / 2;
      z = -0.04 * smoothstep(u);
      y = 0.03 * (1 - smoothstep(u));
    } else if (phase < 7) {
      const u = (phase - 5) / 2;
      z = -0.04 * (1 - smoothstep(u));
      y = -0.03 * smoothstep(u);
      pitch = -20 * DEG * Math.sin(u * Math.PI);
    } else if (phase < 9) {
      const u = (phase - 7) / 2;
      z = -0.04 * smoothstep(u);
      y = -0.03 * (1 - smoothstep(u));
    } else {
      z = -0.04 * (1 - smoothstep(phase - 9));
    }
    return {
      y, z, pitch,
      antennas: danceAntennas(t, 60 * DEG, 0.5, "both"),
    };
  } },
  yeah_nod: { beats: 4, track(t) {
    const first = transientMotion(t, 15 * DEG, 0.4, 0, 1);
    const second = transientMotion(t, 15 * DEG * 0.7, 0.3, 0.5, 1);
    return {
      pitch: first + second,
      antennas: danceAntennas(t, 20 * DEG, 1, "both"),
    };
  } },
  uh_huh_tilt: { beats: 4, track(t) {
    const value = oscillation(t, 15 * DEG, 0.5);
    return {
      roll: value,
      pitch: value,
      antennas: danceAntennas(t, 45 * DEG, 0.5),
    };
  } },
  neck_recoil: { beats: 4, track(t) {
    return {
      x: transientMotion(t, -0.015, 0.6, 0, 2),
      antennas: danceAntennas(t, 45 * DEG, 0.5),
    };
  } },
  chin_lead: { beats: 4, track(t) {
    return {
      x: oscillation(t, 0.02, 0.5),
      pitch: oscillation(t, 15 * DEG, 0.5, -0.25),
      antennas: danceAntennas(t, 45 * DEG, 0.5),
    };
  } },
  groovy_sway_and_roll: { beats: 4, track(t) {
    return {
      y: oscillation(t, 0.03, 0.5),
      roll: oscillation(t, 15 * DEG, 0.5, 0.25),
      antennas: danceAntennas(t, 45 * DEG, 0.5),
    };
  } },
  chicken_peck: { beats: 4, track(t) {
    return {
      x: transientMotion(t, 0.02, 0.8, 0, 1),
      pitch: transientMotion(t, 0.1, 0.8, 0, 1),
      antennas: danceAntennas(t, 30 * DEG, 1, "both"),
    };
  } },
  side_glance_flick: { beats: 4, track(t) {
    const phase = t % 4;
    let yaw;
    if (phase < 0.5) yaw = 45 * DEG * smoothstep(phase / 0.5);
    else if (phase < 1.5) yaw = 45 * DEG;
    else yaw = 45 * DEG * (1 - smoothstep((phase - 1.5) / 2.5));
    return {
      yaw,
      antennas: danceAntennas(t, 45 * DEG, 0.25),
    };
  } },
  polyrhythm_combo: { beats: 6, track(t) {
    return {
      y: oscillation(t, 0.02, 1 / 3),
      pitch: oscillation(t, 10 * DEG, 1 / 2),
      antennas: danceAntennas(t, 45 * DEG, 1),
    };
  } },
  grid_snap: { beats: 4, track(t) {
    const step = Math.floor((t % 4) / (4 / 5));
    let pitch = 0;
    let yaw = 0;
    if (step === 0) [yaw, pitch] = [20 * DEG, 20 * DEG];
    else if (step === 1) [yaw, pitch] = [20 * DEG, -20 * DEG];
    else if (step === 2) [yaw, pitch] = [-20 * DEG, -20 * DEG];
    else if (step === 3) [yaw, pitch] = [-20 * DEG, 20 * DEG];
    return {
      pitch, yaw,
      antennas: danceAntennas(t, 10 * DEG, 0.25, "both"),
    };
  } },
  pendulum_swing: { beats: 4, track(t) {
    return {
      roll: oscillation(t, 25 * DEG, 0.25),
      antennas: danceAntennas(t, 45 * DEG, 0.25),
    };
  } },
  jackson_square: { beats: 10, track(t) {
    const phase = t % 10;
    const leg = Math.floor(phase / 2);
    const points = [
      [0, -0.01], [0.035, 0.015], [-0.035, 0.015],
      [-0.035, -0.035], [0.035, -0.035],
    ];
    const start = points[leg];
    const end = points[(leg + 1) % points.length];
    const progress = smoothstep((phase % 2) / 2);
    const direction = (-1) ** Math.floor(t / 2);
    return {
      y: start[0] + (end[0] - start[0]) * progress,
      z: start[1] + (end[1] - start[1]) * progress,
      roll: direction * transientMotion(t, 20 * DEG, 0.3, 1.85, 2),
      antennas: danceAntennas(t, 45 * DEG, 0.2),
    };
  } },
};

/** Add one procedural move offset to the current base pose.
 * @param {Pose} pose @param {Partial<Pose>} off */
function addPoseOffset(pose, off) {
  for (const k of /** @type {(keyof Pose)[]} */ (Object.keys(off))) {
    if (k === "antennas") {
      pose.antennas[0] += off.antennas?.[0] ?? 0;
      pose.antennas[1] += off.antennas?.[1] ?? 0;
    } else {
      pose[k] += /** @type {number} */ (off[k]);
    }
  }
}

export class RobotMotion {
  /** @param {import("./gltf-robot.js").RobotViewer} viewer */
  constructor(viewer) {
    this._viewer = viewer;
    this._state = "idle";
    this._mic = 0;
    this._t0 = performance.now() / 1000;
    this._lastUpdate = this._t0;
    this._idleTime = 0;
    this._idleGaze = "duck";
    this._idleNextLook = 4 + Math.random() * 2;
    this._idleNextEmotion = 12 + Math.random() * 6;
    this._idleEmotion = false;
    this._idleYaw = 0;
    this._idlePitch = 0;
    this._idleBodyYaw = 0;
    /** @type {{ name: string, start: number, clip: RecordedEmotionClip } | null} */
    this._emotion = null;
    this._emotionLoadId = 0;
    /** @type {Map<string, RecordedEmotionClip>} */
    this._emotionClips = new Map();
    /** @type {{ name: string, start: number, repeat: number } | null} */
    this._dance = null;
    // state-change blend: freeze the last output and ease into the new base
    /** @type {Pose | null} */
    this._blendFrom = null;
    this._blendStart = 0;
    /** @type {Pose} */
    this._last = zeroPose();
    /** @type {[number, number] | null} */
    this._frozenAntennas = null;
    /** @type {number | null} */
    this._antennaReleaseStart = null;
    this._skipAntennaStateBlend = false;
    this._frame = 0;
    // Speech-synced 6-DOF head offsets (metres/radians), fed by the HeadWobbler
    // when assistant audio is attached. VAD-gated at the source, so they're
    // zero whenever the assistant is silent.
    this._wobble = { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 };
    /** @type {HeadWobbler | null} */
    this._wobbler = null;
    this._wobbleLatencyMs = 50;
    // scratch for matrix building
    this._euler = new THREE.Euler(0, 0, 0, "ZYX");
    this._quat = new THREE.Quaternion();
    this._pos = new THREE.Vector3();
    this._one = new THREE.Vector3(1, 1, 1);
    this._mat = new THREE.Matrix4();
    // Recorded-emotion interpolation scratch (no per-frame matrix allocation).
    this._clipMatA = new THREE.Matrix4();
    this._clipMatB = new THREE.Matrix4();
    this._clipMatOut = new THREE.Matrix4();
    this._clipPosA = new THREE.Vector3();
    this._clipPosB = new THREE.Vector3();
    this._clipPosOut = new THREE.Vector3();
    this._clipQuatA = new THREE.Quaternion();
    this._clipQuatB = new THREE.Quaternion();
    this._clipQuatOut = new THREE.Quaternion();
    this._clipScale = new THREE.Vector3();
    this._clipEuler = new THREE.Euler(0, 0, 0, "ZYX");
  }

  /** @param {string} state one of main.js's AppStates */
  setState(state) {
    if (state === this._state) return;
    const now = performance.now() / 1000;
    // Only spontaneous idle emotions yield to a new conversation. Requested
    // emotions/dances retain their existing independent playback behavior.
    if (state !== "idle" && this._idleEmotion) this.stopEmotion();
    // Barge-in: fade the speech wobble out instead of holding the last sway.
    if (state === "user-speaking") this._wobbler?.reset();
    if (state === "user-speaking") {
      // Server-side VAD has detected actual user speech. Freeze at the exact
      // last rendered pose, like MovementManager.set_listening(True).
      this._frozenAntennas = [...this._last.antennas];
      this._antennaReleaseStart = null;
      this._skipAntennaStateBlend = true;
    } else if (this._state === "user-speaking" && this._frozenAntennas) {
      // speech_stopped transitions to processing; resume the current base move
      // smoothly instead of jumping to wherever its sine phase has advanced.
      this._antennaReleaseStart = now;
      this._skipAntennaStateBlend = true;
    }
    this._state = state;
    // A physical dance is the primary pose and keeps running independently of
    // conversational posture changes. Do not attenuate it with a state blend.
    if (this._dance || this._emotion) return;
    this._blendFrom = { ...this._last, antennas: [...this._last.antennas] };
    this._blendStart = now;
  }

  /** Quiet, browser-only attention shifts while no conversation is active.
   * @param {number} t @param {number} dt @returns {Pose} */
  _idlePose(t, dt) {
    this._idleTime += dt;
    if (this._idleTime >= this._idleNextLook) {
      this._idleGaze = this._idleGaze === "duck" ? "viewer" : "duck";
      this._idleNextLook = this._idleTime + 3 + Math.random() * 4;
    }
    if (this._idleTime >= this._idleNextEmotion &&
        !this._emotion && !this._dance && !this._idleEmotion) {
      this._idleNextEmotion = this._idleTime + 35 + Math.random() * 20;
      this._idleGaze = "viewer";
      this._idleNextLook = this._idleTime + 7;
      // These short official gestures use the existing cached trajectory
      // loader. No speech, inference, timers, or extra animation loop.
      void this.playEmotion(Math.random() < 0.5 ? "yes1" : "welcoming2", true)
        .catch((error) => {
          if (this._idleEmotion && !this._emotion) this._idleEmotion = false;
          console.warn("[robot] Idle emotion unavailable:", error);
        });
    }
    const duck = this._viewer._microduck?.root.position;
    const watching = this._idleGaze === "duck" && !!duck;
    // Display forward is +Z. Let the body carry most of the turn. The head
    // shares the remaining turn, without chasing the full bearing while
    // the body is still catching up and twisting across the neck platform.
    const bearing = watching ? Math.atan2(duck.x, duck.z) : 0;
    const bodyYaw = THREE.MathUtils.clamp(bearing * 0.7, -0.95, 0.95);
    this._idleBodyYaw += THREE.MathUtils.clamp(
      (bodyYaw - this._idleBodyYaw) * (1 - Math.exp(-1.8 * dt)),
      -0.65 * dt, 0.65 * dt,
    );
    const yaw = THREE.MathUtils.clamp(bearing - bodyYaw, -0.4, 0.4);
    const pitch = watching ? 0.14 : 0;
    const blend = 1 - Math.exp(-1.8 * dt);
    this._idleYaw += (yaw - this._idleYaw) * blend;
    this._idlePitch += (pitch - this._idlePitch) * blend;
    const pose = BEHAVIORS.idle(t, 0, 0);
    pose.yaw = this._idleYaw;
    pose.pitch += PITCH_DOWN * this._idlePitch;
    pose.z += 0.004; // Keep a little clearance above the shell while looking down.
    pose.bodyYaw = this._idleBodyYaw;
    return pose;
  }

  /**
   * Start speech-synced head wobble from the live session's assistant audio.
   * @param {AnalyserNode | null} upstream the WS client's output analyser
   */
  attachAssistantAudio(upstream) {
    this.detachAssistantAudio();
    if (!upstream) return;
    const DEG = Math.PI / 180;
    this._wobbler = new HeadWobbler({
      upstream,
      latencyMs: this._wobbleLatencyMs,
      onOffsets: (/** @type {{ x: number, y: number, z: number, roll: number, pitch: number, yaw: number }} */ o) => {
        this._wobble.x = o.x;
        this._wobble.y = o.y;
        this._wobble.z = o.z;
        this._wobble.roll = o.roll * DEG;
        this._wobble.pitch = o.pitch * DEG;
        this._wobble.yaw = o.yaw * DEG;
      },
    });
    this._wobbler.start();
  }

  /** Update both the active wobbler and the value used for future sessions.
   * @param {number} latencyMs */
  setWobbleLatency(latencyMs) {
    if (!Number.isFinite(latencyMs)) return;
    this._wobbleLatencyMs = Math.max(0, latencyMs);
    this._wobbler?.setLatencyMs(this._wobbleLatencyMs);
  }

  detachAssistantAudio() {
    this._wobbler?.stop();
    this._wobbler = null;
  }

  /** Raw mic RMS from the client's input-level events. @param {number} rms */
  setMicLevel(rms) {
    const level = Math.min(1, rms * 4); // speech RMS is small; expand to ~0..1
    const k = level > this._mic ? MIC_ATTACK : MIC_RELEASE;
    this._mic += (level - this._mic) * k;
  }

  /** Fetch and play the official recorded move resolved from an emotion intent.
   * @param {string} name @param {boolean} [idle]
   * @returns {Promise<{ name: string, duration: number } | null>} */
  async playEmotion(name, idle = false) {
    this._idleEmotion = idle;
    const resolved = resolveEmotionName(name);
    const loadId = ++this._emotionLoadId;
    let clip = this._emotionClips.get(resolved);
    if (!clip) {
      const response = await fetch(`/reachy-demo/emotions/${encodeURIComponent(resolved)}.json`);
      if (!response.ok) {
        let detail = `Could not load the official "${resolved}" emotion.`;
        try {
          const body = await response.json();
          if (typeof body?.detail === "string") detail = body.detail;
        } catch { /* keep the useful fallback */ }
        throw new Error(detail);
      }
      clip = parseEmotionClip(resolved, await response.json());
      this._emotionClips.set(resolved, clip);
    }
    if (loadId !== this._emotionLoadId) return null;
    if (idle && (this._state !== "idle" || REDUCED_MOTION?.matches || document.hidden)) {
      this._idleEmotion = false;
      return null;
    }
    this._dance = null;
    this._blendFrom = idle ? { ...this._last, antennas: [...this._last.antennas] } : null;
    this._blendStart = performance.now() / 1000;
    this._emotion = { name: resolved, start: performance.now() / 1000, clip };
    return { name: resolved, duration: clip.duration };
  }

  /** @returns {boolean} */
  stopEmotion() {
    this._idleEmotion = false;
    this._emotionLoadId += 1;
    if (!this._emotion) return false;
    this._emotion = null;
    this._blendFrom = { ...this._last, antennas: [...this._last.antennas] };
    this._blendStart = performance.now() / 1000;
    return true;
  }

  /** Play one of the browser-native counterparts to the official dance set.
   * @param {string} name @param {number} [repeat]
   * @returns {{ name: string, repeat: number, duration: number } | null} */
  playDance(name, repeat = 1) {
    const requested = String(name || "").trim();
    const choices = Object.keys(DANCES);
    const resolved = requested || choices[Math.floor(Math.random() * choices.length)];
    const def = DANCES[resolved];
    if (!def) return null;
    const requestedCount = Number(repeat);
    const count = Number.isFinite(requestedCount) ? Math.max(1, Math.round(requestedCount)) : 1;
    this._emotionLoadId += 1;
    this._emotion = null;
    this._idleEmotion = false;
    this._blendFrom = null;
    this._dance = { name: resolved, start: performance.now() / 1000, repeat: count };
    return { name: resolved, repeat: count, duration: (def.beats / DANCE_BEATS_PER_SECOND) * count };
  }

  /** @returns {boolean} */
  stopDance() {
    if (!this._dance) return false;
    this._dance = null;
    this._blendFrom = { ...this._last, antennas: [...this._last.antennas] };
    this._blendStart = performance.now() / 1000;
    return true;
  }

  /** Sample one official recorded trajectory using the same interval lookup,
   * linear translation/joint interpolation and quaternion SLERP as
   * reachy_mini.motion.recorded_move.RecordedMove.
   * @param {RecordedEmotionClip} clip @param {number} elapsed */
  _sampleEmotion(clip, elapsed) {
    let lo = 0;
    let hi = clip.times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (elapsed < clip.times[mid]) hi = mid;
      else lo = mid + 1;
    }
    const prevIndex = lo > 0 ? lo - 1 : 0;
    const nextIndex = lo < clip.times.length ? lo : prevIndex;
    const prevTime = clip.times[prevIndex];
    const nextTime = clip.times[nextIndex];
    const alpha = nextTime === prevTime ? 0 : (elapsed - prevTime) / (nextTime - prevTime);
    const prev = clip.frames[prevIndex];
    const next = clip.frames[nextIndex];

    setRigidMatrixFromRows(this._clipMatA, prev.head);
    setRigidMatrixFromRows(this._clipMatB, next.head);
    this._clipMatA.decompose(this._clipPosA, this._clipQuatA, this._clipScale);
    this._clipMatB.decompose(this._clipPosB, this._clipQuatB, this._clipScale);
    this._clipPosOut.lerpVectors(this._clipPosA, this._clipPosB, alpha);
    this._clipQuatOut.copy(this._clipQuatA).slerp(this._clipQuatB, alpha);
    this._clipMatOut.compose(this._clipPosOut, this._clipQuatOut, this._one);
    this._clipEuler.setFromQuaternion(this._clipQuatOut, "ZYX");

    const prevAntennas = prev.antennas;
    const nextAntennas = next.antennas;
    const left = prevAntennas[0] + (nextAntennas[0] - prevAntennas[0]) * alpha;
    const right = prevAntennas[1] + (nextAntennas[1] - prevAntennas[1]) * alpha;
    const prevBodyYaw = Number(prev.body_yaw) || 0;
    const nextBodyYaw = Number(next.body_yaw) || 0;
    const bodyYaw = prevBodyYaw + (nextBodyYaw - prevBodyYaw) * alpha;

    return {
      pose: {
        x: this._clipPosOut.x,
        y: this._clipPosOut.y,
        z: this._clipPosOut.z,
        roll: this._clipEuler.x,
        pitch: this._clipEuler.y,
        yaw: this._clipEuler.z,
        bodyYaw,
        // Store semantic values; toJointAntennas restores the dataset's exact
        // mirrored left/right joint values at the renderer boundary.
        antennas: /** @type {[number, number]} */ ([-left, right]),
      },
      headPose: matrixToRowMajor(this._clipMatOut),
    };
  }

  start() {
    if (this._frame) return;
    const tick = () => {
      this._frame = requestAnimationFrame(tick);
      this._update();
    };
    this._frame = requestAnimationFrame(tick);
  }

  _update() {
    const now = performance.now() / 1000;
    const dt = Math.max(0, Math.min(0.05, now - this._lastUpdate));
    this._lastUpdate = now;
    if (document.hidden) return;
    const t = now - this._t0;
    this._wobbler?.pump(now * 1000);
    // AI voice level: the WS client's visualiser publishes it as a CSS var.
    const ai = parseFloat(document.documentElement.style.getPropertyValue("--ai-audio-level")) || 0;
    const reduced = !!REDUCED_MOTION?.matches;
    if (reduced && this._idleEmotion) this.stopEmotion();

    const behavior = BEHAVIORS[this._state] || BEHAVIORS.idle;
    const idlePose = this._state === "idle" && !reduced ? this._idlePose(t, dt) : null;

    // The physical app treats a dance as the primary pose, starting from
    // neutral rather than adding it to listening/speaking posture. Advance it
    // in musical beats at the library's native 114 BPM.
    let dancing = false;
    let danceTrack = null;
    if (this._dance) {
      const def = DANCES[this._dance.name];
      const elapsed = now - this._dance.start;
      const duration = def.beats / DANCE_BEATS_PER_SECOND;
      const cycle = elapsed / duration;
      if (cycle >= this._dance.repeat) {
        this._dance = null;
        this._blendFrom = { ...this._last, antennas: [...this._last.antennas] };
        this._blendStart = now;
      } else {
        dancing = true;
        const cycleElapsed = elapsed - Math.floor(cycle) * duration;
        danceTrack = def.track(cycleElapsed * DANCE_BEATS_PER_SECOND);
      }
    }

    let emotionActive = false;
    let emotionSample = null;
    if (this._emotion) {
      const elapsed = now - this._emotion.start;
      if (elapsed >= this._emotion.clip.duration) {
        this._emotion = null;
        this._idleEmotion = false;
        this._blendFrom = { ...this._last, antennas: [...this._last.antennas] };
        this._blendStart = now;
      } else {
        emotionActive = true;
        emotionSample = this._sampleEmotion(this._emotion.clip, Math.max(0, elapsed));
      }
    }

    // Dances and recorded emotions are primary moves in the physical app, so
    // neither is mixed with the current conversational posture.
    const pose = dancing
      ? zeroPose()
      : emotionSample?.pose || idlePose || behavior(t, this._mic, ai);
    if (danceTrack) addPoseOffset(pose, danceTrack);
    const primaryMotion = dancing || emotionActive;

    // Speech wobble: additive official 6-DOF offsets, silent unless the
    // assistant is audibly speaking (VAD-gated in the wobbler).
    if (!primaryMotion) {
      pose.x += this._wobble.x;
      pose.y += this._wobble.y;
      pose.z += this._wobble.z;
      pose.roll += this._wobble.roll;
      pose.pitch += PITCH_DOWN * this._wobble.pitch;
      pose.yaw += this._wobble.yaw;
    }

    // Reduced motion: keep the expressive posture, drop most of the dance.
    if (reduced) {
      for (const k of /** @type {("roll" | "yaw" | "bodyYaw")[]} */ (["roll", "yaw", "bodyYaw"])) {
        pose[k] *= 0.25;
      }
      pose.pitch *= 0.4;
      pose.x *= 0.4;
      pose.y *= 0.4;
      pose.z *= 0.4;
    }

    // State-change blend: ease from the frozen last pose into the new base.
    if (this._blendFrom) {
      const u = (now - this._blendStart) / STATE_BLEND_S;
      if (u >= 1) {
        this._blendFrom = null;
        this._skipAntennaStateBlend = false;
      } else {
        const s = smoothstep(u);
        const from = this._blendFrom;
        for (const k of /** @type {("x" | "y" | "z" | "roll" | "pitch" | "yaw" | "bodyYaw")[]} */ ([
          "x", "y", "z", "roll", "pitch", "yaw", "bodyYaw",
        ])) {
          pose[k] = from[k] + (pose[k] - from[k]) * s;
        }
        // Listening has its own exact freeze and 0.4s release below. Let other
        // state changes retain the gentler general-purpose antenna blend.
        if (!this._skipAntennaStateBlend) {
          pose.antennas[0] = from.antennas[0] + (pose.antennas[0] - from.antennas[0]) * s;
          pose.antennas[1] = from.antennas[1] + (pose.antennas[1] - from.antennas[1]) * s;
        }
      }
    }

    // Apply this after base moves, primary moves and ordinary state blends,
    // matching the physical app's final antenna control layer.
    if (this._state === "user-speaking" && this._frozenAntennas) {
      pose.antennas = [...this._frozenAntennas];
    } else if (this._antennaReleaseStart !== null && this._frozenAntennas) {
      const u = (now - this._antennaReleaseStart) / ANTENNA_UNFREEZE_BLEND_S;
      if (u >= 1) {
        this._antennaReleaseStart = null;
        this._frozenAntennas = null;
      } else {
        const s = smoothstep(Math.max(0, u));
        pose.antennas[0] = this._frozenAntennas[0]
          + (pose.antennas[0] - this._frozenAntennas[0]) * s;
        pose.antennas[1] = this._frozenAntennas[1]
          + (pose.antennas[1] - this._frozenAntennas[1]) * s;
      }
    }
    this._last = pose;

    // Pose -> robot-frame 4x4 (row-major, as the daemon would stream it).
    let headPose = !reduced && emotionActive && !this._blendFrom ? emotionSample?.headPose : null;
    if (!headPose) {
      this._euler.set(pose.roll, pose.pitch, pose.yaw, "ZYX");
      this._quat.setFromEuler(this._euler);
      this._pos.set(pose.x, pose.y, pose.z);
      this._mat.compose(this._pos, this._quat, this._one);
      headPose = matrixToRowMajor(this._mat);
    }

    this._viewer.setTarget({
      headPose,
      bodyYaw: pose.bodyYaw,
      antennas: toJointAntennas(pose.antennas),
      primaryMotion,
    });
  }
}


// Cancel animation and invalidate pending emotion loads on React unmount.
RobotMotion.prototype.dispose = function () {
    cancelAnimationFrame(this._frame);
    this._frame = 0;

    this.stopEmotion();
    this.stopDance();
    this.detachAssistantAudio();
};
