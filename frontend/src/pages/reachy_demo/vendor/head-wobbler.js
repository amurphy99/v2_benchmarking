// @ts-check
/**
 * Head wobble generator — browser port of the current Python
 * `reachy_mini.motion.speech_tapper` + `head_wobbler` implementation.
 *
 * Takes the assistant's voice and drives small, organic head sways + nods in
 * sync with the speech. All constants are the production-tuned values.
 *
 * Adaptations for this page (vs the mobile original):
 * - input is an upstream AnalyserNode from the WS client's audio pipeline
 *   (we chain our own AnalyserNode off it) instead of a MediaStreamTrack —
 *   we never own or close the AudioContext;
 * - no timer: the motion layer pumps us from its rAF loop. The original used
 *   a worker-backed interval because plain setInterval is throttled to ~1Hz
 *   in unfocused/hidden pages; rAF throttles by VISIBILITY instead, and a
 *   robot that isn't rendered has nothing to wobble;
 * - self-gating by design (hysteretic VAD on the assistant audio), so the
 *   caller can leave it attached across all conversational states.
 */

// ─── Constants ported from speech_tapper.py ─────────────────────────────
const HOP_MS = 50; // one offsets sample every 50ms (20Hz)
const FRAME_MS = 20; // RMS window in ms

// Loudness mapping: RMS in dBFS remapped to [0..1] with a slight gamma.
const SWAY_DB_LOW = -46;
const SWAY_DB_HIGH = -18;
const SWAY_DB_GAMMA = 0.9;
const SWAY_MASTER = 1.5;
const SENS_DB_OFFSET = 4;

// Hysteretic VAD thresholds on the sliding-frame dBFS envelope.
const VAD_DB_ON = -35;
const VAD_DB_OFF = -45;
// Attack / release for the 0→1 envelope follower that multiplies the sway.
const ENV_FOLLOW_GAIN = 0.65;

// Sinusoid frequencies (Hz) + peak amplitudes. Rotations are degrees here and
// translations are metres, matching the SDK after its mm -> m conversion.
const SWAY_F_PITCH = 2.2;
const SWAY_A_PITCH_DEG = 4.5;
const SWAY_F_YAW = 0.6;
const SWAY_A_YAW_DEG = 7.5;
const SWAY_F_ROLL = 1.3;
const SWAY_A_ROLL_DEG = 2.25;
const SWAY_F_X = 0.35;
const SWAY_A_X_M = 0.0045;
const SWAY_F_Y = 0.45;
const SWAY_A_Y_M = 0.00375;
const SWAY_F_Z = 0.25;
const SWAY_A_Z_M = 0.00225;

// Default delay between the audio analysed and the matching head motion. The
// demo can override it live while comparing browser motion with the robot.
const DEFAULT_MOVEMENT_LATENCY_MS = 50;

/** @typedef {{ x: number, y: number, z: number, roll: number, pitch: number, yaw: number }} HeadOffsets */
/** @typedef {{ offsets: HeadOffsets, capturedAtMs: number, readyAtMs: number }} PendingHeadOffsets */

export class HeadWobbler {
  /**
   * @param {{ upstream: AnalyserNode, onOffsets: (o: HeadOffsets) => void, gain?: number, latencyMs?: number }} options
   *   upstream: analyser on the assistant output (from the WS client);
   *   onOffsets: called at ~20Hz with translations in metres and rotations in degrees.
   */
  constructor(options) {
    this._upstream = options.upstream;
    this._onOffsets = options.onOffsets;
    this._gain = options.gain ?? 1.0;
    this._latencyMs = Math.max(0, options.latencyMs ?? DEFAULT_MOVEMENT_LATENCY_MS);

    /** @type {AnalyserNode | null} */
    this._analyser = null;
    /** @type {Float32Array<ArrayBuffer> | null} */
    this._frameBuf = null;
    this._lastPump = 0;
    this._acc = 0;

    // Sway state
    this._t = 0; // seconds since start() for the sine oscillators
    this._swayEnv = 0; // 0..1 envelope follower on VAD on/off
    this._vadOn = false;
    /** @type {PendingHeadOffsets[]} */
    this._pending = [];

    // Exact phases produced by the SDK's np.random.default_rng(seed=7), in its
    // pitch, yaw, roll, x, y, z draw order.
    this._phasePitch = 3.927590651355011;
    this._phaseYaw = 5.637360571650786;
    this._phaseRoll = 4.873776931938056;
    this._phaseX = 1.4150185072200883;
    this._phaseY = 1.8860003910648933;
    this._phaseZ = 5.488698173149897;
  }

  start() {
    if (this._analyser) return; // already running
    const ctx = this._upstream.context;
    const analyser = ctx.createAnalyser();
    // 1024 @ 48kHz ≈ 21ms of time-domain samples — the Python frame size.
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    this._upstream.connect(analyser);
    this._analyser = analyser;
    const frameSamples = Math.min(
      analyser.fftSize,
      Math.max(128, Math.round((ctx.sampleRate * FRAME_MS) / 1000))
    );
    this._frameBuf = new Float32Array(frameSamples);
    this._lastPump = 0;
    this._acc = 0;
  }

