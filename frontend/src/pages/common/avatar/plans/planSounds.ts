/* Play the short sounds a backend plan can name, beside any reply's audio.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/plans/planSounds`

An `avatar_setup` can carry a few short clips (`sounds`: an audible "mm-hm" or
"yeah" in the avatar's own voice), and a plan step plays one by name with its
`sound` action (`backend/chat_app/websocket/consumers/HARNESS_PROTOCOL.md` §2
and §3.3). They play on a timeline of their own, so a clip never moves a
reply's audio, never counts as a reply (no playback report, no speaking state,
no mouth movement), and nothing that cancels a reply's audio stops it.

The clips are raw 16-bit mono PCM. The audio timeline is made on the first
play, which comes well after the click that started the chat.

*/
// From this project
import type { SetupSound       } from "@/hooks/live-chat/avatarPlanFrames";
import      { pcmToAudioBuffer } from "@/utils/functions/audioHelpers";

// The clips' fixed format (their sample rate comes with each one)
const PLAN_SOUND_CHANNELS        = 1;
const PLAN_SOUND_BITS_PER_SAMPLE = 16;

// What the plans hook does with a session's sounds
export type PlanSounds = {
    load : (sounds: Record<string, SetupSound>) => void;   // Keep a setup's sounds, replacing the last setup's
    has  : (name: string) => boolean;                      // Whether the latest setup carries a sound by this name
    play : (name: string, volume: number) => number;       // Play one now, returning how long it lasts (ms)
};


// ================================================================================
// Plan Sounds
// ================================================================================
// Keep the session's sounds, and play one by name on its own timeline
export function createPlanSounds(): PlanSounds {
    let clips  : Map<string, {pcm: ArrayBuffer; sampleRate: number}> = new Map();
    let buffers: Map<string, AudioBuffer>                            = new Map();
    let ctx    : AudioContext | null                                 = null;

    // Keep each clip's bytes (decoded into a buffer the first time it plays)
    const load = (sounds: Record<string, SetupSound>): void => {
        clips   = new Map();
        buffers = new Map();
        for (const [name, sound] of Object.entries(sounds)) {
            const bytes = Uint8Array.from(atob(sound.audio), (character: string) => character.charCodeAt(0));
            clips.set(name, {pcm: bytes.buffer, sampleRate: sound.sample_rate});
        }
    };

    // Whether a plan may name this sound
    const has = (name: string): boolean => clips.has(name);

    // Play a sound a checked plan named, at its volume
    const play = (name: string, volume: number): number => {
        const clip = clips.get(name);
        if (clip === undefined) throw new Error(`Sound "${name}" passed the plan's name check but isn't in the setup`);
        if (ctx === null) ctx = new AudioContext();

        // Decode on first use, in this timeline
        let buffer = buffers.get(name);
        if (buffer === undefined) {
            buffer = pcmToAudioBuffer(clip.pcm, clip.sampleRate, PLAN_SOUND_CHANNELS, PLAN_SOUND_BITS_PER_SAMPLE, ctx);
            buffers.set(name, buffer);
        }

        // Its own source and volume, straight to the speakers
        const source = ctx.createBufferSource();
        const gain   = ctx.createGain();
        source.buffer   = buffer;
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        return buffer.duration * 1_000;
    };

    return {load, has, play};
}
