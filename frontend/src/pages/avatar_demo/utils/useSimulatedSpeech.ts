/* Fake a speaking voice's loudness so the demo page can drive an avatar's mouth.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/utils/useSimulatedSpeech`

Produces syllable-like bursts (each rises and falls once, with a random peak and
the occasional pause) at about the rate of normal speech. A live chat would send
the real TTS audio level through the same `setSpeechLevel` call instead.

*/
import { useEffect, useRef } from "react";

// Syllable shape
const SIM_SPEECH_SYLLABLE_MS  = 220;    // Length of one syllable
const SIM_SPEECH_MIN_PEAK     = 0.35;   // Quietest syllable peak (the loudest is 1)
const SIM_SPEECH_PAUSE_CHANCE = 0.15;   // Chance a syllable is silent, like a short pause


// --------------------------------------------------------------------------------
// Simulated Speech
// --------------------------------------------------------------------------------
// Call `onLevel` every frame with a 0-1 voice level while `enabled`, and with 0 when it stops
export function useSimulatedSpeech(enabled: boolean, onLevel: (level: number) => void): void {
    // Latest callback, so a new one never restarts the loop
    const onLevelRef = useRef(onLevel);
    useEffect(() => { onLevelRef.current = onLevel; });

    useEffect(() => {
        if (!enabled) return;

        // 1) Start the first syllable
        let frameId       = 0;
        let syllableStart = performance.now();
        let peak          = nextPeak();

        // 2) Each frame, move along the current syllable's rise and fall
        const tick = (nowMs: number): void => {
            if (nowMs - syllableStart >= SIM_SPEECH_SYLLABLE_MS) { syllableStart = nowMs; peak = nextPeak(); }
            const u = (nowMs - syllableStart) / SIM_SPEECH_SYLLABLE_MS;
            onLevelRef.current(peak * Math.sin(Math.PI * u));
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);

        // 3) Close the mouth when the simulation stops
        return () => { cancelAnimationFrame(frameId); onLevelRef.current(0); };
    }, [enabled]);
}

// Peak level for the next syllable (sometimes silent)
function nextPeak(): number {
    if (Math.random() < SIM_SPEECH_PAUSE_CHANCE) return 0;
    return SIM_SPEECH_MIN_PEAK + (Math.random() * (1 - SIM_SPEECH_MIN_PEAK));
}
