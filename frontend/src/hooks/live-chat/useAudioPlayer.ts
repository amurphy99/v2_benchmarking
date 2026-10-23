/* Schedule streamed backend TTS and report its playback boundaries.
--------------------------------------------------------------------------------
`@frontend/src/hooks/live-chat/useAudioPlayer`

Google TTS arrives as raw PCM chunks. The hook schedules those chunks on one Web
Audio timeline and reports when each persisted assistant message starts and finishes
playing. Cancelling a response invalidates all callbacks from the previous timeline.

Every chunk plays through one `AnalyserNode` on its way to the speakers. The node
passes the audio on unchanged (no delay, no extra buffering), and
`readOutputLevel()` reads it to report how loud the speech is at that moment;
the chat page moves the avatar's mouth with it.

NOTE: During earlier testing, the first chunk occasionally seemed to be skipped. The
      exact cause has not been confirmed, so the buffering behavior remains explicit.

*/
import { useRef, useCallback, useEffect, useState } from "react";

// From this project
import { pcmToAudioBuffer } from "@/utils/functions/audioHelpers";
import   useLatencyLogger   from "@/hooks/useLatencyLogger";

// Samples in each loudness reading (about 43 ms of speech at 24 kHz)
const TTS_LEVEL_WINDOW_SAMPLES = 1_024;


// ================================================================================
// Playback Types
// ================================================================================
type PlaybackState = "started" | "finished";

interface AudioChunkPayload {
    b64            : string;   // Base64-encoded raw PCM bytes
    responseId?    : number;   // Persisted assistant ChatMessage ID
    sampleRate?    : number;   // PCM samples per second
    channels?      : number;   // Interleaved PCM channel count
    bitsPerSample? : number;   // PCM sample bit depth
    sequence?      : number;   // Zero-based chunk position in the response
    last?          : boolean;  // Whether this is the response's final chunk
}

interface AudioPlayerOptions {
    sampleRate?      : number;  // Fallback rate for payloads without format metadata
    numChannels?     : number;  // Fallback channel count
    bitsPerSample?   : number;  // Fallback sample bit depth
    bufferAhead?     : number;  // Seconds scheduled ahead of the browser playhead
    onPlaybackState? : (responseId: number, state: PlaybackState) => void;
}

interface ResponsePlayback {
    started    : boolean;        // Whether the start event was already reported
    finished   : boolean;        // Whether the finish event was already reported
    startTimer : number | null;  // Timer aligned to the first chunk's scheduled start
}

// One browser audio timeline and the loudness tap every chunk plays through
interface PlayerTimeline {
    ctx      : AudioContext;                // Web Audio timeline the chunks are scheduled on
    analyser : AnalyserNode;                // Pass-through tap between the chunks and the speakers
    samples  : Float32Array<ArrayBuffer>;   // Reused buffer for one loudness reading
}

// What the hook gives its caller
interface AudioPlayerControls {
    startPlayer     : () => void;                                      // Open a timeline (needs a user gesture first)
    sendAudio       : (payload: AudioChunkPayload) => Promise<void>;   // Decode and schedule one TTS chunk
    stopPlayer      : () => void;                                      // Drop buffered audio and close the timeline
    cancelAudio     : () => void;                                      // Drop buffered audio and open a fresh timeline
    systemSpeaking  : boolean;                                         // Scheduled speech has not finished playing
    readOutputLevel : () => number;                                    // Loudness (RMS, 0 to 1) of the speech playing now
}


