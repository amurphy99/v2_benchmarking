/* The smiley's breathing: a steady rhythm, and single breaths steered to a chosen moment.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/behavior/breathing`

Breathing shows as the face growing a little on each breath in. The rhythm is a
phase that runs one breath per period, quicker in than out. Its period and depth
ease toward the current state's (slower and deeper while asleep), so changing
state never jumps.

A deliberate breath (`take`) takes over from the rhythm. It rises from the size
showing now to a deeper peak that lands at a chosen time, holds there (for a set
time, or until `release`), breathes out to the bottom of a breath, and hands
back to the rhythm at the start of its next breath in, so the size never jumps.

The yawn takes one, and so does the breath before speaking. `prepareToSpeak`
aims the peak just before the voice will be heard: at the time the page gives,
or (when the page can't know it) at the gap measured on earlier turns. The hold
lets go once the avatar starts speaking.

The face controller plays this as the passive motions' continuous "breath"
channel (`passiveMotions.ts`), so it runs under every other layer.

*/
import { smoothstep } from "../actions/faceMotions";

// Rhythm while awake and while asleep (`depth` is the size change at the top of a breath, as a fraction)
const SMILEY_BREATH_AWAKE  = {periodMs: 4_000, depth: 0.012};
const SMILEY_BREATH_ASLEEP = {periodMs: 6_500, depth: 0.03 };

// Rhythm shape and how it follows a change of state
const SMILEY_BREATH_IN_SHARE     = 0.4;   // Share of each breath spent breathing in
const SMILEY_BREATH_EASE_PER_SEC = 0.5;   // How quickly the period and depth move to a new state's (settles over a few breaths)

// Deliberate breaths
const SMILEY_BREATH_MAX_HOLD_MS      = 2_500;   // A breath held for a release lets go after this long anyway
const SMILEY_BREATH_RELEASE_AFTER_MS =   200;   // A release before the top lets the breath in run on this long (the voice starts about then)

// Breath before speaking: its size and breath out (also a plan's breath when it leaves them out)
export const SMILEY_SPEECH_BREATH_PEAK = 0.022;   // Size change at the top (a little deeper than a resting breath)
export const SMILEY_SPEECH_EXHALE_MS   = 2_500;   // Breath out as it starts talking (speech uses that air)

// ...and its timing
const SMILEY_SPEECH_BREATH_MIN_IN_MS = 250;   // Shortest breath in, however soon the voice comes
const SMILEY_SPEECH_BREATH_EARLY_MS  =  50;   // How long before the voice the breath tops out
const SMILEY_SPEECH_VOICE_LAG_MS     = 200;   // "speaking" turns on this long before the voice is heard (`bufferAhead` in `useAudioPlayer`)

// Learned gap from `prepareToSpeak` to "speaking", for pages that can't say when the voice comes
const SMILEY_SPEECH_GAP_START_MS = 600;     // Guess before the first measured turn
const SMILEY_SPEECH_GAP_MIN_MS   = 300;     // Range the learned gap stays in (one very slow turn can't push later breaths far early)
const SMILEY_SPEECH_GAP_MAX_MS   = 2_000;
const SMILEY_SPEECH_GAP_LEARN    = 0.3;     // Share of each new measurement taken into the running average


// --------------------------------------------------------------------------------
// Breathing Types
// --------------------------------------------------------------------------------
// One deliberate breath
export type BreathPlan = {
    inMs     : number;          // Time to the top of the breath
    peak     : number;          // Size change at the top, as a fraction
    holdMs   : number | null;   // Time held at the top (null holds until `release`, up to `SMILEY_BREATH_MAX_HOLD_MS`)
    exhaleMs : number;          // Time to breathe out to the bottom of a breath
};

// The deliberate breath being taken (`outStartMs` is set once it starts breathing out)
type TakenBreath = {plan: BreathPlan; startMs: number; from: number; releasedAt: number | null; outStartMs: number | null; outFrom: number};

// What the face controller drives
export type Breathing = {
    step           : (nowMs: number, dtSec: number) => number;   // This frame's size change, as a fraction
    setAsleep      : (asleep: boolean) => void;                   // Switch to the sleeping rhythm, or back
    take           : (plan: BreathPlan, nowMs: number) => void;   // Take one deliberate breath (replaces one already being taken)
    release        : (nowMs: number) => void;                     // Let go of a breath held for a release
    prepareToSpeak : (nowMs: number, inMs?: number) => void;      // Breathe in for speech heard in `inMs` (the learned gap when unknown)
    speechStarted  : (nowMs: number) => void;                     // The avatar started speaking (lets go, and measures the gap)
};


