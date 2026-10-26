/* Drive the smiley avatar's face: its actions, gaze, blinks, breathing, and speech.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/useFaceController`

Each animation frame combines several layers into one `FaceState`:

  1) the expression, which moves into a new face over a fixed short time, holds
     for `duration_ms` once fully shown, then moves back to the resting face
     (what "Neutral" means; the page can pick it with `setRestingExpression`,
     and between `sleep()` and `wake()` it is the sleeping face). A timed
     animation with a face (the yawn) shows it on top by an amount over its
     length, while the face underneath settles to rest (mostly hidden), so it
     fades out onto the resting face
  2) the offsets of the movement or timed animation playing (one at a time),
     plus the passive motions from `passiveMotions.ts`: a slight sway or a head
     cock while listening (never during a movement or animation), and the
     breathing (`breathing.ts`), which always plays
  3) gaze: a point the page sets, else the speech phase's look (away at pauses
     and over the last few words of a reply, back at the user as it finishes),
     else one picked by the conversation state, else small idle glances. Every
     look is measured from `SMILEY_USER_GAZE`, where the user is
  4) a slow wander around the expression's own pose, for expressions that set
     `wander` (Ponder): the eyes hop between nearby points, the head
     turns after them more slowly, and its lean sways
  5) blinks at random gaps
  6) the mouth following the voice level the page reports

Every action arrives through `performAction` and is played by its name's
category (`smileyActions.ts`): an expression, a movement, or an animation. The
handle methods only write refs (or steer the breathing), so the page can call
them as often as it likes; the frame loop reads them on its next tick.

The constants below are the tuning knobs for these layers. Each face lives in
`state/faceState.ts` or `actions/faceAnimations.ts`, movement sizes and
speeds in `actions/faceMotions.ts`, and the breathing rhythm in
`behavior/breathing.ts`.

*/
import { useEffect, useMemo, useRef, useState } from "react";

// From this project
import type { AvatarHandle, ConversationState, RobotAction, SpeechPhase } from "../avatarRegistry";
import type { FaceAnimation                                             } from "./actions/faceAnimations";
import type { FaceMotion, MotionOffsets                                 } from "./actions/faceMotions";
import      { addOffsets, randomBetween, smoothstep                     } from "./actions/faceMotions";
import      { resolveSmileyAction                                       } from "./actions/smileyActions";
import      { createBreathing                                           } from "./behavior/breathing";
import      { createPassiveScheduler                                    } from "./behavior/passiveMotions";
import type { FaceState                                                 } from "./state/faceState";
import      { blendFace, expressionFace, fullFace                       } from "./state/faceState";
import      { SMILEY_BASE_FACE, SMILEY_SLEEPING_FACE                    } from "./state/faceState";

// Expression changes (fixed-length eases, so a timed emotion is fully shown for its whole duration)
const SMILEY_EXPRESSION_IN_MS  = 180;   // Moving into a new expression
const SMILEY_EXPRESSION_OUT_MS = 400;   // Moving back to Neutral when an expression's time is up

// The yawn played on waking up (an animation in `faceAnimations.ts`)
const SMILEY_WAKE_ANIMATION = "Yawn";

// Share of a timed animation over which the face under its own face settles to rest
const SMILEY_ANIMATION_SETTLE_SHARE = 0.5;

// Easing rates (how quickly each layer closes the gap to its target, per second)
const SMILEY_GAZE_EASE_PER_SEC   = 14;   // Eyes jumping to a new point
const SMILEY_STATE_EASE_PER_SEC  =  5;   // Conversation-state looks fading in and out
const SMILEY_SPEECH_EASE_PER_SEC = 25;   // Mouth following the voice level (softens syllable-to-syllable flapping; the level's lead covers the delay)

// Blinks
const SMILEY_BLINK_INTERVAL_MIN_MS   = 2_500;   // Shortest gap between blinks
const SMILEY_BLINK_INTERVAL_MAX_MS   = 6_000;   // Longest gap between blinks
const SMILEY_BLINK_DURATION_MS       =   160;   // One close-and-open
const SMILEY_THINKING_BLINK_SLOWDOWN = 1.8;     // Blink gaps stretch by this much while thinking

// Where the user is, in gaze units (every look at the user, and every look away, is measured from it)
const SMILEY_USER_GAZE = {x: 0, y: 0};