// ================================================================================
// Audio Player Hook
// ================================================================================
export function useAudioPlayer({
    sampleRate      = 24_000,
    numChannels     = 1,
    bitsPerSample   = 16,
    bufferAhead     = 0.2,
    onPlaybackState = () => {},
}: AudioPlayerOptions): AudioPlayerControls {
    /*
    Schedule each PCM chunk on a shared Web Audio timeline and expose controls for
    starting, stopping, and cancelling assistant speech.
    */
    const [systemSpeaking, setSystemSpeaking] = useState(false);

    // Audio scheduling state (the timeline is null until `startPlayer` and after `stopPlayer`)
    const playerRef       = useRef<PlayerTimeline | null>(null);
    const scheduleTimeRef = useRef<number>(0);
    const firstAudio      = useRef<boolean>(false);

    // Per-response reporting and cancellation state
    const playbackGenerationRef = useRef<number>(0);
    const responsePlaybackRef   = useRef<Map<number, ResponsePlayback>>(new Map());
    const playbackHandlerRef    = useRef(onPlaybackState);

    const { ttsStart, ttsEnd } = useLatencyLogger();

    // Keep scheduled callbacks pointed at the latest parent handler
    useEffect(() => {
        playbackHandlerRef.current = onPlaybackState;
    }, [onPlaybackState]);

    // Create the browser audio timeline and its loudness tap once playback is allowed to begin
    const startPlayer = useCallback(() => {
        if (!playerRef.current) {
            const ctx        = new AudioContext({ sampleRate });
            const analyser   = ctx.createAnalyser();
            analyser.fftSize = TTS_LEVEL_WINDOW_SAMPLES;
            analyser.connect(ctx.destination);

            playerRef.current       = {ctx, analyser, samples: new Float32Array(TTS_LEVEL_WINDOW_SAMPLES)};
            scheduleTimeRef.current = ctx.currentTime + bufferAhead;
        }
    }, [sampleRate, bufferAhead]);

    // Schedule a start report for the exact Web Audio time of the first response chunk
    const schedulePlaybackStart = useCallback((responseId: number, startTime: number, generation: number) => {
        let playback = responsePlaybackRef.current.get(responseId);
        if (!playback) {
            playback = {
                started    : false,
                finished   : false,
                startTimer : null,
            };
            responsePlaybackRef.current.set(responseId, playback);
        }
        if ((playback.started) || (playback.startTimer !== null)) return;

        const player = playerRef.current;
        if (!player) return;

        const delayMs = Math.max(0, (startTime - player.ctx.currentTime) * 1_000);

        // Ignore this timer if cancellation has replaced its playback generation
        playback.startTimer = window.setTimeout(() => {
            if (generation !== playbackGenerationRef.current) return;

            playback.started    = true;
            playback.startTimer = null;
            playbackHandlerRef.current(responseId, "started");
        }, delayMs);
    }, []);

    // Decode and schedule one raw backend TTS chunk
    const sendAudio = useCallback(async (payload: AudioChunkPayload) => {
        const player = playerRef.current;
        if (!player) return;
        const ctx = player.ctx;

        const raw = Uint8Array.from(atob(payload.b64), (character) => character.charCodeAt(0));

        try {
            // Decode using payload metadata, with hook settings retained for older servers
            const audioBuffer = pcmToAudioBuffer(
                raw.buffer,
                payload.sampleRate    ?? sampleRate,
                payload.channels      ?? numChannels,
                payload.bitsPerSample ?? bitsPerSample,
                ctx,
            );

            // Schedule this chunk directly after everything already buffered
            const startTime  = Math.max(scheduleTimeRef.current, ctx.currentTime + bufferAhead);
            const source     = ctx.createBufferSource();
            const generation = playbackGenerationRef.current;
            source.buffer    = audioBuffer;
            source.connect(player.analyser);   // The tap passes it on to the speakers unchanged

            // Mark the overall TTS player active on the first scheduled chunk
            if (!firstAudio.current) {
                firstAudio.current = true;
                ttsStart();
                setSystemSpeaking(true);
            }
            if (typeof payload.responseId === "number") {
                schedulePlaybackStart(payload.responseId, startTime, generation);
            }

            source.start(startTime);
            scheduleTimeRef.current = startTime + audioBuffer.duration;

            // Report completion and clear speaking state after scheduled audio ends
            source.onended = () => {
                if (generation !== playbackGenerationRef.current) return;

                if ((payload.last) && (typeof payload.responseId === "number")) {
                    const playback = responsePlaybackRef.current.get(payload.responseId);
                    if ((playback) && (!playback.finished)) {
                        if (playback.startTimer !== null) window.clearTimeout(playback.startTimer);
                        if (!playback.started) {
                            playback.started = true;
                            playbackHandlerRef.current(payload.responseId, "started");
                        }

                        playback.finished = true;
                        playbackHandlerRef.current(payload.responseId, "finished");
                        responsePlaybackRef.current.delete(payload.responseId);
                    }
                }

                if (scheduleTimeRef.current <= ctx.currentTime + 0.01) {
                    setSystemSpeaking(false);
                    firstAudio.current = false;
                    ttsEnd();
                }
            };

        } catch (error) {
            console.error("Could not decode audio data: ", error);
        }
    }, [sampleRate, numChannels, bitsPerSample, bufferAhead, schedulePlaybackStart, ttsStart, ttsEnd]);

    // Cancel buffered audio and invalidate callbacks from its playback generation
    const stopPlayer = useCallback(() => {
        playbackGenerationRef.current += 1;
        responsePlaybackRef.current.forEach((playback) => {
            if (playback.startTimer !== null) window.clearTimeout(playback.startTimer);
        });
        responsePlaybackRef.current.clear();

        if (playerRef.current) {
            playerRef.current.ctx.close();
            playerRef.current = null;
        }

        scheduleTimeRef.current = 0;
        firstAudio.current      = false;
        setSystemSpeaking(false);
    }, []);

    // Replace cancelled playback with a fresh timeline for later TTS responses
    const cancelAudio = useCallback(() => {
        stopPlayer();
        startPlayer();
    }, [stopPlayer, startPlayer]);

    // Loudness (RMS, 0 to 1) of the speech playing right now (0 while no timeline is open)
    const readOutputLevel = useCallback((): number => {
        const player = playerRef.current;
        if (!player) return 0;

        // Root mean square of the most recent window of samples
        player.analyser.getFloatTimeDomainData(player.samples);
        let sumOfSquares = 0;
        for (const sample of player.samples) sumOfSquares += sample * sample;
        return Math.sqrt(sumOfSquares / player.samples.length);
    }, []);

    return { startPlayer, sendAudio, stopPlayer, cancelAudio, systemSpeaking, readOutputLevel };
}
