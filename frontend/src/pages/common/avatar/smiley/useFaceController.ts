/* Drive the smiley avatar's face: expressions, motions, gaze, blinks, and speech.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/useFaceController`

Each animation frame combines several layers into one `FaceState`:

  1) the expression, which moves into a new mood over a fixed short time, holds
     for `duration_ms` once fully shown, then moves back to the resting face
     (what "Neutral" means; the page can pick it with `setRestingExpression`)
  2) a named motion's offsets (nod, look around, ...) on top of the expression
  3) gaze: a point the page sets, else one picked by the conversation state,
     else small idle glances
  4) blinks at random gaps
  5) a slow breathing scale
  6) the mouth following the voice level the page reports

The handle methods only write refs, so the page can call them as often as it
likes; the frame loop reads them on its next tick.

The constants below are the tuning knobs for these layers. Motion sizes and
speeds live in `faceMotions.ts`, and each mood's look in `faceState.ts`.

*/
import { useEffect, useMemo, useRef, useState } from "react";

// From this project
import type { AvatarHandle, ConversationState, RobotAction  } from "../avatarRegistry";
import type { FaceMotion, MotionOffsets                     } from "./faceMotions";
import      { motionFor                                     } from "./faceMotions";
import type { FaceState                                     } from "./faceState";
import      { blendFace, expressionFor, SMILEY_BASE_FACE    } from "./faceState";

// Expression changes (fixed-length eases, so a timed emotion is fully shown for its whole duration)
const SMILEY_EXPRESSION_IN_MS  = 180;   // Moving into a new expression
const SMILEY_EXPRESSION_OUT_MS = 400;   // Moving back to Neutral when an expression's time is up

// Easing rates (how quickly each layer closes the gap to its target, per second)
const SMILEY_GAZE_EASE_PER_SEC   = 14;   // Eyes jumping to a new point
const SMILEY_STATE_EASE_PER_SEC  = 5;    // Conversation-state looks fading in and out
const SMILEY_SPEECH_EASE_PER_SEC = 30;   // Mouth following the voice level

// Blinks
const SMILEY_BLINK_INTERVAL_MIN_MS   = 2_500;   // Shortest gap between blinks
const SMILEY_BLINK_INTERVAL_MAX_MS   = 6_000;   // Longest gap between blinks
const SMILEY_BLINK_DURATION_MS       = 160;     // One close-and-open
const SMILEY_THINKING_BLINK_SLOWDOWN = 1.8;     // Blink gaps stretch by this much while thinking

// Idle glances
const SMILEY_GLANCE_INTERVAL_MIN_MS = 1_200;   // Shortest time between glances
const SMILEY_GLANCE_INTERVAL_MAX_MS = 3_500;   // Longest time between glances
const SMILEY_GLANCE_RANGE           = 0.35;    // Farthest a glance strays from center (gaze units)
const SMILEY_GLANCE_CENTER_CHANCE   = 0.4;     // Chance a glance comes back to center

// Conversation-state looks
const SMILEY_THINKING_GAZE       = {x: 0.55, y: -0.55};   // Eyes drift up and to the side
const SMILEY_LISTENING_EYE_BOOST = 0.08;                  // Extra eye size while listening

// Breathing
const SMILEY_BREATH_PERIOD_MS = 4_000;   // One breath in and out
const SMILEY_BREATH_SCALE     = 0.012;   // Size change at the top of a breath

// Mouth openness at full voice level
const SMILEY_SPEECH_MOUTH_GAIN = 0.9;

// Longest step one frame may take (a tab coming back from the background would otherwise jump)
const SMILEY_MAX_FRAME_SEC = 0.1;

// A gaze point, -1 to 1 on each axis
type GazePoint = {x: number; y: number};

// A motion and when it started
type PlayingMotion = {motion: FaceMotion; startMs: number};

// One expression change: from the face showing when it started to its target, over a fixed time
type ExpressionTransition = {from: FaceState; to: FaceState; startMs: number; lengthMs: number};


