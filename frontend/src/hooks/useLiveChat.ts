/* Run one participant chat: socket, microphone stream, and TTS playback.
--------------------------------------------------------------------------------
`@frontend/src/hooks/useLiveChat`

The chat page starts, pauses, and ends the chat through this hook. A backend
pause or resume (`stream_status`) stops or restarts the microphone here, and
the page hears about both through `onChatPaused` and `onChatResumed`. The TTS
player's `systemSpeaking` and `readOutputLevel` pass through for the avatar.

*/
import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient                  } from "@tanstack/react-query";
import { useChatSocket, useAudioStreamer } from "@/hooks/live-chat";
import { useAudioPlayer                  } from "./live-chat/useAudioPlayer";

// What the hook gives the chat page
interface LiveChatControls {
    start           : () => void;     // Connect if needed, then stream the microphone and play replies
    stop            : () => void;     // Pause: stop the microphone and drop buffered speech
    save            : () => void;     // End the chat
    chatEnding      : boolean;        // The backend ended the chat (the goodbye may still be playing)
    systemSpeaking  : boolean;        // Reply speech is playing
    readOutputLevel : () => number;   // Loudness (RMS, 0 to 1) of the reply speech playing now
}

// ================================================================================
// Hook that handles everything involved with the chat
// ================================================================================
// Could expose more useState flags: connected, recording, userSpeaking.
// TODO: Some of these logging utilities are outdated
export default function useLiveChat({
    onUserUtterance,
    onSystemUtterance = (_: string) => {},
    onScores          = (         ) => {},
    onRobotAction     = (         ) => {},
    wsPath = "/ws/chat/",
    onDebugTurn,
    onChatClosed,
    onChatPaused,      // Backend sent message telling us that the chat is paused
    onChatResumed,     // Backend sent message telling us that the chat is listening again
    onRecordingStatus, // Backend updates the recording status (if we are saving the audio on chat end)
} : {
    onUserUtterance   : (text    : string) => void;
    onSystemUtterance : (text    : string) => void;
    onScores          : (                ) => void;
    onRobotAction     : (data    : any   ) => void;
    wsPath            ?: string;
    onDebugTurn       ?: (turn: { role: "user" | "assistant"; text: string; state?: string; }) => void;
    onChatClosed      ?: () => void;
    onChatPaused      ?: () => void;
    onChatResumed     ?: () => void;
    onRecordingStatus ?: (enabled: boolean) => void;
}): LiveChatControls {
    // Misc. setup
    const qc = useQueryClient();

    // Handle LLM responses from the backend
    const onLLMres = (response: any) => {
        // Parse incoming data
		const payload = response.data;
        const text    = typeof payload === "string" ? payload : payload?.text ?? "";

        // System utterance behavior
        onSystemUtterance(text);

        // Maybe there is extra data
        const state = typeof payload === "object" ? payload.current_scenario || payload.next_scenario : undefined;
        onDebugTurn?.({role: "assistant", text, state, });
	};

    // Chat status trackers
    const [recording,   setRecording  ] = useState(false);  // When we need to pause/unpause
    const [chatEnding,  setChatEnding ] = useState(false);  // True after backend sends "chat_ended"

    // Playback events use the same socket but the audio player is initialized first
    const socketSendRef = useRef<(message: object) => void>(() => {});
    const reportPlaybackState = useCallback((responseId: number, state: "started" | "finished") => {
        socketSendRef.current({type: "tts_playback", data: {responseId, state}});
    }, []);

    // TODO: Maybe these values should be pulled from a config file somewhere...
    // Instantiate the audio player for backend-sent TTS
    const { startPlayer, sendAudio, stopPlayer, cancelAudio, systemSpeaking, readOutputLevel } = useAudioPlayer({
        sampleRate      : 24_000,
        numChannels     : 1,
        bitsPerSample   : 16,
        bufferAhead     : 0.2,
        onPlaybackState : reportPlaybackState,
    });

    // Wrap user utterances
    const onUserUttWrapped = (text: string) => { onUserUtterance(text); onDebugTurn?.({ role: "user", text }); };

    // --------------------------------------------------------------------------------
    // Backend chat status updates (pause/resume/end)
    // --------------------------------------------------------------------------------
    // Ref so onStreamStatus can call stopAud without depending on declaration order
    // (useAudioStreamer is defined after useChatSocket which needs onStreamStatus)
    const startAudRef = useRef<() => void>(() => {});
    const stopAudRef  = useRef<() => void>(() => {});

    // Backend-initiated stream status change ({status: "paused" | "active"})
    // Apply backend status without sending another set_listening command back
    const onStreamStatus = (data: any) => {
        const status = data?.status;
        if (status === "paused") {  stopAudRef.current(); onChatPaused ?.(); }
        if (status === "active") { startAudRef.current(); onChatResumed?.(); }
        // TODO: Depends on how we want this behavior to work. Should we stop talking on pause always?
        // ...
    };

    // Backend signals the chat has ended => wait to do end-of-chat navigation until "goodbye" audio finishes
    const handleChatEnded = () => { setChatEnding(true); };

    // Navigate once chatEnding=true AND the goodbye audio has finished playing
    useEffect(() => { if (chatEnding && !systemSpeaking) { onChatClosed?.(); } }, [chatEnding, systemSpeaking]);

    // --------------------------------------------------------------------------------
    // Chat Socket
    // --------------------------------------------------------------------------------
	const { send, prepareConnection } = useChatSocket({
		recording,
        wsPath,
		onLLMResponse     : onLLMres,
		onScores,
		onUserUtt         : onUserUttWrapped,
		onAudio           : sendAudio,
        onStreamStatus,
        onChatClosed      : handleChatEnded,
        onRobotAction,
        onRecordingStatus : (enabled) => onRecordingStatus?.(enabled),
        onCancelAudio     : cancelAudio,
	});
    socketSendRef.current = send;
	const { start: startAud, stop: stopAud } = useAudioStreamer({ chunkMs: 64, sendToServer: send, });
    startAudRef.current = startAud;
    stopAudRef .current = stopAud;

    // --------------------------------------------------------------------------------
    // Start, Stop, & Save 
    // --------------------------------------------------------------------------------
    const setListening = (state: "active" | "paused") =>
        send({type: "command", data: {id: crypto.randomUUID(), name: "set_listening", data: {state}}});

    const start = () => { prepareConnection(); setRecording(true); startAud(); startPlayer(); setListening("active"); };
	const stop  = () => {                                           stopAud();  stopPlayer(); setListening("paused"); };
    const  save = () => {                      setRecording(false);                           send({type: "end_chat", data: Date.now() }); 
        qc.invalidateQueries({ queryKey: ["chatSessions"] }); // Save invalidates chatSessions queries to force a DB refresh
    };

    // Exposes start, stop, save & chatEnding (true while goodbye audio is playing), plus the reply speech state for the avatar
    return { start, stop, save, chatEnding, systemSpeaking, readOutputLevel };
}
