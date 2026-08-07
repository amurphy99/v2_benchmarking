import { useState, useEffect, useRef     } from "react";
import { useQueryClient                  } from "@tanstack/react-query";
import { useChatSocket, useAudioStreamer } from "@/hooks/live-chat";
import { useAudioPlayer                  } from "./live-chat/useAudioPlayer";

// ================================================================================
// Hook that handles everything involved with the chat
// ================================================================================
// Could expose useState flags for: connected, recording, userSpeaking, systemSpeaking.
// TODO: Some of these logging utilities are outdated
export default function useLiveChat({
    onUserUtterance,
    onSystemUtterance = (_: string) => {},
    onScores          = (         ) => {},
    onEmotion         = (         ) => {},
    onExpression      = (         ) => {},
    wsPath = "/ws/chat/",
    onDebugTurn,
    onRagParseError,
    onChatError,
    onChatClosed,
    onChatPaused,      // Backend sent message telling us that the chat is paused
    onRecordingStatus, // Backend updates the recording status (if we are saving the audio on chat end)
} : {
    onUserUtterance   : (text    : string) => void;
    onSystemUtterance : (text    : string) => void;
    onScores          : (                ) => void;
    onEmotion         : (emotion : string) => void;
    onExpression      : (data    : any   ) => void;
    wsPath            ?: string;
    onDebugTurn       ?: (turn: { role: "user" | "assistant"; text: string; state?: string; }) => void;
    onRagParseError   ?: () => void;
    onChatError       ?: () => void;
    onChatClosed      ?: () => void;
    onChatPaused      ?: () => void;
    onRecordingStatus ?: (enabled: boolean) => void;
}) {
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

        if (typeof response.data === "object" && response.data?.emotion) { onEmotion(response.data.emotion); }

        // if (state === "close_chat") {
        //     setTimeout(() => {
        //         setRecording(false);
        //         send({ type: "end_chat", data: Date.now() });
        //         onChatClosed?.();
        //     }, 500);
        // }
	};

    // Chat status trackers
    const [recording,   setRecording  ] = useState(false);  // When we need to pause/unpause
    const [chatEnding,  setChatEnding ] = useState(false);  // True after backend sends "chat_ended"

    // Instantiate the audio player for backend-sent TTS
    const { startPlayer, sendAudio, stopPlayer, cancelAudio, systemSpeaking } = useAudioPlayer({sampleRate: 24_000, numChannels: 1, bitsPerSample: 16, bufferAhead: 0.2})

    // Wrap user utterances
    const onUserUttWrapped = (text: string) => { onUserUtterance(text); onDebugTurn?.({ role: "user", text }); };

    // --------------------------------------------------------------------------------
    // Backend chat status updates (pause/resume/end)
    // --------------------------------------------------------------------------------
    // Ref so onStreamStatus can call stopAud without depending on declaration order
    // (useAudioStreamer is defined after useChatSocket which needs onStreamStatus)
    const startAudRef = useRef<() => void>(() => {});
    const stopAudRef  = useRef<() => void>(() => {});

    // Backend-initiated stream status change ("paused" | "active")
    // Apply backend status without sending another pause_listening command back
    const onStreamStatus = (status: string) => {
        if (status === "paused") { stopAudRef.current (); onChatPaused?.(); }
        if (status === "active") { startAudRef.current();                   }
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
        onError           : (msg) => {
            if (msg?.type === "rag_parse_error") { onRagParseError?.(); return; }
            if (msg?.type ===      "chat_error") { onChatError    ?.(); return; }
        },
        onExpression      : onExpression,
        onRecordingStatus : (enabled) => onRecordingStatus?.(enabled),
        onCancelAudio      : cancelAudio,
	});
	const { start: startAud, stop: stopAud } = useAudioStreamer({ chunkMs: 64, sendToServer: send, });
    startAudRef.current = startAud;
    stopAudRef .current = stopAud;

    // --------------------------------------------------------------------------------
    // Start, Stop, & Save 
    // --------------------------------------------------------------------------------
    const start = () => { prepareConnection(); setRecording(true); startAud(); startPlayer(); send({type: "command", data: {id: crypto.randomUUID(), name: "pause_listening", data: false}}); };
	const stop  = () => {                                           stopAud();  stopPlayer(); send({type: "command", data: {id: crypto.randomUUID(), name: "pause_listening", data: true }}); };
    const  save = () => {                      setRecording(false);                           send({type: "end_chat", data: Date.now() }); 
        qc.invalidateQueries({ queryKey: ["chatSessions"] }); // Save invalidates chatSessions queries to force a DB refresh
    };

    // Exposes start, stop, save & chatEnding (true while goodbye audio is playing)
    return { start, stop, save, chatEnding };
}