  /**
   * Advance the wobbler; call once per animation frame with performance.now().
   * Runs one _tick per elapsed HOP_MS, capped so a long hidden stretch
   * doesn't burst-drain as a spasm.
   * @param {number} nowMs
   */
  pump(nowMs) {
    if (!this._analyser) return;
    if (this._lastPump) this._acc += nowMs - this._lastPump;
    this._lastPump = nowMs;
    this._acc = Math.min(this._acc, 4 * HOP_MS);
    while (this._acc >= HOP_MS) {
      this._acc -= HOP_MS;
      this._tick(nowMs - this._acc);
    }

    // Scheduling runs on every rendered frame, independently of the 50 ms
    // analysis cadence. This makes a 10 ms latency setting meaningful instead
    // of rounding it up to a whole analysis hop. If frames are late, skip
    // stale intermediate poses and render the newest pose that is ready.
    let latest = null;
    while (this._pending[0]?.readyAtMs <= nowMs) {
      latest = this._pending.shift()?.offsets ?? latest;
    }
    if (latest) this._onOffsets(latest);
  }

  stop() {
    if (this._analyser) {
      // Targeted disconnect only — a bare upstream.disconnect() would also
      // sever the speakers.
      try { this._upstream.disconnect(this._analyser); } catch { /* already gone */ }
      this._analyser = null;
    }
    this._frameBuf = null;
    this._pending = [];
    // Return to neutral so the head doesn't freeze mid-motion.
    this._onOffsets({ x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 });
  }

  /** Fade motion out when the user barges in on the assistant. */
  reset() {
    this._swayEnv = 0;
    this._vadOn = false;
    this._pending = [];
    this._onOffsets({ x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 });
  }

  /** Change the motion buffer without rebuilding the audio graph.
   * @param {number} latencyMs */
  setLatencyMs(latencyMs) {
    if (!Number.isFinite(latencyMs)) return;
    this._latencyMs = Math.max(0, latencyMs);
    // Retime samples already in flight so dragging the control applies on the
    // next animation frame rather than only to newly analysed audio.
    for (const pending of this._pending) {
      pending.readyAtMs = pending.capturedAtMs + this._latencyMs;
    }
  }

  /** @param {number} capturedAtMs */
  _tick(capturedAtMs) {
    if (!this._analyser || !this._frameBuf) return;

    // 1. Loudness in dBFS on the most recent ~20ms.
    this._analyser.getFloatTimeDomainData(this._frameBuf);
    const db = rmsDbfs(this._frameBuf) + SENS_DB_OFFSET;

    // 2. Hysteretic VAD on the dB envelope.
    if (this._vadOn) {
      if (db < VAD_DB_OFF) this._vadOn = false;
    } else if (db > VAD_DB_ON) {
      this._vadOn = true;
    }

    // 3. Smooth 0..1 envelope the sines are modulated by.
    this._swayEnv += ((this._vadOn ? 1 : 0) - this._swayEnv) * ENV_FOLLOW_GAIN;

    // 4. Loudness gain — how much of the max amplitude this hop reaches.
    const loud = loudnessGain(db);

    // 5. Time-evolve the oscillators.
    this._t += HOP_MS / 1000;
    const twoPiT = 2 * Math.PI * this._t;
    const mod = loud * this._swayEnv * this._gain * SWAY_MASTER;
    const offsets = {
      pitch: SWAY_A_PITCH_DEG * mod * Math.sin(twoPiT * SWAY_F_PITCH + this._phasePitch),
      yaw: SWAY_A_YAW_DEG * mod * Math.sin(twoPiT * SWAY_F_YAW + this._phaseYaw),
      roll: SWAY_A_ROLL_DEG * mod * Math.sin(twoPiT * SWAY_F_ROLL + this._phaseRoll),
      x: SWAY_A_X_M * mod * Math.sin(twoPiT * SWAY_F_X + this._phaseX),
      y: SWAY_A_Y_M * mod * Math.sin(twoPiT * SWAY_F_Y + this._phaseY),
      z: SWAY_A_Z_M * mod * Math.sin(twoPiT * SWAY_F_Z + this._phaseZ),
    };

    // 6. Schedule this sample against the browser clock. pump() releases it on
    // the first animation frame at or after the requested timestamp.
    this._pending.push({
      offsets,
      capturedAtMs,
      readyAtMs: capturedAtMs + this._latencyMs,
    });
  }
}

/** @param {Float32Array<ArrayBufferLike>} samples */
function rmsDbfs(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  if (rms <= 1e-8) return -120;
  return 20 * Math.log10(rms);
}

/** Linear remap [SWAY_DB_LOW..SWAY_DB_HIGH] -> [0..1] with a gamma.
 * @param {number} db */
function loudnessGain(db) {
  const norm = (db - SWAY_DB_LOW) / (SWAY_DB_HIGH - SWAY_DB_LOW);
  return Math.pow(Math.max(0, Math.min(1, norm)), SWAY_DB_GAMMA);
}