// Idle glances
const SMILEY_GLANCE_INTERVAL_MIN_MS = 1_200;   // Shortest time between glances
const SMILEY_GLANCE_INTERVAL_MAX_MS = 3_500;   // Longest time between glances
const SMILEY_GLANCE_RANGE           = 0.35;    // Farthest a glance strays from the user (gaze units)
const SMILEY_GLANCE_CENTER_CHANCE   = 0.40;    // Chance a glance comes back to the user

// Conversation-state looks (gaze offsets from the user)
const SMILEY_THINKING_GAZE       = {x: 0.55, y: -0.55};   // Eyes drift up and to the side
const SMILEY_LISTENING_EYE_BOOST = 0.08;                  // Extra eye size while listening

// Wander while an expression with `wander` is held (eyes hop near its gaze; the head follows them and sways)
const SMILEY_WANDER_GAZE_RANGE        = 0.15;    // Farthest a hop strays from the expression's gaze (gaze units)
const SMILEY_WANDER_INTERVAL_MIN_MS   =   700;   // Shortest time between hops
const SMILEY_WANDER_INTERVAL_MAX_MS   = 1_800;   // Longest time between hops
const SMILEY_WANDER_HEAD_FOLLOW       = 0.35;    // Head turn per unit of hop (the eyes move farther than the head)
const SMILEY_WANDER_HEAD_EASE_PER_SEC = 2.5;     // How quickly the head turns after the eyes
const SMILEY_WANDER_SWAY_DEG          = 1.5;     // Lean sway either way
const SMILEY_WANDER_SWAY_PERIOD_MS    = 5_500;   // One sway there and back

// Speech-phase looks while it speaks (gaze offsets from the user; "finishing" looks straight at the user)
const SMILEY_PAUSE_GAZE   = {x:  0.55, y: -0.50};   // Up and to the right between sentences
const SMILEY_WRAP_UP_GAZE = {x: -0.60, y:  0.15};   // Aside (left, a little down) over the last few words

// Mouth openness at full voice level
const SMILEY_SPEECH_MOUTH_GAIN = 0.667; // 0.42;

// Longest step one frame may take (a tab coming back from the background would otherwise jump)
const SMILEY_MAX_FRAME_SEC = 0.1;

// A gaze point, -1 to 1 on each axis
type GazePoint = {x: number; y: number};

// A motion and when it started
type PlayingMotion = {motion: FaceMotion; startMs: number};

// One expression change: from the face showing when it started to its target, over a fixed time
type ExpressionTransition = {from: FaceState; to: FaceState; startMs: number; lengthMs: number};