// ================================================================================
// Breathing
// ================================================================================
// Start the rhythm at the bottom of a breath, awake
export function createBreathing(): Breathing {
    // Rhythm, and the deliberate breath (if any) that has taken over from it
    let phase  : number = 0;   // Position in the rhythm's breath, 0 to 1 (0 is the bottom)
    let target = SMILEY_BREATH_AWAKE;
    let period = target.periodMs;
    let depth  = target.depth;
    let breath : TakenBreath | null = null;
    let shown  : number = -depth;   // Size change shown last frame (a new breath starts from it)

    // Breath before speaking: when the page last said speech was coming, and the gap learned so far
    let preparedAt : number | null = null;
    let gapMs      : number        = SMILEY_SPEECH_GAP_START_MS;

    const take = (plan: BreathPlan, nowMs: number): void => {
        breath = {plan, startMs: nowMs, from: shown, releasedAt: null, outStartMs: null, outFrom: 0};
    };
    const release = (nowMs: number): void => {
        if (breath !== null) breath.releasedAt = nowMs;
    };

    // --------------------------------------------------------------------------------
    // Frame Step
    // --------------------------------------------------------------------------------
    const step = (nowMs: number, dtSec: number): number => {
        // 1) Ease the rhythm toward the state's period and depth
        const ease = 1 - Math.exp(-SMILEY_BREATH_EASE_PER_SEC * dtSec);
        period += (target.periodMs - period) * ease;
        depth  += (target.depth    - depth ) * ease;

        // 2) The rhythm alone
        if (breath === null) {
            phase = (phase + ((dtSec * 1_000) / period)) % 1;
            shown = depth * rhythmShape(phase);
            return shown;
        }

        // 3) A deliberate breath in, then held until its time is up or it is let go
        const {plan} = breath;
        const peakAt = breath.startMs + plan.inMs;
        if (breath.outStartMs === null) {
            if (nowMs < letGoTime(breath, peakAt)) {
                shown = (nowMs < peakAt) ? breath.from + ((plan.peak - breath.from) * smoothstep((nowMs - breath.startMs) / plan.inMs)) : plan.peak;
                return shown;
            }
            breath.outStartMs = nowMs;
            breath.outFrom    = shown;
        }

        // 4) Breathe out to the bottom of a breath, then hand back to the rhythm there
        const u = (nowMs - breath.outStartMs) / plan.exhaleMs;
        if (u >= 1) {
            breath = null;
            phase  = 0;
            shown  = -depth;
            return shown;
        }
        shown = breath.outFrom + ((-depth - breath.outFrom) * smoothstep(u));
        return shown;
    };

    // --------------------------------------------------------------------------------
    // Breath Before Speaking
    // --------------------------------------------------------------------------------
    // Aim the top of the breath just before the voice (an unknown time uses the learned gap)
    const prepareToSpeak = (nowMs: number, inMs?: number): void => {
        const untilVoiceMs = inMs ?? (gapMs + SMILEY_SPEECH_VOICE_LAG_MS);
        preparedAt = nowMs;
        take({inMs: Math.max(SMILEY_SPEECH_BREATH_MIN_IN_MS, untilVoiceMs - SMILEY_SPEECH_BREATH_EARLY_MS), peak: SMILEY_SPEECH_BREATH_PEAK, holdMs: null, exhaleMs: SMILEY_SPEECH_EXHALE_MS}, nowMs);
    };

    // Let go as it starts speaking, and fold this turn's gap into the learned one
    const speechStarted = (nowMs: number): void => {
        release(nowMs);
        if (preparedAt === null) return;
        const learned = gapMs + (((nowMs - preparedAt) - gapMs) * SMILEY_SPEECH_GAP_LEARN);
        gapMs      = Math.min(SMILEY_SPEECH_GAP_MAX_MS, Math.max(SMILEY_SPEECH_GAP_MIN_MS, learned));
        preparedAt = null;
    };

    return {
        step,
        setAsleep : (asleep: boolean): void => { target = asleep ? SMILEY_BREATH_ASLEEP : SMILEY_BREATH_AWAKE; },
        take,
        release,
        prepareToSpeak,
        speechStarted,
    };
}


// --------------------------------------------------------------------------------
// Breath Helpers
// --------------------------------------------------------------------------------
// When a deliberate breath starts breathing out: at the end of its hold, or soon after a release
function letGoTime(breath: TakenBreath, peakAt: number): number {
    const holdEnd = peakAt + (breath.plan.holdMs ?? SMILEY_BREATH_MAX_HOLD_MS);
    if (breath.releasedAt === null) return holdEnd;

    // Released before the top: the breath in runs on only briefly; after it: let go now
    const afterRelease = (breath.releasedAt < peakAt) ? Math.min(peakAt, breath.releasedAt + SMILEY_BREATH_RELEASE_AFTER_MS) : breath.releasedAt;
    return Math.min(holdEnd, afterRelease);
}

// One breath, -1 (bottom) up to 1 (top) and back, quicker in than out, at a phase from 0 to 1
function rhythmShape(phase: number): number {
    if (phase < SMILEY_BREATH_IN_SHARE) return -Math.cos(Math.PI * (phase / SMILEY_BREATH_IN_SHARE));
    return Math.cos(Math.PI * ((phase - SMILEY_BREATH_IN_SHARE) / (1 - SMILEY_BREATH_IN_SHARE)));
}
