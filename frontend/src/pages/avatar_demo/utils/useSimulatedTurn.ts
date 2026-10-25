/* Simulate a chat turn: the user just finished, the avatar thinks, then replies.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/utils/useSimulatedTurn`

Sends the same conversation states the chat page does (`useChatAvatar`):
"thinking" for `DEMO_TURN_THINK_MS` after the user's last word, "speaking" once
the reply's audio starts, and "listening" once it ends. The reply is the sample
reply, played exactly like its own button. The click opens the audio timeline
(browsers only start audio from a user gesture), and the delayed reply plays
on it.

*/
import { useCallback, useEffect, useRef } from "react";

// From this project
import type { ConversationState } from "@/pages/common/avatar/avatarRegistry";

// How long the avatar thinks between the user's last word and the reply
const DEMO_TURN_THINK_MS = 1_000;

// Where the turn is
type TurnStep = "idle" | "thinking" | "waiting-for-audio" | "speaking";


// ================================================================================
// Simulated Turn
// ================================================================================
// Return functions that start a turn and cancel a pending one
export function useSimulatedTurn(
    setConversationState : (state: ConversationState) => void,   // The page's conversation-state setter (it also tells the avatar)
    openTimeline         : () => void,                           // Open a fresh audio timeline (called during the click)
    playReply            : () => void,                           // Play the sample reply on that timeline
    replyPlaying         : boolean,                              // The reply's audio is playing
): {startTurn: () => void; cancelTurn: () => boolean} {
    // Turn step and the pending reply's timer
    const stepRef  = useRef<TurnStep>("idle");
    const timerRef = useRef<number | null>(null);

    // Latest callbacks, so the timer never calls an old one
    const callbacksRef = useRef({setConversationState, playReply});
    useEffect(() => { callbacksRef.current = {setConversationState, playReply}; });

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
        cancelTurn();
        openTimeline();
        stepRef.current = "thinking";
        callbacksRef.current.setConversationState("thinking");
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            stepRef.current  = "waiting-for-audio";
            callbacksRef.current.playReply();
        }, DEMO_TURN_THINK_MS);
    }, [cancelTurn, openTimeline]);

    return {startTurn, cancelTurn};
}
