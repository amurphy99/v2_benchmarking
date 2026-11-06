/*
 * Avatar-only preview.
 *
 * The audio is an existing local sample, not a chat reply. Live activity chat
 * will later supply the conversation state and assistant audio inputs.
 */
import { useEffect, useRef, useState } from "react";

import ReachyAvatar from "./ReachyAvatar";
import type {
    ReachyAvatarHandle,
    ReachyState,
} from "./ReachyAvatar";

import "./reachyDemo.css";

const STATES: { value: ReachyState; label: string }[] = [
    { value: "idle", label: "Idle" },
    { value: "listening", label: "Listening" },
    { value: "user-speaking", label: "User speaking" },
    { value: "processing", label: "Thinking" },
];

export default function ReachyDemo() {
    const avatarRef = useRef<ReachyAvatarHandle>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    const graphRef = useRef<{
        context: AudioContext;
        source: MediaElementAudioSourceNode;
        analyser: AnalyserNode;
    } | null>(null);

    const [state, setState] = useState<ReachyState>("idle");
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Create one audio graph per media element, after a user gesture.
    // Reusing it prevents createMediaElementSource errors on later plays.
    const playSample = async () => {
        const audio = audioRef.current;
        if (!audio) return;

        setError(null);

        try {
            if (!graphRef.current) {
                const context = new AudioContext();
                const source = context.createMediaElementSource(audio);
                const output = context.createAnalyser();

                source.connect(output);
                output.connect(context.destination);

                graphRef.current = {
                    context,
                    source,
                    analyser: output,
                };
            }

            const graph = graphRef.current;

            await graph.context.resume();
            await audio.play();

            setAnalyser(graph.analyser);
            setState("ai-speaking");
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "Sample audio could not play."
            );
        }
    };

    // Manual posture changes also stop the sample and any primary gesture.
    const chooseState = (next: ReachyState) => {
        audioRef.current?.pause();
        setAnalyser(null);
        avatarRef.current?.stopMotion();
        setState(next);
    };

    useEffect(() => {
        // Capture now: React clears element refs before passive cleanup.
        const audio = audioRef.current;

        return () => {
            audio?.pause();

            const graph = graphRef.current;
            graphRef.current = null;

            graph?.source.disconnect();
            graph?.analyser.disconnect();

            if (graph) {
                void graph.context.close().catch(() => {});
            }
        };
    }, []);

    return (
        <main className="reachy-demo-page">
            <h1>Reachy Mini avatar preview</h1>

            <p>
                Drag to rotate. Try a posture, a gesture, or the sample voice.
            </p>

            <ReachyAvatar
                ref={avatarRef}
                state={state}
                assistantAudio={analyser}
            />

            <div
                className="reachy-demo-controls"
                role="group"
                aria-label="Conversation posture"
            >
                {STATES.map(({ value, label }) => (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={state === value}
                        onClick={() => chooseState(value)}
                    >
                        {label}
                    </button>
                ))}

                <button
                    type="button"
                    onClick={() => void playSample()}
                >
                    Play sample speech
                </button>
            </div>

            <div
                className="reachy-demo-controls"
                role="group"
                aria-label="Robot gestures"
            >
                <button
                    type="button"
                    onClick={() => void avatarRef.current?.playEmotion("welcoming2")}
                >
                    Welcome
                </button>

                <button
                    type="button"
                    onClick={() => void avatarRef.current?.playEmotion("yes1")}
                >
                    Nod
                </button>

                <button
                    type="button"
                    onClick={() => void avatarRef.current?.playEmotion("thoughtful1")}
                >
                    Thoughtful
                </button>

                <button
                    type="button"
                    onClick={() => avatarRef.current?.playDance("simple_nod")}
                >
                    Dance
                </button>

                <button
                    type="button"
                    onClick={() => chooseState("idle")}
                >
                    Reset
                </button>
            </div>

            <p role="status">Posture: {state}</p>

            {error && <p role="alert">{error}</p>}

            {/* No native controls: the buttons above manage this sample. */}
            <audio
                ref={audioRef}
                src="/audio/sample_reply.wav"
                preload="none"
                onEnded={() => {
                    setAnalyser(null);
                    setState("listening");
                }}
            />
        </main>
    );
}