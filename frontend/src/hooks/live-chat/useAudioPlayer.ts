/* Schedule streamed backend TTS and report its playback boundaries.
--------------------------------------------------------------------------------
`@frontend/src/hooks/live-chat/useAudioPlayer`

Google TTS arrives as raw PCM chunks. The hook schedules those chunks on one Web
Audio timeline and reports when each persisted assistant message starts and finishes
playing. Cancelling a response invalidates all callbacks from the previous timeline.

As each chunk is scheduled, the hook also measures its loudness in the vowel
band (300-1000 Hz, where an open mouth's sound is) in 10 ms frames, stamped
with the time each frame will play. `readSpeechLoudness()` reads that record
around the moment the speakers are playing (output latency included), so the
chat page can move the avatar's mouth in step with the sound and look a little
ahead. It only reads audio that is already scheduled, so it works the same
whether a reply arrives all at once or a sentence at a time.

NOTE: During earlier testing, the first chunk occasionally seemed to be skipped. The
      exact cause has not been confirmed, so the buffering behavior remains explicit.

*/
import { useRef, useCallback, useEffect, useState } from "react";

// From this project
import { pcmToAudioBuffer } from "@/utils/functions/audioHelpers";
import   useLatencyLogger   from "@/hooks/useLatencyLogger";

// Loudness record for the avatar's mouth: the length of one frame
export const TTS_LOUDNESS_FRAME_SEC = 0.01;

// ...the band it measures (two cascaded band-pass stages), and how long played frames are kept
const TTS_VOWEL_BAND_LOW_HZ  = 300;
const TTS_VOWEL_BAND_HIGH_HZ = 1_000;
const TTS_LOUDNESS_KEEP_SEC  = 2;

// Gap between two chunks' scheduled times that still counts as back to back (the band-pass filter carries over)
const TTS_CONTIGUOUS_SEC = 0.001;


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

// One scheduled chunk's vowel-band loudness, one value per frame
interface LoudnessSegment {
    startSec : number;         // Context time the chunk starts playing
    endSec   : number;         // ...and stops
    frames   : Float32Array;   // RMS of each frame (the last one may be shorter)
}

// One browser audio timeline and the loudness of everything scheduled on it
interface PlayerTimeline {
    ctx      : AudioContext;        // Web Audio timeline the chunks are scheduled on
    loudness : LoudnessSegment[];   // Scheduled chunks' loudness, in play order
    filter   : Float64Array;        // Band-pass memory at the end of the newest chunk (x1, x2, y1, y2 per stage)
}

// What the hook gives its caller
interface AudioPlayerControls {
    startPlayer        : () => void;                                              // Open a timeline (needs a user gesture first)
    sendAudio          : (payload: AudioChunkPayload) => Promise<void>;           // Decode and schedule one TTS chunk
    stopPlayer         : () => void;                                              // Drop buffered audio and close the timeline
    cancelAudio        : () => void;                                              // Drop buffered audio and open a fresh timeline
    systemSpeaking     : boolean;                                                 // Scheduled speech has not finished playing
    readSpeechLoudness : (fromSec: number, frameCount: number) => Float32Array;   // Vowel-band loudness heard from `fromSec` from now, per frame
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