// A timed animation's face: shown over the expression underneath, by its amount over its length
type AnimationFace = {face: FaceState; amount: (t: number) => number; startMs: number; lengthMs: number};


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

    // Neutral: the face to rest on now (the sleeping face while asleep), and whether it is showing
    const restingRef = useRef<FaceState>(SMILEY_BASE_FACE);
    const atRestRef  = useRef<boolean>(true);

    // The page's resting face (the base face until it picks another), and whether the face is asleep
    const chosenRestRef = useRef<FaceState>(SMILEY_BASE_FACE);
    const asleepRef     = useRef<boolean>(false);

    // When the latest emotion arrived (its own clock times the tear, so one drip fits its hold)
    const emotionStartRef = useRef<number>(0);

    // Start moving from the face showing now to another one
    const startTransition = (to: FaceState, lengthMs: number, nowMs: number): void => {
        transitionRef.current = {from: expressionRef.current, to, startMs: nowMs, lengthMs};
        atRestRef.current     = (to === restingRef.current);
    };

    // Movement (or timed animation) playing now, and a timed animation's face (null when none)
    const motionRef        = useRef<PlayingMotion | null>(null);
    const animationFaceRef = useRef<AnimationFace | null>(null);

    // Breathing: its rhythm, the yawn's deep breath, and the breath before speaking
    const breathing = useMemo(createBreathing, []);

    // Inputs from the page
    const gazeTargetRef   = useRef<GazePoint | null>(null);
    const conversationRef = useRef<ConversationState>("idle");
    const speechTargetRef = useRef<number>(0);
    const speechPhaseRef  = useRef<SpeechPhase>("none");

    // --------------------------------------------------------------------------------
    // Avatar Handle
    // --------------------------------------------------------------------------------
    // Every method only writes refs, so one handle serves the avatar's whole life
    const handle = useMemo((): AvatarHandle => {
        // Move to a face and hold it (for `durationMs` once fully shown, or until replaced when null), then back to Neutral
        const showFace = (face: FaceState, durationMs: number | null, nowMs: number): void => {
            animationFaceRef.current = null;
            emotionStartRef .current = nowMs;
            startTransition(face, SMILEY_EXPRESSION_IN_MS, nowMs);
            releaseAtRef.current = ((durationMs === null) || atRestRef.current) ? null : (nowMs + SMILEY_EXPRESSION_IN_MS + durationMs);
        };

        // Play an animation: a held one like an expression, a timed one with its face, movement, and breath over its length
        const playAnimation = (animation: FaceAnimation, durationMs: number | null, nowMs: number): void => {
            if (animation.kind === "held") {
                showFace(fullFace(animation.face), durationMs, nowMs);
                return;
            }
            motionRef.current = {motion: {durationMs: animation.lengthMs, sample: animation.motion}, startMs: nowMs};
            if (animation.breath !== null) breathing.take(animation.breath, nowMs);
            if (animation.face   === null) return;   // A face-less animation leaves the face showing alone

            // Its face on top, while the face underneath settles to rest (so the animation fades out onto the resting face)
            emotionStartRef.current = nowMs;
            releaseAtRef   .current = null;
            startTransition(restingRef.current, animation.lengthMs * SMILEY_ANIMATION_SETTLE_SHARE, nowMs);
            animationFaceRef.current = {face: fullFace(animation.face.changes), amount: animation.face.amount, startMs: nowMs, lengthMs: animation.lengthMs};
        };

        // Play an action by its name's category, whichever kind it came as (unknown names fall back to Neutral)
        const performAction = (action: RobotAction): void => {
            if ((action.kind !== "emotion") && (action.kind !== "animation")) return;   // Unknown kinds are ignored (`avatarRegistry` contract)

            const nowMs      = performance.now();
            const durationMs = action.duration_ms ?? null;
            const resolved   = resolveSmileyAction(action.value);
            if      (resolved === null                  ) showFace(restingRef.current, null, nowMs);
            else if (resolved.category === "Expressions") showFace(resolved.face, durationMs, nowMs);
            else if (resolved.category === "Movements"  ) motionRef.current = {motion: resolved.motion, startMs: nowMs};
            else                                          playAnimation(resolved.animation, durationMs, nowMs);
        };

        return {
            performAction,

            // Head back to the resting face now and stop any motion
            reset: (): void => {
                startTransition(restingRef.current, SMILEY_EXPRESSION_OUT_MS, performance.now());
                releaseAtRef    .current = null;
                motionRef       .current = null;
                animationFaceRef.current = null;
            },

            // Pick the face Neutral means while awake (an unknown name keeps the current one), moving to it if resting
            setRestingExpression: (value: string): void => {
                chosenRestRef.current = expressionFace(value) ?? chosenRestRef.current;
                if (asleepRef.current) return;

                const wasResting   = atRestRef.current;
                restingRef.current = chosenRestRef.current;
                if (wasResting) startTransition(restingRef.current, SMILEY_EXPRESSION_OUT_MS, performance.now());
            },

            // Doze off: Neutral means the sleeping face until `wake` (the face settles there after any emotion), breathing slow and deep
            sleep: (): void => {
                asleepRef       .current = true;
                restingRef      .current = SMILEY_SLEEPING_FACE;
                releaseAtRef    .current = null;
                motionRef       .current = null;
                animationFaceRef.current = null;
                breathing.setAsleep(true);
                startTransition(restingRef.current, SMILEY_EXPRESSION_OUT_MS, performance.now());
            },

            // Yawn awake, then settle on the page's resting face (an awake face is left alone)
            wake: (): void => {
                if (!asleepRef.current) return;

                asleepRef .current = false;
                restingRef.current = chosenRestRef.current;
                breathing.setAsleep(false);
                performAction({kind: "animation", value: SMILEY_WAKE_ANIMATION});
            },

            // Breathe in for speech heard in `inMs` (the gap learned from earlier turns when the page can't know)
            prepareToSpeak: (inMs?: number): void => breathing.prepareToSpeak(performance.now(), inMs),

            // Conversation state (starting to speak lets go of a breath taken for it)
            setConversationState: (state: ConversationState): void => {
                if ((state === "speaking") && (conversationRef.current !== "speaking")) breathing.speechStarted(performance.now());
                conversationRef.current = state;
            },

            // Page-driven inputs
            setGaze        : (x: number, y: number): void => { gazeTargetRef  .current = {x, y}; },
            clearGaze      : (                    ): void => { gazeTargetRef  .current = null;   },
            setSpeechLevel : (level: number       ): void => { speechTargetRef.current = level;  },
            setSpeechPhase : (phase: SpeechPhase  ): void => { speechPhaseRef .current = phase;  },
        };
    }, [breathing]);

    // --------------------------------------------------------------------------------
    // Frame Loop
    // --------------------------------------------------------------------------------
    useEffect(() => {
        // Loop-only state the page never touches
        let frameId      : number        = 0;
        let lastMs       : number        = performance.now();
        let gaze         : GazePoint     = SMILEY_USER_GAZE;
        let idleGaze     : GazePoint     = SMILEY_USER_GAZE;
        let nextGlanceAt : number        = lastMs + randomBetween(SMILEY_GLANCE_INTERVAL_MIN_MS, SMILEY_GLANCE_INTERVAL_MAX_MS);
        let nextBlinkAt  : number        = lastMs + randomBetween( SMILEY_BLINK_INTERVAL_MIN_MS,  SMILEY_BLINK_INTERVAL_MAX_MS);
        let wanderPoint  : GazePoint     = {x: 0, y: 0};   // Hop the eyes are heading to, from the expression's gaze
        let wanderEyes   : GazePoint     = {x: 0, y: 0};
        let wanderHead   : GazePoint     = {x: 0, y: 0};
        let nextWanderAt : number        = lastMs;
        let blinkStartAt : number | null = null;
        let listening    : number        = 0;
        let speech       : number        = 0;

        // Passive motions: listening sways and head cocks (resting between plays), and the breathing (always on)
        const passive = createPassiveScheduler(lastMs, {breath: (nowMs: number, dtSec: number): MotionOffsets => ({grow: breathing.step(nowMs, dtSec)})});

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
            const transition = transitionRef.current;
            const progress   = clampRange((nowMs - transition.startMs) / transition.lengthMs, 0, 1);
            let   expression = blendFace(transition.from, transition.to, smoothstep(progress));

            // ...with a timed animation's face on top, by its amount (dropped once it ends)
            const animationFace = animationFaceRef.current;
            if (animationFace !== null) {
                const t = (nowMs - animationFace.startMs) / animationFace.lengthMs;
                if (t < 1) expression = blendFace(expression, animationFace.face, animationFace.amount(t));
                else       animationFaceRef.current = null;
            }
            expressionRef.current = expression;

            // 2) Movement or timed animation offsets (one that finished drops back to no offset), plus the passive motions
            let offsets: MotionOffsets = {};
            const playing = motionRef.current;
            if (playing !== null) {
                const t = (nowMs - playing.startMs) / playing.motion.durationMs;
                if (t >= 1) motionRef.current = null;
                else        offsets           = playing.motion.sample(t);
            }
            offsets = addOffsets(offsets, passive(nowMs, dtSec, conversation, playing !== null));   // Passive motions on top (head ones hold off meanwhile)

            // 3) Gaze: the page's point, else the speech phase's look, else the conversation state's, else an idle glance near the user
            if (playing !== null) nextGlanceAt = Math.max(nextGlanceAt, nowMs + SMILEY_GLANCE_INTERVAL_MIN_MS);   // No glance during a motion, or right after it
            if (nowMs >= nextGlanceAt) {
                idleGaze     = (Math.random() < SMILEY_GLANCE_CENTER_CHANCE) ? SMILEY_USER_GAZE : fromUser({x: randomBetween(-SMILEY_GLANCE_RANGE, SMILEY_GLANCE_RANGE), y: randomBetween(-SMILEY_GLANCE_RANGE, SMILEY_GLANCE_RANGE)});
                nextGlanceAt = nowMs + randomBetween(SMILEY_GLANCE_INTERVAL_MIN_MS, SMILEY_GLANCE_INTERVAL_MAX_MS);
            }
            const phase     = speechPhaseRef.current;
            const phaseGaze =
                (phase === "pausing"    ) ? fromUser(SMILEY_PAUSE_GAZE  ) :
                (phase === "wrapping-up") ? fromUser(SMILEY_WRAP_UP_GAZE) :
                (phase === "finishing"  ) ? SMILEY_USER_GAZE              :
                                            null;
            const stateGaze =
                (conversation === "listening") ? SMILEY_USER_GAZE               :
                (conversation === "thinking" ) ? fromUser(SMILEY_THINKING_GAZE) :
                                                 idleGaze;
            const gazeTarget = gazeTargetRef.current ?? phaseGaze ?? stateGaze;
            const gazeStep   = easeStep(SMILEY_GAZE_EASE_PER_SEC, dtSec);
            gaze = {x: gaze.x + ((gazeTarget.x - gaze.x) * gazeStep), y: gaze.y + ((gazeTarget.y - gaze.y) * gazeStep)};

            // 4) Wander: hop the eyes to a nearby point now and then, the head easing after them (scaled by the expression's `wander`)
            if (nowMs >= nextWanderAt) {
                wanderPoint  = {x: randomBetween(-SMILEY_WANDER_GAZE_RANGE, SMILEY_WANDER_GAZE_RANGE), y: randomBetween(-SMILEY_WANDER_GAZE_RANGE, SMILEY_WANDER_GAZE_RANGE)};
                nextWanderAt = nowMs + randomBetween(SMILEY_WANDER_INTERVAL_MIN_MS, SMILEY_WANDER_INTERVAL_MAX_MS);
            }
            const eyesStep = easeStep(SMILEY_GAZE_EASE_PER_SEC,        dtSec);
            const headStep = easeStep(SMILEY_WANDER_HEAD_EASE_PER_SEC, dtSec);
            wanderEyes = {x: wanderEyes.x + ((wanderPoint.x - wanderEyes.x) * eyesStep), y: wanderEyes.y + ((wanderPoint.y - wanderEyes.y) * eyesStep)};
            wanderHead = {x: wanderHead.x + ((wanderPoint.x - wanderHead.x) * headStep), y: wanderHead.y + ((wanderPoint.y - wanderHead.y) * headStep)};
            const wander = expression.wander;
            const sway   = SMILEY_WANDER_SWAY_DEG * Math.sin((2 * Math.PI * nowMs) / SMILEY_WANDER_SWAY_PERIOD_MS);

            // 5) Blink: start one after a random gap (longer while thinking), then close and reopen
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

            // 6) The listening look and the voice level
            const listeningTarget = (conversation === "listening") ? 1 : 0;
            listening += (listeningTarget         - listening) * easeStep( SMILEY_STATE_EASE_PER_SEC, dtSec);
            speech    += (speechTargetRef.current - speech   ) * easeStep(SMILEY_SPEECH_EASE_PER_SEC, dtSec);

            // 7) Combine the layers into the face the renderer draws
            setFace({
                ...expression,
                gazeX         : clampRange(expression.gazeX + gaze.x + (offsets.gazeX ?? 0) + (wander * wanderEyes.x), -1, 1),
                gazeY         : clampRange(expression.gazeY + gaze.y + (offsets.gazeY ?? 0) + (wander * wanderEyes.y), -1, 1),
                turnX         : expression.turnX   + (offsets.turnX   ?? 0) + (wander * wanderHead.x * SMILEY_WANDER_HEAD_FOLLOW),
                turnY         : expression.turnY   + (offsets.turnY   ?? 0) + (wander * wanderHead.y * SMILEY_WANDER_HEAD_FOLLOW),
                tilt          : expression.tilt    + (offsets.tilt    ?? 0) + (wander * sway),
                offsetX       : expression.offsetX + (offsets.offsetX ?? 0),
                offsetY       : expression.offsetY + (offsets.offsetY ?? 0),
                eyeOpen       : expression.eyeOpen * blink,
                eyeScale      : expression.eyeScale + (listening * SMILEY_LISTENING_EYE_BOOST),
                brows         : browsAlways ? 1 : expression.brows,
                mouthOpen     : Math.max(expression.mouthOpen, speech * SMILEY_SPEECH_MOUTH_GAIN),
                scale         : expression.scale * (1 + (offsets.grow ?? 0)),
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
// Gaze point at an offset from where the user is
function fromUser(offset: GazePoint): GazePoint {
    return {x: SMILEY_USER_GAZE.x + offset.x, y: SMILEY_USER_GAZE.y + offset.y};
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
