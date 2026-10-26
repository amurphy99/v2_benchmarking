/* Simulate a chat turn: the user just finished, the avatar thinks, then replies.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/utils/useSimulatedTurn`

Follows a live chat's timing: "thinking" from the user's last word while the
LLM works (`DEMO_TURN_THINK_MS`), then the reply's text arrives and speech
synthesis takes a moment more (`DEMO_TURN_SYNTH_MS`) before the voice starts.
It sends the same conversation states the chat page does (`useChatAvatar`):
"thinking", "speaking" once the reply's audio starts, and "listening" once it
ends. The reply is the sample reply, played exactly like its own button.

When the text arrives, the avatar hears when the voice will start
(`prepareToSpeak`, so its breath in tops out right as it speaks), and the page
sends its reply cues as separate commands, the way a backend sends a reply's
mood with its text (the demo sends a Nod and a Smiling Face that lasts into the
speech).

The click opens the audio timeline (browsers only start audio from a user
gesture), and the delayed reply plays on it.

*/
import { useCallback, useEffect, useRef } from "react";

// From this project
import type { ConversationState } from "@/pages/common/avatar/avatarRegistry";

// How long the avatar thinks (the LLM working) before the reply's text arrives, and the text's wait for its first audio
const DEMO_TURN_THINK_MS = 1_000;
const DEMO_TURN_SYNTH_MS =   500;

// How far ahead of the playhead the audio player schedules the first chunk (`bufferAhead` in `useAudioPlayer`)
const DEMO_TURN_VOICE_LAG_MS = 200;

// Where the turn is
type TurnStep = "idle" | "thinking" | "synthesizing" | "waiting-for-audio" | "speaking";


// ================================================================================
// Simulated Turn
// ================================================================================
// Return functions that start a turn and cancel a pending one
export function useSimulatedTurn(
    setConversationState : (state: ConversationState) => void,   // The page's conversation-state setter (it also tells the avatar)
    prepareToSpeak       : (inMs: number) => void,               // Tell the avatar the reply's voice comes in `inMs`
    sendReplyCues        : (untilVoiceMs: number) => void,       // Send the actions that come with the reply's text (the voice starts in `untilVoiceMs`)
    openTimeline         : () => void,                           // Open a fresh audio timeline (called during the click)
    playReply            : () => void,                           // Play the sample reply on that timeline
    replyPlaying         : boolean,                              // The reply's audio is playing
): {startTurn: () => void; cancelTurn: () => boolean} {
    // Turn step and the pending reply's timer
    const stepRef  = useRef<TurnStep>("idle");
    const timerRef = useRef<number | null>(null);

    // Latest callbacks, so the timer never calls an old one
    const callbacksRef = useRef({setConversationState, prepareToSpeak, sendReplyCues, playReply});
    useEffect(() => { callbacksRef.current = {setConversationState, prepareToSpeak, sendReplyCues, playReply}; });

    // Follow the reply's audio: speaking once it starts, listening once it ends
    useEffect(() => {
        if      (replyPlaying  && (stepRef.current === "waiting-for-audio")) { stepRef.current = "speaking"; callbacksRef.current.setConversationState("speaking");  }
        else if (!replyPlaying && (stepRef.current === "speaking"))          { stepRef.current = "idle";     callbacksRef.current.setConversationState("listening"); }
    }, [replyPlaying]);

    // Drop the turn (another button took over, or the avatar changed), and say whether one was running
    const cancelTurn = useCallback((): boolean => {
        const running = (stepRef.current !== "idle");
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        stepRef.current  = "idle";
        return running;
    }, []);
    useEffect(() => () => { cancelTurn(); }, [cancelTurn]);

    // Think now, then reply
    const startTurn = useCallback((): void => {
        // 1) Thinking while the "LLM" works
        cancelTurn();
        openTimeline();
        stepRef.current = "thinking";
        callbacksRef.current.setConversationState("thinking");
        timerRef.current = window.setTimeout(() => {
            // 2) The reply's text arrives: breathe in for the voice, and send the reply's cues
            const untilVoiceMs = DEMO_TURN_SYNTH_MS + DEMO_TURN_VOICE_LAG_MS;
            stepRef.current = "synthesizing";
            callbacksRef.current.prepareToSpeak(untilVoiceMs);
            callbacksRef.current.sendReplyCues(untilVoiceMs);

            // 3) Its audio follows once speech synthesis is done
            timerRef.current = window.setTimeout(() => {
                timerRef.current = null;
                stepRef.current  = "waiting-for-audio";
                callbacksRef.current.playReply();
            }, DEMO_TURN_SYNTH_MS);
        }, DEMO_TURN_THINK_MS);
    }, [cancelTurn, openTimeline]);

    return {startTurn, cancelTurn};
}
