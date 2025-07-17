import { useRef, useEffect, useState } from "react";
import { ASRClass } from "@/speechProviders";
import { logText  } from '@/utils/loggingHelpers';

// Typing for the WebSocket message
interface UtteranceMessage {
    type     : "transcription";
    start_ts : number;
    end_ts   : number,
    data     : string; 
}
type WSMessage = UtteranceMessage;

// --------------------------------------------------------------------
// Automatic Speech Recognition (ASR) Hook 
// --------------------------------------------------------------------
// ToDo: The ASRClass stuff might need to be fixed itself/reduced
// ToDo: Make start_ts a variable that gets set onUserSpeakingStart, send it to the server
// ToDo: Can I move the 'logText()' call out of here?
export default function useASR({
	dataType = "transcription",
	onStart = () => {},
	onDone = () => {},
	onUserUtterance = (_: string) => {},
	sendToServer,
}: {
	dataType?: UtteranceMessage["type"];
	onStart: () => void;
	onDone: () => void;
	onUserUtterance: (text: string) => void;
	sendToServer: (msg: WSMessage) => void;
}) {
	// Flag for user currently speaking
	const [userSpeaking, setUserSpeaking] = useState(false);
	const userSpeakingRef = useRef(false);

	// Update userSpeaking, check for overlapped speech, handle the ASR transcription, log timestamps
	const onUserSpeaking = () => {}; // (used to check for overlaps here)
	const onUserSpeakingStart = () => {
		setUserSpeaking(true);
		userSpeakingRef.current = true;
		onStart();
	};
	const onUserSpeakingEnd = (text: string) => {
		setUserSpeaking(false);
		userSpeakingRef.current = false;
		logText(`[ASR] Recognized: ${text}`);
		sendToServer({
			type: dataType,
			start_ts: 0,
			end_ts: Date.now(),
			data: text,
		});
		onUserUtterance(text);
		onDone();
	};

	// Instantiate ASR
	const asrRef = useRef<ASRClass | null>(null);
	useEffect(() => {
		asrRef.current = new ASRClass({
			onUserSpeaking: onUserSpeaking,
			onUserSpeakingStart: onUserSpeakingStart,
			onUserSpeakingEnd: onUserSpeakingEnd,
		});
		return () => asrRef.current?.stop_stream(); // (clean up on unmount)
	}, []);

	// Start & Stop
	const start = () => {
		asrRef.current?.start_stream();
	};
	const stop = () => {
		asrRef.current?.stop_stream();
	};

	// Exposes flag & start/stop functions
	return { start, stop, userSpeaking, userSpeakingRef };
}
