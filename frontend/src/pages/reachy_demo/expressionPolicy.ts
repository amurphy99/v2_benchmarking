/*
 * Replaceable browser behavior policy.
 * It controls movement only; dialogue and voice stay in the backend.
 */
import type { ReachyAvatarHandle } from "./ReachyAvatar";

export interface RobotAction {
    kind: string;
    value: string;
}

export interface ChatBehavior {
    setListening(enabled: boolean): void;
    onReplyStarted(text: string): void;
    onMotionCancel(): void;
    onRobotAction(action: RobotAction): void;
}

// A model or independent controller can replace this selector later.
// Return only names from the locally downloaded emotion library.
export function selectExpression(text: string): string | null {
    const value = text.toLowerCase().replace(/’/g, "'").trim();

    if (
        /\b(i'm sorry|i am sorry|sorry to hear|that sounds (hard|difficult|painful))\b/.test(value)
    ) {
        return "calming1";
    }

    if (
        /^(hello|hi|hey|good morning|good afternoon|good evening)\b/.test(value)
    ) {
        return "welcoming2";
    }

    if (
        /\b(thank you|thanks for sharing|thanks for telling)\b/.test(value)
    ) {
        return "grateful1";
    }

    if (/\b(well done|congratulations|great job)\b/.test(value)) {
        return "success1";
    }

    if (value.endsWith("?")) {
        return "inquiring1";
    }

    if (/^(yes|i understand|that makes sense|absolutely)\b/.test(value)) {
        return "understanding2";
    }

    return null;
}

// Translate the backend's existing mood vocabulary into recorded motions.
const MOODS: Record<string, string> = {
    grumpy: "irritated1",
    happy: "laughing2",
    love: "loving1",
    sad: "sad1",
    scared: "scared1",
    sick: "exhausted1",
    surprised: "surprised1",
    thinking: "thoughtful1",
    tired: "sleep1",
};

// A small pool of attention gestures, rather than the entire emotion library.
const LISTENING_MOTIONS = ["attentive1", "attentive2", "understanding1"];

export function createExpressionPolicy(
    getAvatar: () => ReachyAvatarHandle | null,
): ChatBehavior {
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastCueAt = -Infinity;
    let explicitCue = false;

    let listening = false;
    let listeningTimer: ReturnType<typeof setTimeout> | undefined;
    let listeningMotion = false;
    let motionBusy = false;
    let lastListeningMotion = "";

    const cancel = () => {
        generation += 1;
        clearTimeout(timer);
        explicitCue = false;
        motionBusy = false;
        listeningMotion = false;

        // The avatar also invalidates pending motion-file loads.
        getAvatar()?.stopMotion();
    };

    const play = async (
        motion: string,
        maxMs = 1_200,
        isListening = false,
    ) => {
        cancel();

        const avatar = getAvatar();
        if (!avatar) return;

        const current = generation;
        motionBusy = true;
        listeningMotion = isListening;

        try {
            await avatar.playEmotion(motion);
        } catch (cause) {
            if (current === generation) cancel();
            throw cause;
        }

        // Ignore completion of a load cancelled by interruption/navigation.
        if (current !== generation) return;

        /*
         * Primary recordings override speech sway in this renderer.
         * Reply accents stay brief; listening clips can finish naturally.
         */
        timer = setTimeout(() => {
            if (current !== generation) return;

            avatar.stopMotion();
            motionBusy = false;
            listeningMotion = false;
        }, maxMs);
    };

    const reducedMotion = () =>
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scheduleListening = (first = false) => {
        clearTimeout(listeningTimer);
        if (!listening) return;

        // First gesture after 2 seconds; subsequent starts 7–10 seconds apart.
        const delay = first
            ? 2_000
            : 7_000 + Math.random() * 3_000;

        listeningTimer = setTimeout(() => {
            if (!listening) return;

            if (
                !document.hidden &&
                !reducedMotion() &&
                !motionBusy &&
                !explicitCue
            ) {
                // Exclude the previous gesture to avoid obvious repetition.
                const choices = LISTENING_MOTIONS.filter(
                    (name) => name !== lastListeningMotion,
                );
                const motion =
                    choices[Math.floor(Math.random() * choices.length)];

                lastListeningMotion = motion;

                // These recordings last at most 6.46 seconds.
                // The renderer also ends each at its native duration.
                void play(motion, 6_500, true).catch(console.warn);
            }

            scheduleListening();
        }, delay);
    };

    const setListening = (enabled: boolean) => {
        // Re-renders must not continually restart the random delay.
        if (listening === enabled) return;

        listening = enabled;
        clearTimeout(listeningTimer);

        if (enabled) {
            scheduleListening(true);
        } else if (listeningMotion) {
            // Yield immediately, including while a clip is still loading.
            cancel();
        }
    };

    return {
        setListening,
        onMotionCancel: cancel,

        onReplyStarted(text) {
            setListening(false);

            // An explicit server/admin cue takes priority over a local guess.
            if (explicitCue) {
                explicitCue = false;
                return;
            }

            if (reducedMotion()) return;

            const motion = selectExpression(text);

            // Avoid starting a gesture for every short reply.
            if (!motion || performance.now() - lastCueAt < 8_000) return;

            lastCueAt = performance.now();
            void play(motion).catch(console.warn);
        },

        onRobotAction(action) {
            setListening(false);
            cancel();

            if (action.kind === "emotion") {
                const motion = MOODS[action.value.toLowerCase()];
                if (motion) void play(motion).catch(console.warn);
            } else if (action.kind === "animation") {
                getAvatar()?.playDance(action.value);
            }

            explicitCue = true;
        },
    };
}