import { useRef, useCallback, useState } from "react";

import { pcmToAudioBuffer } from "@/utils/functions/audioHelpers";
import   useLatencyLogger   from "@/hooks/useLatencyLogger";

/** ===============================================================================
 *  Audio player hook.
 * ================================================================================
 * 2026-02-27 -- There were a couple times while testing where it seemed like the 
 *               first chunk got skipped... Not sure what is the cause, but I am 
 *               just going to leave things as is for now.  
 * 
 * @param sampleRate    The sample rate of the audio to play.
 * @param numChannels   The number of channels of the audio to play.
 * @param bitsPerSample The bits per sample of the audio to play.
 * @param bufferAhead   How much audio should be buffered before starting to play.
 * @returns 
 */
export function useAudioPlayer( {sampleRate = 24_000, numChannels = 1, bitsPerSample = 16, bufferAhead = 0.2} ) {
    const [systemSpeaking, setSystemSpeaking] = useState(false);
    const audioContextRef = useRef<AudioContext>(null);
    const scheduleTimeRef = useRef<number>(0);
    const firstAudio      = useRef<boolean>(false);

    const { ttsStart, ttsEnd } = useLatencyLogger();

    const startPlayer = useCallback(() => {
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext({ sampleRate });
            scheduleTimeRef.current = audioContextRef.current.currentTime + bufferAhead;
        }
    }, [bufferAhead]);

    // --------------------------------------------------------------------------------
    // Passed the "data" field of the LLMs response
    // --------------------------------------------------------------------------------
    // `bytes` used to be a string, now we just start with the data already parsed 
    const sendAudio = useCallback(
        async (bytes) => {
            if (!audioContextRef.current) return;
            const ctx  = audioContextRef.current;

            // New parsing (check `tts_streaming.py` in the backend to see what this object is)
            const payload = bytes; //JSON.parse(bytes);
            const b64     = payload.b64;
            const raw     = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

            // Check if we are getting WAV or PCM
            //const head = String.fromCharCode(raw[0], raw[1], raw[2], raw[3]);
            //console.log("[TTS] head:", head); // "RIFF" means WAV header

            // --------------------------------------------------------------------------------
            // Process the PCM bytes and play them through the audio player
            // --------------------------------------------------------------------------------
            const bufferToDecode = raw.buffer;
            try {
                // The most important part/line of this file
                const audioBuffer = pcmToAudioBuffer(bufferToDecode, sampleRate, numChannels, bitsPerSample, ctx);

                // Start speaking
                const startTime = Math.max(scheduleTimeRef.current, ctx.currentTime + bufferAhead);
                const source    = ctx.createBufferSource();
                source.buffer   = audioBuffer;
                source.connect(ctx.destination);

                // Difference between the first chunk of audio and the "middle" chunks of audio (I think that's what this is for..?)
                if (!firstAudio.current) { firstAudio.current = true; ttsStart(); setSystemSpeaking(true); }
                source.start(startTime);
                scheduleTimeRef.current = startTime + audioBuffer.duration;

                // When the last scheduled chunk ends, mark systemSpeaking false and log end of tts
                source.onended = () => {
                    if (scheduleTimeRef.current <= ctx.currentTime + 0.01) { 
                        setSystemSpeaking(false); firstAudio.current = false; ttsEnd(); 
                    }
                };

            } catch (e) { console.error("Could not decode audio data: ", e);}
        }, [sampleRate, numChannels, bitsPerSample, bufferAhead]);


    // Stop speaking
    const stopPlayer = useCallback(() => {
        if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
        scheduleTimeRef.current = 0;
    }, []);

    return { startPlayer, sendAudio, stopPlayer, systemSpeaking };
}
