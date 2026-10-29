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
  2) the offsets of the movement or timed animation playing (one at a time;
     they can move the face's objects too, by key), plus the passive motions
     from `passiveMotions.ts`: a slight sway or a head cock while listening
     (never during a movement or animation), and the breathing
     (`breathing.ts`), which always plays
  3) the Map Task map (`mapTask.ts`): held in front of the body, raised and
     lowered (the face's own hands fade out while it holds the map)
  4) where the eyes and head point (`gaze.ts`): a point the page sets, a plan's
     look or held pose, the speech phase's or conversation state's look, or
     small idle glances, plus the slow `wander` drift of an expression like
     Ponder
  5) blinks at random gaps, or when a plan asks for one
  6) the mouth following the voice level the page reports

Actions arrive two ways. A `robot_action` comes through `performAction` and is
played by its name's category (`smileyActions.ts`): an expression, a movement,
or an animation. A backend plan's steps come through `runPlanStep`, which pulls
each action's lever (`plans/smileyStepRunner.ts`), and a setup through
`applySetup` sets the resting face and which automatic behaviors run. Once a
setup or plan has set a conversation state, the backend's state is the one
shown, except that the page's "speaking" always wins (only the page hears the
reply). The handle methods only write refs (or steer the layers' own state), so
the page can call them as often as it likes; the frame loop reads them on its
next tick.

The constants below are the tuning knobs for these layers. Each face lives in
`actions/faceExpressions.ts` or `actions/faceAnimations.ts`, movement sizes and
speeds in `actions/faceMotions.ts`, looks and glances in `behavior/gaze.ts`, and
the breathing rhythm in `behavior/breathing.ts`.

*/
import { useEffect, useMemo, useRef, useState } from "react";

// From this project
import type { AutoBehaviors, AvatarSetup, BreathAction, GazeAction                    } from "@/hooks/live-chat/avatarPlanFrames";
import type { PlanState, PoseAction, PropAction, StepActions                          } from "@/hooks/live-chat/avatarPlanFrames";
import type { AvatarHandle, ConversationState, RobotAction, SpeechPhase               } from "../avatarRegistry";
import type { FaceAnimation                                                           } from "./actions/faceAnimations";
import      { expressionFace, SMILEY_DEFAULT_RESTING_EXPRESSION, SMILEY_SLEEPING_FACE } from "./actions/faceExpressions";
import type { FaceMotion, MotionOffsets                                               } from "./actions/faceMotions";
import      { addOffsets, clampRange, easeStep, randomBetween, smoothstep             } from "./actions/faceMotions";
import      { resolveSmileyAction                                                     } from "./actions/smileyActions";
import      { createBreathing, SMILEY_SPEECH_BREATH_PEAK, SMILEY_SPEECH_EXHALE_MS     } from "./behavior/breathing";
import      { createGaze                                                              } from "./behavior/gaze";
import      { createMapTask                                                           } from "./behavior/mapTask";
import      { createPassiveScheduler                                                  } from "./behavior/passiveMotions";
import      { applyObjectOffsets, fadeHands                                           } from "./objects/faceObjects";
import type { SmileyLevers                                                            } from "./plans/smileyStepRunner";
import      { runSmileyStep                                                           } from "./plans/smileyStepRunner";
import type { FaceState                                                               } from "./state/faceState";
import      { blendFace, faceAtStrength, fullFace, SMILEY_BASE_FACE                   } from "./state/faceState";

// Expression changes (fixed-length eases, so a timed emotion is fully shown for its whole duration)
const SMILEY_EXPRESSION_IN_MS  = 180;   // Moving into a new expression
const SMILEY_EXPRESSION_OUT_MS = 400;   // Moving back to Neutral when an expression's time is up

// The yawn played on waking up (an animation in `faceAnimations.ts`)
const SMILEY_WAKE_ANIMATION = "Yawn";

// Share of a timed animation over which the face under its own face settles to rest
const SMILEY_ANIMATION_SETTLE_SHARE = 0.5;

// Easing rates (how quickly each layer closes the gap to its target, per second)
const SMILEY_STATE_EASE_PER_SEC  =  5;   // The listening look fading in and out
const SMILEY_SPEECH_EASE_PER_SEC = 25;   // Mouth following the voice level (softens syllable-to-syllable flapping; the level's lead covers the delay)

// Blinks
const SMILEY_BLINK_INTERVAL_MIN_MS   = 2_500;   // Shortest gap between blinks
const SMILEY_BLINK_INTERVAL_MAX_MS   = 6_000;   // Longest gap between blinks
const SMILEY_BLINK_DURATION_MS       =   160;   // One close-and-open
const SMILEY_THINKING_BLINK_SLOWDOWN = 1.8;     // Blink gaps stretch by this much while thinking

// Extra eye size while listening
const SMILEY_LISTENING_EYE_BOOST = 0.08;

// Which automatic behaviors run before any setup (all of them, as before plans existed; the page decides whether to
// send speech phases at all)
const SMILEY_AUTO_DEFAULT: AutoBehaviors = {idle_glances: true, thinking_look: true, speech_gaze: true, listening_motions: true};

// Mouth openness at full voice level
const SMILEY_SPEECH_MOUTH_GAIN = 0.667; // 0.42;

// Longest step one frame may take (a tab coming back from the background would otherwise jump)
const SMILEY_MAX_FRAME_SEC = 0.1;

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
    // Expression: the change playing now, the face it has reached, and when (and how quickly) it returns to Neutral
    const transitionRef   = useRef<ExpressionTransition>({from: SMILEY_BASE_FACE, to: SMILEY_BASE_FACE, startMs: 0, lengthMs: SMILEY_EXPRESSION_IN_MS});
    const expressionRef   = useRef<FaceState>(SMILEY_BASE_FACE);
    const releaseAtRef    = useRef<number | null>(null);
    const releaseOutMsRef = useRef<number>(SMILEY_EXPRESSION_OUT_MS);

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

    // Breathing (its rhythm, deliberate breaths, the breath before speaking), the map, and where the eyes and head point
    const breathing = useMemo(createBreathing, []);
    const mapTask   = useMemo(createMapTask,   []);
    const gaze      = useMemo(() => createGaze(performance.now()), []);

    // Inputs from the page
    const conversationRef = useRef<ConversationState>("idle");
    const speechTargetRef = useRef<number>(0);
    const speechPhaseRef  = useRef<SpeechPhase>("none");

    // From the backend: which automatic behaviors run, the conversation state (null until a setup or plan sets one), and a
    // blink a plan asked for (its length, until the frame loop starts it)
    const autoRef         = useRef<AutoBehaviors>(SMILEY_AUTO_DEFAULT);
    const backendStateRef = useRef<ConversationState | null>(null);
    const blinkRequestRef = useRef<number | null>(null);

    // The state the face shows: the page's "speaking" (only the page hears the reply), else the backend's once it set one
    const shownState = (): ConversationState => {
        const page = conversationRef.current;
        return ((page === "speaking") || (backendStateRef.current === null)) ? page : backendStateRef.current;
    };

    // --------------------------------------------------------------------------------
    // Avatar Handle
    // --------------------------------------------------------------------------------
    // Every method only writes refs, so one handle serves the avatar's whole life
    const handle = useMemo((): AvatarHandle => {
        // Move to a face and hold it (for `durationMs` once fully shown, or until replaced when null), then back to Neutral
        const showFace = (face: FaceState, durationMs: number | null, nowMs: number, inMs: number = SMILEY_EXPRESSION_IN_MS, outMs: number = SMILEY_EXPRESSION_OUT_MS): void => {
            animationFaceRef.current = null;
            emotionStartRef .current = nowMs;
            releaseOutMsRef .current = outMs;
            startTransition(face, inMs, nowMs);
            releaseAtRef.current = ((durationMs === null) || atRestRef.current) ? null : (nowMs + inMs + durationMs);
        };

        // Play an animation: a held one like an expression (partway at `strength`), a timed one with its face, movement, and
        // breath over its length (returns how long it takes)
        const playAnimation = (animation: FaceAnimation, durationMs: number | null, nowMs: number, strength: number = 1): number => {
            if (animation.kind === "held") {
                showFace(faceAtStrength(restingRef.current, fullFace(animation.face), strength), durationMs, nowMs);
                return SMILEY_EXPRESSION_IN_MS + (durationMs ?? 0);
            }
            motionRef.current = {motion: {durationMs: animation.lengthMs, sample: animation.motion}, startMs: nowMs};
            if (animation.breath !== null) breathing.take(animation.breath, nowMs);
            if (animation.face   === null) return animation.lengthMs;   // A face-less animation leaves the face showing alone

            // Its face on top, while the face underneath settles to rest (so the animation fades out onto the resting face)
            emotionStartRef.current = nowMs;
            releaseAtRef   .current = null;
            startTransition(restingRef.current, animation.lengthMs * SMILEY_ANIMATION_SETTLE_SHARE, nowMs);
            animationFaceRef.current = {face: fullFace(animation.face.changes), amount: animation.face.amount, startMs: nowMs, lengthMs: animation.lengthMs};
            return animation.lengthMs;
        };

        // Play an action by its name's category, whichever kind it came as (unknown names fall back to Neutral)
        const performAction = (action: RobotAction, strength: number = 1): void => {
            if ((action.kind !== "emotion") && (action.kind !== "animation")) return;   // Unknown kinds are ignored (`avatarRegistry` contract)

            const nowMs      = performance.now();
            const durationMs = action.duration_ms ?? null;
            const resolved   = resolveSmileyAction(action.value);
            if      (resolved === null                  ) showFace(restingRef.current, null, nowMs);
            else if (resolved.category === "Expressions") showFace(faceAtStrength(restingRef.current, resolved.face, strength), durationMs, nowMs);
            else if (resolved.category === "Movements"  ) motionRef.current = {motion: resolved.motion, startMs: nowMs};
            else                                          playAnimation(resolved.animation, durationMs, nowMs);
        };

        // Back to the resting face now: the movement and an animation's face stop, a plan's look and pose release, and a
        // held breath lets go (the map and the conversation state stay)
        const reset = (): void => {
            const nowMs = performance.now();
            startTransition(restingRef.current, SMILEY_EXPRESSION_OUT_MS, nowMs);
            releaseAtRef    .current = null;
            motionRef       .current = null;
            animationFaceRef.current = null;
            gaze.release(nowMs);
            breathing.release(nowMs);
        };

        // Pick the face Neutral means while awake (an unknown name keeps the current one), moving to it if resting
        const setRestingExpression = (value: string): void => {
            chosenRestRef.current = expressionFace(value) ?? chosenRestRef.current;
            if (asleepRef.current) return;

            const wasResting   = atRestRef.current;
            restingRef.current = chosenRestRef.current;
            if (wasResting) startTransition(restingRef.current, SMILEY_EXPRESSION_OUT_MS, performance.now());
        };

        // --------------------------------------------------------------------------------
        // Plan Levers
        // --------------------------------------------------------------------------------
        // What a plan step pulls (`plans/smileyStepRunner`): each starts its action now and says how long it takes
        const levers: SmileyLevers = {
            reset,
            face: (face: FaceState, strength: number, holdMs: number | null, inMs: number | null, outMs: number | null): number => {
                const showMs = inMs ?? SMILEY_EXPRESSION_IN_MS;
                showFace(faceAtStrength(restingRef.current, face, strength), holdMs, performance.now(), showMs, outMs ?? SMILEY_EXPRESSION_OUT_MS);
                return showMs + (holdMs ?? 0);
            },
            restFace: (): number => {
                animationFaceRef.current = null;
                releaseAtRef    .current = null;
                startTransition(restingRef.current, SMILEY_EXPRESSION_OUT_MS, performance.now());
                return 0;
            },
            motion: (motion: FaceMotion): number => {
                motionRef.current = {motion, startMs: performance.now()};
                return motion.durationMs;
            },
            animation : (animation: FaceAnimation, strength: number, holdMs: number | null): number => playAnimation(animation, holdMs, performance.now(), strength),
            look      : (action: GazeAction): number => gaze.command(action, performance.now()),
            pose      : (action: PoseAction): number => gaze.pose   (action, performance.now()),
            prop      : (action: PropAction): number => mapTask.apply(action, performance.now()),
            breathe   : (action: BreathAction): number => {
                breathing.take({inMs: action.in_ms, peak: action.depth ?? SMILEY_SPEECH_BREATH_PEAK, holdMs: action.hold_ms, exhaleMs: action.out_ms ?? SMILEY_SPEECH_EXHALE_MS}, performance.now());
                return action.in_ms + (action.hold_ms ?? 0);
            },
            blink: (ms: number | null): number => {
                const blinkMs = ms ?? SMILEY_BLINK_DURATION_MS;
                blinkRequestRef.current = blinkMs;
                return blinkMs;
            },
            state: (state: PlanState): number => {
                backendStateRef.current = state;
                return 0;
            },
        };

        return {
            performAction,
            reset,
            setRestingExpression,

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

            // A backend plan's step, and the session's settings (null: no setup, so every automatic behavior runs and the
            // page's conversation state counts again)
            runPlanStep : (actions: StepActions): number => runSmileyStep(actions, levers),
            applySetup  : (setup: AvatarSetup | null): void => {
                autoRef        .current = (setup === null) ? SMILEY_AUTO_DEFAULT : setup.auto;
                backendStateRef.current = (setup === null) ? null : (backendStateRef.current ?? "idle");
                if (setup !== null) setRestingExpression(setup.rest ?? SMILEY_DEFAULT_RESTING_EXPRESSION);
            },

            // Page-driven inputs
            setGaze        : (x: number, y: number): void => gaze.setPoint({x, y}),
            clearGaze      : (                    ): void => gaze.setPoint(null),
            setSpeechLevel : (level: number       ): void => { speechTargetRef.current = level; },
            setSpeechPhase : (phase: SpeechPhase  ): void => { speechPhaseRef .current = phase; },
        };
    }, [breathing, gaze, mapTask]);

    // --------------------------------------------------------------------------------
    // Frame Loop
    // --------------------------------------------------------------------------------
    useEffect(() => {
        // Loop-only state the page never touches
        let frameId      : number        = 0;
        let lastMs       : number        = performance.now();
        let nextBlinkAt  : number        = lastMs + randomBetween(SMILEY_BLINK_INTERVAL_MIN_MS, SMILEY_BLINK_INTERVAL_MAX_MS);
        let blinkStartAt : number | null = null;
        let blinkMs      : number        = SMILEY_BLINK_DURATION_MS;
        let listening    : number        = 0;
        let speech       : number        = 0;

        // Passive motions: listening sways and head cocks (resting between plays), and the breathing (always on)
        const passive = createPassiveScheduler(lastMs, {breath: (nowMs: number, dtSec: number): MotionOffsets => ({grow: breathing.step(nowMs, dtSec)})});

        // Build one frame of the face from every layer
        const tick = (nowMs: number): void => {
            const dtSec        = Math.min((nowMs - lastMs) / 1_000, SMILEY_MAX_FRAME_SEC);
            const conversation = shownState();
            const auto         = autoRef.current;
            lastMs = nowMs;

            // 1) Expression: head back to Neutral once its time is up, then move along the current change
            if ((releaseAtRef.current !== null) && (nowMs >= releaseAtRef.current)) {
                startTransition(restingRef.current, releaseOutMsRef.current, nowMs);
                releaseAtRef.current = null;
            }
            const transition = transitionRef.current;
            const progress   = (transition.lengthMs > 0) ? clampRange((nowMs - transition.startMs) / transition.lengthMs, 0, 1) : 1;   // A change with no length is there at once
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
            offsets = addOffsets(offsets, passive(nowMs, dtSec, conversation, playing !== null, auto.listening_motions));   // Passive motions on top (head ones hold off meanwhile)

            // 3) The map in hand (before the gaze: a look at the map follows how far it is raised)
            const map = mapTask.step(nowMs);

            // 4) Where the eyes and head point (`gaze.ts`)
            const look = gaze.step({
                nowMs,
                dtSec,
                conversation,
                phase          : speechPhaseRef.current,
                expressionGaze : {x: expression.gazeX, y: expression.gazeY},
                wander         : expression.wander,
                mapRaise       : map.raise,
                motionPlaying  : playing !== null,
                auto,
            });

            // 5) Blink: start one a plan asked for, or one after a random gap (longer while thinking), then close and reopen
            const requestedMs = blinkRequestRef.current;
            blinkRequestRef.current = null;
            if ((requestedMs !== null) || (nowMs >= nextBlinkAt)) {
                const slowdown = (conversation === "thinking") ? SMILEY_THINKING_BLINK_SLOWDOWN : 1;
                blinkStartAt   = nowMs;
                blinkMs        = (requestedMs === null) ? SMILEY_BLINK_DURATION_MS : requestedMs;
                nextBlinkAt    = nowMs + (randomBetween(SMILEY_BLINK_INTERVAL_MIN_MS, SMILEY_BLINK_INTERVAL_MAX_MS) * slowdown);
            }
            let blink = 1;
            if (blinkStartAt !== null) {
                const u = (nowMs - blinkStartAt) / blinkMs;
                if (u >= 1) blinkStartAt = null;
                else        blink        = 1 - Math.sin(Math.PI * u);
            }

            // 6) The listening look and the voice level
            const listeningTarget = (conversation === "listening") ? 1 : 0;
            listening += (listeningTarget         - listening) * easeStep( SMILEY_STATE_EASE_PER_SEC, dtSec);
            speech    += (speechTargetRef.current - speech   ) * easeStep(SMILEY_SPEECH_EASE_PER_SEC, dtSec);

            // 7) Combine the layers into the face the renderer draws (its own hands fade out while it holds the map)
            setFace({
                ...expression,
                gazeX         : clampRange(expression.gazeX + look.eyes.x + (offsets.gazeX ?? 0), -1, 1),
                gazeY         : clampRange(expression.gazeY + look.eyes.y + (offsets.gazeY ?? 0), -1, 1),
                turnX         : expression.turnX   + (offsets.turnX   ?? 0) + look.turnX,
                turnY         : expression.turnY   + (offsets.turnY   ?? 0) + look.turnY,
                tilt          : expression.tilt    + (offsets.tilt    ?? 0) + look.tilt,
                offsetX       : expression.offsetX + (offsets.offsetX ?? 0),
                offsetY       : expression.offsetY + (offsets.offsetY ?? 0),
                objects       : fadeHands(applyObjectOffsets(expression.objects, offsets.objects ?? {}), 1 - map.held),
                eyeOpen       : expression.eyeOpen * blink,
                eyeScale      : expression.eyeScale + (listening * SMILEY_LISTENING_EYE_BOOST),
                brows         : browsAlways ? 1 : expression.brows,
                mouthOpen     : Math.max(expression.mouthOpen, speech * SMILEY_SPEECH_MOUTH_GAIN),
                scale         : expression.scale * (1 + (offsets.grow ?? 0)),
                map           : map.held,
                mapRaise      : map.raise,
                timeSec       : nowMs / 1_000,
                expressionSec : clampRange(nowMs - emotionStartRef.current, 0, Infinity) / 1_000,
            });
            frameId = requestAnimationFrame(tick);
        };

        // Run until the avatar unmounts
        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [browsAlways, breathing, gaze, mapTask]);

    return {face, handle};
}