// ================================================================================
// Face Controller
// ================================================================================
// Run the face's frame loop and return the latest face plus the avatar handle that steers it
export function useFaceController(
    browsAlways : boolean,   // Keep the eyebrows showing on every expression (the "Smiley + eyebrows" avatar)
): {face: FaceState; handle: AvatarHandle} {
    // Latest combined face (set once per animation frame)
    const [face, setFace] = useState<FaceState>(SMILEY_BASE_FACE);

    // --------------------------------------------------------------------------------
    // Layer State
    // --------------------------------------------------------------------------------
    // Expression: the change playing now, the face it has reached, and when it returns to Neutral
    const transitionRef = useRef<ExpressionTransition>({from: SMILEY_BASE_FACE, to: SMILEY_BASE_FACE, startMs: 0, lengthMs: SMILEY_EXPRESSION_IN_MS});
    const expressionRef = useRef<FaceState>(SMILEY_BASE_FACE);
    const releaseAtRef  = useRef<number | null>(null);

    // Neutral: the face to rest on (the base face until the page picks another), and whether it is showing
    const restingRef = useRef<FaceState>(SMILEY_BASE_FACE);
    const atRestRef  = useRef<boolean>(true);

    // When the latest emotion arrived (its own clock times the tear, so one drip fits its hold)
    const emotionStartRef = useRef<number>(0);

    // Start moving from the face showing now to another one
    const startTransition = (to: FaceState, lengthMs: number, nowMs: number): void => {
        transitionRef.current = {from: expressionRef.current, to, startMs: nowMs, lengthMs};
        atRestRef.current     = (to === restingRef.current);
    };

    // Motion playing now (null when none)
    const motionRef = useRef<PlayingMotion | null>(null);

    // Inputs from the page
    const gazeTargetRef   = useRef<GazePoint | null>(null);
    const conversationRef = useRef<ConversationState>("idle");
    const speechTargetRef = useRef<number>(0);

    // --------------------------------------------------------------------------------
    // Avatar Handle
    // --------------------------------------------------------------------------------
    // Every method only writes refs, so one handle serves the avatar's whole life
    const handle = useMemo((): AvatarHandle => ({
        // Emotions change the expression; animations start a motion (unknown values fall back to Neutral)
        performAction: (action: RobotAction): void => {
            if (action.kind === "emotion") {
                // The hold starts once the new face is fully shown
                const nowMs      = performance.now();
                const durationMs = action.duration_ms ?? null;
                emotionStartRef.current = nowMs;
                startTransition(expressionFor(action.value, restingRef.current), SMILEY_EXPRESSION_IN_MS, nowMs);
                releaseAtRef.current = ((durationMs === null) || atRestRef.current) ? null : (nowMs + SMILEY_EXPRESSION_IN_MS + durationMs);
            }
            else if (action.kind === "animation") {
                const motion      = motionFor(action.value);
                motionRef.current = (motion === undefined) ? null : {motion, startMs: performance.now()};
            }
        },

        // Head back to the resting face now and stop any motion
        reset: (): void => {
            startTransition(restingRef.current, SMILEY_EXPRESSION_OUT_MS, performance.now());
            releaseAtRef.current = null;
            motionRef.current    = null;
        },

        // Pick the face Neutral means (an unknown name keeps the current one), moving to it if resting
        setRestingExpression: (value: string): void => {
            const wasResting   = atRestRef.current;
            restingRef.current = expressionFor(value, restingRef.current);
            if (wasResting) startTransition(restingRef.current, SMILEY_EXPRESSION_OUT_MS, performance.now());
        },

        // Page-driven inputs
        setGaze              : (x: number, y: number): void     => { gazeTargetRef.current   = {x, y}; },
        clearGaze            : (): void                         => { gazeTargetRef.current   = null;   },
        setConversationState : (state: ConversationState): void => { conversationRef.current = state;  },
        setSpeechLevel       : (level: number): void            => { speechTargetRef.current = level;  },
    }), []);

    // --------------------------------------------------------------------------------
    // Frame Loop
    // --------------------------------------------------------------------------------
    useEffect(() => {
        // Loop-only state the page never touches
        let frameId      : number        = 0;
        let lastMs       : number        = performance.now();
        let gaze         : GazePoint     = {x: 0, y: 0};
        let idleGaze     : GazePoint     = {x: 0, y: 0};
        let nextGlanceAt : number        = lastMs + randomBetween(SMILEY_GLANCE_INTERVAL_MIN_MS, SMILEY_GLANCE_INTERVAL_MAX_MS);
        let nextBlinkAt  : number        = lastMs + randomBetween(SMILEY_BLINK_INTERVAL_MIN_MS,  SMILEY_BLINK_INTERVAL_MAX_MS );
        let blinkStartAt : number | null = null;
        let listening    : number        = 0;
        let speech       : number        = 0;

        // Build one frame of the face from every layer
        const tick = (nowMs: number): void => {
            const dtSec        = Math.min((nowMs - lastMs) / 1_000, SMILEY_MAX_FRAME_SEC);
            const conversation = conversationRef.current;
            lastMs = nowMs;

            // 1) Expression: head back to Neutral once its time is up, then move along the current change
            if ((releaseAtRef.current !== null) && (nowMs >= releaseAtRef.current)) {
                startTransition(restingRef.current, SMILEY_EXPRESSION_OUT_MS, nowMs);
                releaseAtRef.current = null;
            }
            const transition      = transitionRef.current;
            const progress        = clampRange((nowMs - transition.startMs) / transition.lengthMs, 0, 1);
            expressionRef.current = blendFace(transition.from, transition.to, smoothstep(progress));
            const expression      = expressionRef.current;

            // 2) Motion offsets (a finished motion drops back to no offset)
            let offsets: MotionOffsets = {};
            const playing = motionRef.current;
            if (playing !== null) {
                const t = (nowMs - playing.startMs) / playing.motion.durationMs;
                if (t >= 1) motionRef.current = null;
                else        offsets           = playing.motion.sample(t);
            }

            // 3) Gaze: the page's point, else the conversation state's, else an idle glance
            if (nowMs >= nextGlanceAt) {
                idleGaze     = (Math.random() < SMILEY_GLANCE_CENTER_CHANCE) ? {x: 0, y: 0} : {x: randomBetween(-SMILEY_GLANCE_RANGE, SMILEY_GLANCE_RANGE), y: randomBetween(-SMILEY_GLANCE_RANGE, SMILEY_GLANCE_RANGE)};
                nextGlanceAt = nowMs + randomBetween(SMILEY_GLANCE_INTERVAL_MIN_MS, SMILEY_GLANCE_INTERVAL_MAX_MS);
            }
            const stateGaze  = (conversation === "listening") ? {x: 0, y: 0} : (conversation === "thinking") ? SMILEY_THINKING_GAZE : idleGaze;
            const gazeTarget = gazeTargetRef.current ?? stateGaze;
            const gazeStep   = easeStep(SMILEY_GAZE_EASE_PER_SEC, dtSec);
            gaze = {x: gaze.x + ((gazeTarget.x - gaze.x) * gazeStep), y: gaze.y + ((gazeTarget.y - gaze.y) * gazeStep)};

            // 4) Blink: start one after a random gap (longer while thinking), then close and reopen
            if (nowMs >= nextBlinkAt) {
                const slowdown = (conversation === "thinking") ? SMILEY_THINKING_BLINK_SLOWDOWN : 1;
                blinkStartAt   = nowMs;
                nextBlinkAt    = nowMs + (randomBetween(SMILEY_BLINK_INTERVAL_MIN_MS, SMILEY_BLINK_INTERVAL_MAX_MS) * slowdown);
            }
            let blink = 1;
            if (blinkStartAt !== null) {
                const u = (nowMs - blinkStartAt) / SMILEY_BLINK_DURATION_MS;
                if (u >= 1) blinkStartAt = null;
                else        blink        = 1 - Math.sin(Math.PI * u);
            }

            // 5) Breathing, the listening look, and the voice level
            const breath          = 1 + (SMILEY_BREATH_SCALE * Math.sin((2 * Math.PI * nowMs) / SMILEY_BREATH_PERIOD_MS));
            const listeningTarget = (conversation === "listening") ? 1 : 0;
            listening += (listeningTarget         - listening) * easeStep(SMILEY_STATE_EASE_PER_SEC,  dtSec);
            speech    += (speechTargetRef.current - speech   ) * easeStep(SMILEY_SPEECH_EASE_PER_SEC, dtSec);

            // 6) Combine the layers into the face the renderer draws
            setFace({
                ...expression,
                gazeX         : clampRange(expression.gazeX + gaze.x + (offsets.gazeX ?? 0), -1, 1),
                gazeY         : clampRange(expression.gazeY + gaze.y + (offsets.gazeY ?? 0), -1, 1),
                turnX         : expression.turnX   + (offsets.turnX   ?? 0),
                turnY         : expression.turnY   + (offsets.turnY   ?? 0),
                tilt          : expression.tilt    + (offsets.tilt    ?? 0),
                offsetX       : expression.offsetX + (offsets.offsetX ?? 0),
                offsetY       : expression.offsetY + (offsets.offsetY ?? 0),
                eyeOpen       : expression.eyeOpen * blink,
                eyeScale      : expression.eyeScale + (listening * SMILEY_LISTENING_EYE_BOOST),
                brows         : browsAlways ? 1 : expression.brows,
                mouthOpen     : Math.max(expression.mouthOpen, speech * SMILEY_SPEECH_MOUTH_GAIN),
                scale         : expression.scale * breath,
                timeSec       : nowMs / 1_000,
                expressionSec : clampRange(nowMs - emotionStartRef.current, 0, Infinity) / 1_000,
            });
            frameId = requestAnimationFrame(tick);
        };

        // Run until the avatar unmounts
        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [browsAlways]);

    return {face, handle};
}


// --------------------------------------------------------------------------------
// Math Helpers
// --------------------------------------------------------------------------------
// Uniform random number between two bounds
function randomBetween(low: number, high: number): number {
    return low + (Math.random() * (high - low));
}

// Fraction of the remaining gap to close this frame (frame-rate independent exponential easing)
function easeStep(ratePerSec: number, dtSec: number): number {
    return 1 - Math.exp(-ratePerSec * dtSec);
}

// Keep a value inside a range (gaze layers can add up past the eye's range, and a click's
// `performance.now()` can be a little later than the frame time that reads it)
function clampRange(value: number, low: number, high: number): number {
    return Math.max(low, Math.min(high, value));
}

// Ease-in-out curve over 0 to 1
function smoothstep(u: number): number {
    return u * u * (3 - (2 * u));
}
