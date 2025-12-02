import { useRef, useCallback, useState } from "react";

import { pcmToAudioBuffer } from "@/utils/functions/audioHelpers";
import   useLatencyLogger      from "@/hooks/useLatencyLogger";

/**
 * Audio player hook.
 * @param sampleRate The sample rate of the audio to play.
 * @param numChannels The number of channels of the audio to play.
 * @param bitsPerSample The bits per sample of the audio to play.
 * @param bufferAhead How much audio should be buffered before starting to play.
 * @returns 
 */
export function useAudioPlayer( {sampleRate = 24_000, numChannels = 1, bitsPerSample = 32, bufferAhead = 0.2} ) {
    const [systemSpeaking, setSystemSpeaking] = useState(false);
	const audioContextRef = useRef<AudioContext>(null);
	const scheduleTimeRef = useRef<number>(0);
    const firstAudio = useRef<boolean>(false);

    const { ttsStart, ttsEnd } = useLatencyLogger();

	const startPlayer = useCallback(() => {
		if (!audioContextRef.current) {
			audioContextRef.current = new AudioContext();
			scheduleTimeRef.current = audioContextRef.current.currentTime + bufferAhead;
		}
	}, [bufferAhead]);

	const sendAudio = useCallback(
		async (bytes: string) => {
			if (!audioContextRef.current) return;
			const ctx = audioContextRef.current;
            const data = JSON.parse(bytes).data;
			const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
			const bufferToDecode = raw.buffer;
			try {
				const audioBuffer = pcmToAudioBuffer(bufferToDecode, sampleRate, numChannels, 16, ctx);
				const startTime = Math.max(scheduleTimeRef.current, ctx.currentTime + bufferAhead);

				const source = ctx.createBufferSource();
				source.buffer = audioBuffer;
				source.connect(ctx.destination);
                if (!firstAudio.current) {
                    firstAudio.current = true;
                    ttsStart();
                    setSystemSpeaking(true);
                }
				source.start(startTime);

				scheduleTimeRef.current = startTime + audioBuffer.duration;

                source.onended = () => {
                    // When the last scheduled chunk ends, mark systemSpeaking false and log end of tts
                    if (scheduleTimeRef.current <= ctx.currentTime + 0.01) {
                        setSystemSpeaking(false);
                        firstAudio.current = false;
                        ttsEnd();
                    }
                };
			} catch (e) {
				console.error("Could not decode audio data: ", e);
			}
		}, [sampleRate, numChannels, bitsPerSample, bufferAhead]);

	const stopPlayer = useCallback(() => {
		if (audioContextRef.current) {
			audioContextRef.current.close();
			audioContextRef.current = null;
		}
		scheduleTimeRef.current = 0;
	}, []);

	return { startPlayer, sendAudio, stopPlayer, systemSpeaking };
}
