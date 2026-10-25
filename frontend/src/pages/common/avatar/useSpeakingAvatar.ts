/* Drive an avatar's mouth, and optionally its gaze, from the reply it speaks.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/useSpeakingAvatar`

Shared by the chat page and the avatar demo page, so both read the audio
player (`useAudioPlayer`) the same way. On every animation frame:

  - mouth (while reply audio plays): the reply's vowel-band loudness at the
    moment the speakers play it (looking a little ahead, and smoothed with
    audio from both sides so it adds no lag), compared with the loudest moment
    of the last third of a second. The mouth opens on each syllable and partly
    closes between them (fully only at pauses), whatever the voice's overall
    volume.
  - speech phase (only with `speechGaze` on): where the avatar is in its own
    reply, which the avatar turns into where it looks. Over the last few words
    it is "wrapping-up", from just before the end until a moment after it is
    "finishing", through a silence in the scheduled audio it is "pausing", and
    otherwise "talking" while speech plays. The end is known once the reply's
    final chunk is scheduled; with sentence streaming that is at least a
    sentence ahead.

Avatars without these handle methods (the QT and Buddy models) ignore them.

*/
import type { RefObject         } from "react";
import      { useEffect, useRef } from "react";

// From this project
import      { TTS_LOUDNESS_FRAME_SEC    } from "@/hooks/live-chat/useAudioPlayer";
import type { AvatarHandle, SpeechPhase } from "./avatarRegistry";

// Mouth timing: how far ahead of the sound it moves (lips lead speech; this also covers the face's mouth easing), and the smoothing width
const SPEAKING_MOUTH_LEAD_SEC   = 0.08;
const SPEAKING_MOUTH_SMOOTH_SEC = 0.035;  // Gaussian sigma

// Mouth opening, from how loud the voice is next to its loudest moment just before (and just after) now
const SPEAKING_MOUTH_PEAK_BACK_SEC  = 0.35;   // How far back that reference peak looks
const SPEAKING_MOUTH_PEAK_AHEAD_SEC = 0.06;   // ...and how far ahead
const SPEAKING_MOUTH_RANGE_DB       = 22;     // This far below the peak reads as closed (wider keeps quiet sounds between syllables a little open)
const SPEAKING_MOUTH_GATE_DB        = -48;    // Quieter than this is silence (closed)
const SPEAKING_MOUTH_CURVE          = 1.3;    // Above 1, middling loudness opens less, so syllables stand apart

// Zero-lag Gaussian weights over loudness frames, for the smoothing width above
const SPEAKING_MOUTH_KERNEL = gaussianWeights(SPEAKING_MOUTH_SMOOTH_SEC / TTS_LOUDNESS_FRAME_SEC);

// The silence gate as a loudness level, for the speech phases
const SPEAKING_VOICE_GATE = 10 ** (SPEAKING_MOUTH_GATE_DB / 20);

// Speech phases: the silence ahead that counts as a pause, and the stretches around the reply's end
const SPEAKING_PAUSE_SEC       = 0.2;   // Silent this long, starting now, is a pause once the voice was heard (shorter gaps sit inside words)
const SPEAKING_WRAP_UP_SEC     = 1.4;   // Last stretch of the reply (about its last few words)
const SPEAKING_FINISH_SEC      = 0.3;   // Final moment before the end...
const SPEAKING_FINISH_HOLD_SEC = 1.5;   // ...and how long after it the avatar keeps looking at the user

// The audio player's readers for the speech it is playing (`useAudioPlayer`)
export type SpeechReaders = {
    readSpeechLoudness  : (fromSec: number, frameCount: number) => Float32Array;   // Vowel-band loudness heard from `fromSec` from now, per frame
    readSpeechRemaining : () => number | null;                                     // Seconds until the reply's final audio is heard (null while unknown)
};


