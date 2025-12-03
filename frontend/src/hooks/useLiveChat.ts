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
} : {
    onUserUtterance   : (text: string) => void;
    onSystemUtterance : (text: string) => void;
    onScores          : (            ) => void;
}) {
    // Misc. setup
    const qc = useQueryClient();
    const onLLMres = (text: string) => {
		logText(`[LLM] Response:   ${text}`);
		onSystemUtterance(text);
	};
    const [recording, setRecording] = useState(false);

    const { startPlayer, sendAudio, stopPlayer, systemSpeaking } = useAudioPlayer({sampleRate: 24_000, numChannels: 1, bitsPerSample: 32, bufferAhead: 0.2})

	const { send } = useChatSocket({
		recording,
		onLLMResponse: (text: string) => {
			onLLMres(text);
		},
		onScores,
		onUserUtt: onUserUtterance,
		onAudio: sendAudio,
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
        stopPlayer();
        send({ type: "toggle_stream", data: "stop" });
	};
    const  save = () => {
        setRecording(false); 
        send({ type: "end_chat", data: Date.now() }); 
        qc.invalidateQueries({ queryKey: ["chatSessions"] });
    };

    // Exposes start, stop & save
    return { start, stop, save }; 
}
