/*
 * Manual preview controls, mounted only when no conversation is running.
 * Sample speech is a local WAV and never calls the backend.
 */
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { ReachyAvatarHandle, ReachyState } from "./ReachyAvatar";
import { DANCES, RECORDED_EMOTIONS } from "./vendor/motion.js";

export interface PreviewInput {
    state: ReachyState;
    analyser: AnalyserNode | null;
}

const EMOTIONS = [...RECORDED_EMOTIONS].sort();
const DANCE_NAMES = Object.keys(DANCES).sort();

const POSTURES: { value: ReachyState; label: string }[] = [
    { value: "idle", label: "Idle" },
    { value: "listening", label: "Listening" },
    { value: "user-speaking", label: "User speaking" },
    { value: "processing", label: "Thinking" },
];

export default function ReachyPreviewPanel({
    avatarRef,
    onPreviewChange,
}: {
    avatarRef: RefObject<ReachyAvatarHandle | null>;
    onPreviewChange: (input: PreviewInput) => void;
}) {
    const [motion, setMotion] = useState(
        EMOTIONS.length
            ? "emotion:" + EMOTIONS[0]
            : "dance:" + DANCE_NAMES[0],
    );
    const [posture, setPosture] = useState<ReachyState>("idle");
    const [error, setError] = useState<string | null>(null);

    const audioRef = useRef<HTMLAudioElement>(null);
    const generationRef = useRef(0);

    const graphRef = useRef<{
        context: AudioContext;
        source: MediaElementAudioSourceNode;
        analyser: AnalyserNode;
    } | null>(null);

    const stopPreview = (next: ReachyState = posture) => {
        generationRef.current += 1;
        audioRef.current?.pause();
        avatarRef.current?.stopMotion();
        onPreviewChange({ state: next, analyser: null });
    };

    const playMotion = () => {
        stopPreview();
        setError(null);

        const [kind, name] = motion.split(":");

        if (kind === "emotion") {
            void avatarRef.current?.playEmotion(name);
        } else {
            avatarRef.current?.playDance(name);
        }
    };

    const playSample = async () => {
        const audio = audioRef.current;
        if (!audio) return;

        stopPreview();
        setError(null);
        const current = generationRef.current;

        try {
            // Reuse one audio graph per element across subsequent previews.
            if (!graphRef.current) {
                const context = new AudioContext();
                const source = context.createMediaElementSource(audio);
                const analyser = context.createAnalyser();

                graphRef.current = { context, source, analyser };
                source.connect(analyser);
                analyser.connect(context.destination);
            }

            const graph = graphRef.current;

            await graph.context.resume();
            if (current !== generationRef.current) return;

            audio.currentTime = 0;
            await audio.play();
            if (current !== generationRef.current) return;

            onPreviewChange({
                state: "ai-speaking",
                analyser: graph.analyser,
            });
        } catch (cause) {
            if (current !== generationRef.current) return;

            stopPreview();
            setError(
                cause instanceof Error
                    ? cause.message
                    : "Sample audio could not play.",
            );
        }
    };

    useEffect(() => {
        // Capture while mounted: React clears element refs before cleanup.
        const audio = audioRef.current;
        const avatar = avatarRef.current;

        return () => {
            generationRef.current += 1;
            audio?.pause();
            avatar?.stopMotion();

            const graph = graphRef.current;
            graphRef.current = null;

            graph?.source.disconnect();
            graph?.analyser.disconnect();

            if (graph && graph.context.state !== "closed") {
                void graph.context.close().catch(() => {});
            }
        };
    }, [avatarRef]);

    return (
        <aside
            className="reachy-demo-preview"
            aria-labelledby="reachy-preview-title"
        >
            <h2 id="reachy-preview-title">Avatar preview</h2>
            <p>Test locally before starting a conversation.</p>

            <label htmlFor="reachy-preview-motion">Motion</label>
            <select
                id="reachy-preview-motion"
                value={motion}
                onChange={(event) => setMotion(event.target.value)}
            >
                <optgroup label="Recorded emotions">
                    {EMOTIONS.map((name) => (
                        <option key={name} value={"emotion:" + name}>
                            {name}
                        </option>
                    ))}
                </optgroup>

                <optgroup label="Procedural dances">
                    {DANCE_NAMES.map((name) => (
                        <option key={name} value={"dance:" + name}>
                            {name}
                        </option>
                    ))}
                </optgroup>
            </select>

            <p>
                {EMOTIONS.length} recorded clips; {DANCE_NAMES.length} dances.
            </p>

            <div className="reachy-demo-controls">
                <button type="button" onClick={playMotion}>
                    Play motion
                </button>
                <button type="button" onClick={() => stopPreview()}>
                    Stop preview
                </button>
            </div>

            <label htmlFor="reachy-preview-posture">Posture</label>
            <select
                id="reachy-preview-posture"
                value={posture}
                onChange={(event) => {
                    const next = event.target.value as ReachyState;
                    setPosture(next);
                    stopPreview(next);
                }}
            >
                {POSTURES.map(({ value, label }) => (
                    <option key={value} value={value}>
                        {label}
                    </option>
                ))}
            </select>

            <div className="reachy-demo-controls">
                <button type="button" onClick={() => void playSample()}>
                    Play sample speech
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setPosture("idle");
                        stopPreview("idle");
                    }}
                >
                    Reset
                </button>
            </div>

            <p>Sample speech uses a prerecorded WAV, not live TTS.</p>

            {error && <p role="alert">{error}</p>}

            <audio
                ref={audioRef}
                src="/audio/sample_reply.wav"
                preload="none"
                onEnded={() => stopPreview()}
                onError={() => {
                    stopPreview();
                    setError("The local sample audio could not load.");
                }}
            />
        </aside>
    );
}