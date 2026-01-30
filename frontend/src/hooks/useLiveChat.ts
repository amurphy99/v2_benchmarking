import { useState } from "react";
import { useQueryClient      } from "@tanstack/react-query";
import { useChatSocket, useAudioStreamer } from "@/hooks/live-chat";
import { useAudioPlayer } from "./live-chat/useAudioPlayer";

import { logText } from '@/utils/loggingHelpers';

// --------------------------------------------------------------------
// Hook that handles everything involved with the chat
// --------------------------------------------------------------------
// Could expose useState flags for: connected, recording, userSpeaking, systemSpeaking.
// ToDo: Some of these logging utilities are outdated
export default function useLiveChat({
    onUserUtterance,
    onSystemUtterance = (_: string) => {},
    onScores          = (         ) => {},
    onEmotion         = (         ) => {},
    wsPath = "/ws/chat/",
    onDebugTurn,
    onRagParseError,
    onChatError,
    onChatClosed,
} : {
    onUserUtterance   : (text: string) => void;
    onSystemUtterance : (text: string) => void;
    onScores          : (            ) => void;
    onEmotion         : (emotion: string) => void;
    wsPath           ?: string;
    onDebugTurn      ?: (turn: {
                            role: "user" | "assistant";
                            text: string;
                            state?: string;
                        }) => void;
    onRagParseError  ?: () => void;
    onChatError      ?: () => void;
    onChatClosed     ?: () => void; 
}) {
    // Misc. setup
    const qc = useQueryClient();
    const onLLMres = (response) => {
		const payload = response.data;

        const text = typeof payload === "string" ? payload : payload?.text ?? "";

        onSystemUtterance(text);

        const state = typeof payload === "object" ? payload.current_scenario || payload.next_scenario : undefined;

        onDebugTurn?.({
            role: "assistant",
            text,
            state,
        });

        if (response.emotion) {
            onEmotion(response.emotion)
        }

        if (state === "close_chat") {
            setTimeout(() => {
                setRecording(false);
                send({ type: "end_chat", data: Date.now() });
                onChatClosed?.();
            }, 500);
        }
	};
    const [recording, setRecording] = useState(false);

    const { startPlayer, sendAudio, stopPlayer, systemSpeaking } = useAudioPlayer({sampleRate: 24_000, numChannels: 1, bitsPerSample: 16, bufferAhead: 0.2})

    // wrap the user utterances
    const onUserUttWrapped = (text: string) => {
        onUserUtterance(text);
        onDebugTurn?.({ role: "user", text });
    };

	const { send } = useChatSocket({
		recording,
        wsPath,
		onLLMResponse: onLLMres,
		onScores,
		onUserUtt: onUserUttWrapped,
		onAudio: sendAudio,
        onError: (msg) => {
            if (msg?.type === "rag_parse_error") {
                onRagParseError?.();
                return;
            }
            if (msg?.type === "chat_error") {
                onChatError?.();
                return;
            }
        },
	});
	const { start: startAud, stop: stopAud } = useAudioStreamer({
		chunkMs: 64,
		sendToServer: send,
	});

    // Start, Stop, & Save
    const start = () => {
		setRecording(true);
		startAud();
        startPlayer();
        send({ type: "toggle_stream", data: "start" });
	};
	const stop = () => {
		stopAud();
        send({ type: "toggle_stream", data: "stop" });
	};
    const  save = () => {
        setRecording(false); 
        stopPlayer();
        send({ type: "end_chat", data: Date.now() }); 
        qc.invalidateQueries({ queryKey: ["chatSessions"] });
    };

    // Exposes start, stop & save
    return { start, stop, save }; 
}