    // Create the browser audio timeline once playback is allowed to begin
    const startPlayer = useCallback(() => {
        if (!playerRef.current) {
            const ctx               = new AudioContext({ sampleRate });
            playerRef.current       = {ctx, loudness: [], filter: new Float64Array(8)};
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
            source.connect(ctx.destination);

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

            // Record the chunk's loudness for the avatar's mouth (the filter's memory carries over from a back-to-back chunk)
            const newest = player.loudness[player.loudness.length - 1];
            if ((newest === undefined) || (Math.abs(newest.endSec - startTime) > TTS_CONTIGUOUS_SEC)) player.filter.fill(0);
            player.loudness.push({startSec: startTime, endSec: startTime + audioBuffer.duration, frames: vowelBandLoudness(audioBuffer.getChannelData(0), audioBuffer.sampleRate, player.filter)});
            while (player.loudness[0].endSec < ctx.currentTime - TTS_LOUDNESS_KEEP_SEC) player.loudness.shift();

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

    // Vowel-band loudness of the speech heard `fromSec` from now and in each following frame (0 where nothing is scheduled)
    const readSpeechLoudness = useCallback((fromSec: number, frameCount: number): Float32Array => {
        const levels = new Float32Array(frameCount);
        const player = playerRef.current;
        if (!player) return levels;

        // Context time reaching the speakers right now (until the output reports its first timestamp, the render clock stands in)
        const stamp    = player.ctx.getOutputTimestamp();
        const heardSec = ((stamp.contextTime !== undefined) && (stamp.performanceTime !== undefined) && (stamp.performanceTime > 0))
            ? stamp.contextTime + ((performance.now() - stamp.performanceTime) / 1_000)
            : player.ctx.currentTime;

        // Walk the segments in play order alongside the frames
        let index = 0;
        for (let i = 0; i < frameCount; i++) {
            const atSec = heardSec + fromSec + (i * TTS_LOUDNESS_FRAME_SEC);
            while ((index < player.loudness.length) && (player.loudness[index].endSec <= atSec)) index += 1;

            // Nothing scheduled at this moment is silence
            const segment = player.loudness[index];
            if ((segment === undefined) || (atSec < segment.startSec)) continue;
            levels[i] = segment.frames[Math.min(segment.frames.length - 1, Math.floor((atSec - segment.startSec) / TTS_LOUDNESS_FRAME_SEC))];
        }
        return levels;
    }, []);

    return { startPlayer, sendAudio, stopPlayer, cancelAudio, systemSpeaking, readSpeechLoudness };
}


// --------------------------------------------------------------------------------
// Vowel-Band Loudness
// --------------------------------------------------------------------------------
// Band-pass one chunk to the vowel band and return each frame's RMS (`state` carries the filter memory to the next chunk)
function vowelBandLoudness(samples: Float32Array, rate: number, state: Float64Array): Float32Array {
    // 1) Band-pass coefficients (RBJ cookbook, 0 dB at the band's center; b1 is 0 and b2 is -b0)
    const w0    = (2 * Math.PI * Math.sqrt(TTS_VOWEL_BAND_LOW_HZ * TTS_VOWEL_BAND_HIGH_HZ)) / rate;
    const width = Math.log2(TTS_VOWEL_BAND_HIGH_HZ / TTS_VOWEL_BAND_LOW_HZ);
    const alpha = Math.sin(w0) * Math.sinh(((Math.LN2 / 2) * width * w0) / Math.sin(w0));
    const b0    = alpha / (1 + alpha);
    const a1    = (-2 * Math.cos(w0)) / (1 + alpha);
    const a2    = (1 - alpha) / (1 + alpha);

    // 2) Filter each sample through both stages, summing squares per frame
    const frameLength = Math.round(TTS_LOUDNESS_FRAME_SEC * rate);
    const frames      = new Float32Array(Math.ceil(samples.length / frameLength));
    let sumOfSquares  = 0;
    for (let i = 0; i < samples.length; i++) {
        let x = samples[i];
        for (let s = 0; s < state.length; s += 4) {
            const y = (b0 * x) - (b0 * state[s + 1]) - (a1 * state[s + 2]) - (a2 * state[s + 3]);
            state[s + 1] = state[s];     state[s]     = x;
            state[s + 3] = state[s + 2]; state[s + 2] = y;
            x = y;
        }
        sumOfSquares += x * x;

        // 3) Close each frame (and the chunk's shorter last one)
        if ((((i + 1) % frameLength) === 0) || (i === samples.length - 1)) {
            frames[Math.floor(i / frameLength)] = Math.sqrt(sumOfSquares / ((i % frameLength) + 1));
            sumOfSquares = 0;
        }
    }
    return frames;
}