// ================================================================================
// Speaking Avatar
// ================================================================================
// Move the avatar's mouth with the reply every frame, and send its speech phase when `speechGaze` is on
export function useSpeakingAvatar(
    avatarRef  : RefObject<AvatarHandle | null>,   // Avatar on the page (null until it mounts)
    speech     : SpeechReaders,                    // The player's readers
    speaking   : boolean,                          // Reply speech is playing (the player's `systemSpeaking`)
    speechGaze : boolean,                          // Also send the speech phase (the chat page leaves it off until it is tested)

    onSpeechPhase? : (phase: SpeechPhase) => void,   // Told each time the phase changes (the demo page shows it)
): void {
    // Latest speaking flag and phase listener, read by the frame loop
    const speakingRef = useRef<boolean>(speaking);
    const listenerRef = useRef(onSpeechPhase);
    useEffect(() => { speakingRef.current = speaking;      }, [speaking]);
    useEffect(() => { listenerRef.current = onSpeechPhase; }, [onSpeechPhase]);

    const {readSpeechLoudness, readSpeechRemaining} = speech;
    useEffect(() => {
        let frameId     = 0;
        let lastPhase   : SpeechPhase = "none";
        let wasSpeaking = false;
        let heardVoice  = false;   // The reply's voice has been heard (silence before its first word is not a pause)
        const tick = (): void => {
            // Mouth only while reply audio plays, then closed once (so other mouth inputs, like the demo's slider, still work)
            const avatar = avatarRef.current;
            if      (speakingRef.current) avatar?.setSpeechLevel?.(mouthOpening(readSpeechLoudness));
            else if (wasSpeaking        ) avatar?.setSpeechLevel?.(0);
            wasSpeaking = speakingRef.current;

            // Sent every frame (a newly mounted avatar picks it up), reported to the page only when it changes
            if (speechGaze) {
                heardVoice  = speakingRef.current && (heardVoice || (readSpeechLoudness(0, 1)[0] >= SPEAKING_VOICE_GATE));
                const phase = speechPhase(readSpeechLoudness, readSpeechRemaining(), speakingRef.current, heardVoice);
                avatar?.setSpeechPhase?.(phase);
                if (phase !== lastPhase) listenerRef.current?.(phase);
                lastPhase = phase;
            }
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);

        // Leave no phase behind when the loop stops
        return () => {
            cancelAnimationFrame(frameId);
            if (speechGaze) avatarRef.current?.setSpeechPhase?.("none");
        };
    }, [avatarRef, readSpeechLoudness, readSpeechRemaining, speechGaze]);
}


// --------------------------------------------------------------------------------
// Mouth Opening
// --------------------------------------------------------------------------------
// How open the mouth should be (0 to 1) for the speech heard right now
function mouthOpening(readSpeechLoudness: SpeechReaders["readSpeechLoudness"]): number {
    // 1) Read the frames around the reference window, plus the smoothing's reach on both ends
    const reach = (SPEAKING_MOUTH_KERNEL.length - 1) / 2;
    const back  = Math.round(SPEAKING_MOUTH_PEAK_BACK_SEC  / TTS_LOUDNESS_FRAME_SEC);
    const ahead = Math.round(SPEAKING_MOUTH_PEAK_AHEAD_SEC / TTS_LOUDNESS_FRAME_SEC);
    const raw   = readSpeechLoudness(SPEAKING_MOUTH_LEAD_SEC - ((back + reach) * TTS_LOUDNESS_FRAME_SEC), back + ahead + 1 + (2 * reach));

    // 2) Smoothed loudness (dB) across the window: its peak, and the frame the mouth shows (`back` frames in)
    let peakDb = -Infinity;
    let nowDb  = -Infinity;
    for (let i = 0; i <= back + ahead; i++) {
        let sum = 0;
        for (let k = 0; k < SPEAKING_MOUTH_KERNEL.length; k++) sum += SPEAKING_MOUTH_KERNEL[k] * raw[i + k];
        const db = 20 * Math.log10(Math.max(sum, 1e-6));
        peakDb = Math.max(peakDb, db);
        if (i === back) nowDb = db;
    }

    // 3) Silence closes the mouth; otherwise it opens by how close the voice is to that peak
    if (nowDb < SPEAKING_MOUTH_GATE_DB) return 0;
    return Math.pow(Math.min(1, Math.max(0, 1 - ((peakDb - nowDb) / SPEAKING_MOUTH_RANGE_DB))), SPEAKING_MOUTH_CURVE);
}

// Normalized Gaussian weights out to three sigmas on each side (sigma in frames)
function gaussianWeights(sigma: number): number[] {
    const reach   = Math.ceil(3 * sigma);
    const weights = Array.from({length: (2 * reach) + 1}, (_: unknown, i: number): number => Math.exp(-0.5 * (((i - reach) / sigma) ** 2)));
    const total   = weights.reduce((a: number, b: number) => a + b, 0);
    return weights.map((w: number) => w / total);
}


// --------------------------------------------------------------------------------
// Speech Phase
// --------------------------------------------------------------------------------
// Where the avatar is in its reply, from the reply's known end and the silence just ahead
function speechPhase(
    readSpeechLoudness : SpeechReaders["readSpeechLoudness"],   // The player's loudness reader
    remainingSec       : number | null,                         // Seconds until the reply's end is heard (null while unknown)
    speaking           : boolean,                               // Reply speech is playing
    heardVoice         : boolean,                               // The reply's voice has been heard yet
): SpeechPhase {
    // 1) Around a known end: aside over the last few words, then at the user until a moment after it
    if ((remainingSec !== null) && (remainingSec > -SPEAKING_FINISH_HOLD_SEC)) {
        if (remainingSec <= SPEAKING_FINISH_SEC ) return "finishing";
        if (remainingSec <= SPEAKING_WRAP_UP_SEC) return "wrapping-up";
    }
    if (!speaking) return "none";

    // 2) While speech plays: a pause when every frame of the next stretch is silent, after the voice has been heard
    const ahead = readSpeechLoudness(0, Math.round(SPEAKING_PAUSE_SEC / TTS_LOUDNESS_FRAME_SEC));
    return (heardVoice && ahead.every((level: number) => level < SPEAKING_VOICE_GATE)) ? "pausing" : "talking";
}
