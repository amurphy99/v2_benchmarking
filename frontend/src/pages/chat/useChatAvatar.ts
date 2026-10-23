/* Keep the chat page's avatar in step with the chat.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/useChatAvatar`

Drives the avatar's optional handle methods, so avatars without them (the QT
and Buddy models) simply ignore it:

  - sleep: asleep whenever the chat isn't running and no reply is playing (on
    page load, and after a pause from either side), awake as soon as it starts
    or resumes. A paused chat still finishes the sentence it is saying first.
  - conversation look: listening while the microphone is on, thinking from the
    participant's finished utterance until the reply starts, speaking while the
    reply plays, and idle while the chat is stopped.
  - mouth: on every animation frame, the reply's vowel-band loudness at the
    moment the speakers play it (looking a little ahead, and smoothed with audio
    from both sides so it adds no lag), compared with the loudest moment of the
    last third of a second. The mouth opens on each syllable and nearly closes
    between them, whatever the voice's overall volume.

The effects also re-run when the avatar changes, so a newly mounted avatar
picks up the current sleep state and look right away.

*/
import type { RefObject } from "react";
import      { useEffect } from "react";

// From this project
import      { TTS_LOUDNESS_FRAME_SEC          } from "@/hooks/live-chat/useAudioPlayer";
import type { AvatarHandle, ConversationState } from "@/pages/common/avatar/avatarRegistry";

// Mouth timing: how far ahead of the sound it moves (lips lead speech; this also covers drawing delay), and the smoothing width
const CHAT_MOUTH_LEAD_SEC   = 0.06;
const CHAT_MOUTH_SMOOTH_SEC = 0.02;   // Gaussian sigma

// Mouth opening, from how loud the voice is next to its loudest moment just before (and just after) now
const CHAT_MOUTH_PEAK_BACK_SEC  = 0.35;   // How far back that reference peak looks
const CHAT_MOUTH_PEAK_AHEAD_SEC = 0.06;   // ...and how far ahead
const CHAT_MOUTH_RANGE_DB       = 15;     // This far below the peak reads as closed
const CHAT_MOUTH_GATE_DB        = -48;    // Quieter than this is silence (closed)
const CHAT_MOUTH_CURVE          = 1.3;    // Above 1, middling loudness opens less, so syllables stand apart

// Zero-lag Gaussian weights over loudness frames, for the smoothing width above
const CHAT_MOUTH_KERNEL = gaussianWeights(CHAT_MOUTH_SMOOTH_SEC / TTS_LOUDNESS_FRAME_SEC);

// What the chat is doing right now
type ChatActivity = {
    running        : boolean;   // Started and not paused (the microphone is on)
    systemSpeaking : boolean;   // Reply speech is playing
    awaitingReply  : boolean;   // The participant finished talking and the reply has not started
};

// Reader for the reply's vowel-band loudness, one value per frame from `fromSec` from now (`useAudioPlayer`)
type SpeechLoudnessReader = (fromSec: number, frameCount: number) => Float32Array;


// ================================================================================
// Chat Avatar
// ================================================================================
// Doze the avatar off while the chat is stopped, and drive its look and mouth while it runs
export function useChatAvatar(
    avatarRef          : RefObject<AvatarHandle | null>,   // Avatar on the chat page (null until it mounts)
    avatarModel        : string | null,                    // Avatar showing (null while the settings load)
    chat               : ChatActivity,                     // What the chat is doing right now
    readSpeechLoudness : SpeechLoudnessReader,             // The reply's loudness around the moment being heard
): void {
    // Sleep: awake while the chat runs or a reply is still playing
    const awake = chat.running || chat.systemSpeaking;
    useEffect(() => {
        if (awake) { avatarRef.current?.wake ?.(); }
        else       { avatarRef.current?.sleep?.(); }
    }, [avatarRef, avatarModel, awake]);

    // Conversation look
    const look: ConversationState =
        !chat.running       ? "idle"     :
        chat.systemSpeaking ? "speaking" :
        chat.awaitingReply  ? "thinking" :
                              "listening";
    useEffect(() => {
        avatarRef.current?.setConversationState?.(look);
    }, [avatarRef, avatarModel, look]);

    // Mouth: follow the reply's syllables every frame (silence reads as a closed mouth)
    useEffect(() => {
        let frameId = 0;
        const tick = (): void => {
            avatarRef.current?.setSpeechLevel?.(mouthOpening(readSpeechLoudness));
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [avatarRef, readSpeechLoudness]);
}


// --------------------------------------------------------------------------------
// Mouth Opening
// --------------------------------------------------------------------------------
// How open the mouth should be (0 to 1) for the speech heard right now
function mouthOpening(readSpeechLoudness: SpeechLoudnessReader): number {
    // 1) Read the frames around the reference window, plus the smoothing's reach on both ends
    const reach = (CHAT_MOUTH_KERNEL.length - 1) / 2;
    const back  = Math.round(CHAT_MOUTH_PEAK_BACK_SEC  / TTS_LOUDNESS_FRAME_SEC);
    const ahead = Math.round(CHAT_MOUTH_PEAK_AHEAD_SEC / TTS_LOUDNESS_FRAME_SEC);
    const raw   = readSpeechLoudness(CHAT_MOUTH_LEAD_SEC - ((back + reach) * TTS_LOUDNESS_FRAME_SEC), back + ahead + 1 + (2 * reach));

    // 2) Smoothed loudness (dB) across the window: its peak, and the frame the mouth shows (`back` frames in)
    let peakDb = -Infinity;
    let nowDb  = -Infinity;
    for (let i = 0; i <= back + ahead; i++) {
        let sum = 0;
        for (let k = 0; k < CHAT_MOUTH_KERNEL.length; k++) sum += CHAT_MOUTH_KERNEL[k] * raw[i + k];
        const db = 20 * Math.log10(Math.max(sum, 1e-6));
        peakDb = Math.max(peakDb, db);
        if (i === back) nowDb = db;
    }

    // 3) Silence closes the mouth; otherwise it opens by how close the voice is to that peak
    if (nowDb < CHAT_MOUTH_GATE_DB) return 0;
    return Math.pow(Math.min(1, Math.max(0, 1 - ((peakDb - nowDb) / CHAT_MOUTH_RANGE_DB))), CHAT_MOUTH_CURVE);
}

// Normalized Gaussian weights out to three sigmas on each side (sigma in frames)
function gaussianWeights(sigma: number): number[] {
    const reach   = Math.ceil(3 * sigma);
    const weights = Array.from({length: (2 * reach) + 1}, (_: unknown, i: number): number => Math.exp(-0.5 * (((i - reach) / sigma) ** 2)));
    const total   = weights.reduce((a: number, b: number) => a + b, 0);
    return weights.map((w: number) => w / total);
}
