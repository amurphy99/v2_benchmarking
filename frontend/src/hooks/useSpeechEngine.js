import { useRef, useState, useEffect } from 'react';

import AudioStreamer from '../utils/AudioStreamer'; // --- needs to be updated to have 2 simultaneous buffers for Gemini ---
import toBase64 from '../utils/toBase64';
import { logText, logOverlap } from '../utils/loggingHelpers';
import { Providers } from '../speechProviders';
import useBackendConnection from './useBackendConnection';
import useLatencyLogger from './useLatencyLogger';

// ==================================================================== ==================================
// Speech Engine Hook
// ==================================================================== ==================================
/* Potential ideas to do next:
    - Could expose userSpeaking and/or systemSpeaking to the webpage as well if needed
  
   BIGGEST ISSUE:
    - checkOverlap doesnt work -> that needs a LOT to fix
 
*/
export default function useSpeechEngine({
    onUserUtterance,                // "You" message handler
    onSystemUtterance = () => { },   // Fires before TTS
    onScores = () => { },   // Biomarker scores
    onOverlap = () => { },   // Overlapped-speech flag
}) {
    // --------------------------------------------------------------------
    // Set up ASR & TTS provider (env var)
    // --------------------------------------------------------------------
    const PROVIDER = import.meta.env.VITE_SPEECH_PROVIDER || 'test'; // 'azure' | 'gemini' | 'test'
    const { ASR: ASRClass, TTS: TTSClass } = Providers[PROVIDER];

    // --------------------------------------------------------------------
    // States and References
    // --------------------------------------------------------------------
    const [recording, setRecording] = useState(false);
    const [systemSpeaking, setSystemSpeaking] = useState(false);
    const [userSpeaking, setUserSpeaking] = useState(false);

    // ASR, TTS, & AudioStreamer
    const asrRef = useRef(null);
    const ttsRef = useRef(null);
    const audioRef = useRef(null);

    // Keep the latest flags for overlap detection
    const systemSpeakingRef = useRef(false);
    const userSpeakingRef = useRef(false);
    useEffect(() => {
        systemSpeakingRef.current = systemSpeaking;
    }, [systemSpeaking]);
    useEffect(() => {
        userSpeakingRef.current = userSpeaking;
    }, [userSpeaking]);

    // --------------------------------------------------------------------
    // Logging Helpers
    // --------------------------------------------------------------------
    const { asrStart, asrEnd, llmEnd, ttsStart, ttsEnd } = useLatencyLogger();

    // ====================================================================
    // WebSocket & Audio Streamer
    // ==================================================================== 
    // Use text data given by the backend LLM as input for TTS and respond
    const speakResponse = (text) => {
        ttsStart();
        ttsRef.current?.speak(text);
    };
    const onLLMResponse = (data) => {
        llmEnd();
        logText(`[LLM] Response:   ${data}`);
        speakResponse(data);
        onSystemUtterance(data);
    };

    // Create the WebSocket connection
    const { sendToServer } = useBackendConnection({ recording, onLLMResponse, onScores });

    // --------------------------------------------------------------------
    //  Audio Streaming Wrapper
    // --------------------------------------------------------------------
    useEffect(() => {
        audioRef.current = new AudioStreamer({
            sampleRate: 16_000,
            chunkMs: 5_000,
            onChunk: (int16, timestamp) => {
                sendToServer({ type: 'audio_data', timestamp: timestamp, data: toBase64(int16), sampleRate: 16_000 })
            },
            onError: err => console.error('Audio error:', err)
        });
        return () => audioRef.current?.stop(); // (clean up on unmount)
    }, []);

    // ====================================================================
    // Helpers for ASR & TTS
    // ====================================================================
    // When the user starts speaking (the "speaking" tag changes to true), check if the system was also speaking
    const checkOverlap = () => {
        if (systemSpeaking && userSpeaking) {
            logOverlap();
            sendToServer({ type: 'overlapped_speech' });
            onOverlap();
        }
    };
    useEffect(() => {
        if (systemSpeaking && userSpeaking) {
            logOverlap();
        }
    }, [systemSpeaking, userSpeaking]); // (Just a test...)

    // ASR service has recognized a complete utterance and returned a text transcription
    const handleUtterance = (text) => {
        logText(`[ASR] Recognized: ${text}`);
        sendToServer({ type: 'transcription', data: text });
        onUserUtterance(text);
    };

    // [ASR] Update userSpeaking, check for overlapped speech, handle the ASR transcription, log timestamps
    const onUserSpeaking = () => { checkOverlap(); };
    const onUserSpeakingStart = () => {
        setUserSpeaking(true);
        asrStart();
    };
    const onUserSpeakingEnd = (text) => {
        setUserSpeaking(false);
        handleUtterance(text);
        asrEnd();
    };

    // [TTS] Update systemSpeaking, log timestamps --- [also add overlap check here? (if userSpeaking, cancel this?)]
    const onSystemSpeakingStart = () => {
        setSystemSpeaking(true); 
        ttsEnd();
    };
    const onSystemSpeakingEnd = () => { setSystemSpeaking(false); };

    // ====================================================================
    // Setup for ASR & TTS
    // ====================================================================
    // Instantiate ASR
    useEffect(() => {
        asrRef.current = new ASRClass({
            onUserSpeaking: onUserSpeaking,
            onUserSpeakingStart: onUserSpeakingStart,
            onUserSpeakingEnd: onUserSpeakingEnd,
        });
        return () => asrRef.current?.stop_stream();
    }, []);

    // Instantiate TTS
    useEffect(() => {
        ttsRef.current = new TTSClass({
            onStart: onSystemSpeakingStart,
            onDone: onSystemSpeakingEnd,
        });
        return () => ttsRef.current?.stop();
    }, []);

    // --------------------------------------------------------------------
    // Start & Stop Recording
    // --------------------------------------------------------------------
    // --- Could probably attach these to the recording flag just like I did with the websocket...
    const startRecording = () => {
        setRecording(true);
        asrRef.current?.start_stream();
        audioRef.current?.start();
    };

    const stopRecording = () => {
        setRecording(false);
        asrRef.current?.stop_stream();
        audioRef.current?.stop();
    };

    // Expose (maybe in the future expose userSpeaking and systemSpeaking as well)
    return { recording, startRecording, stopRecording };
}
