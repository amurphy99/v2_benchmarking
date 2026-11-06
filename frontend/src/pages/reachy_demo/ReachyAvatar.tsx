/*
 * React lifecycle around Pollen Robotics' renderer and motion implementation.
 *
 * Conversation state and assistant audio are inputs. This component never
 * opens a microphone, WebSocket, or chat session.
 */
import type { Ref } from "react";
import {
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";

import { RobotViewer } from "./vendor/gltf-robot.js";
import { RobotMotion } from "./vendor/motion.js";

export type ReachyState =
    | "idle"
    | "listening"
    | "user-speaking"
    | "processing"
    | "ai-speaking";

export interface ReachyAvatarHandle {
    playEmotion(name: string): Promise<void>;
    playDance(name: string): void;
    stopMotion(): void;
}

export default function ReachyAvatar({
    state = "idle",
    assistantAudio = null,
    ref,
}: {
    state?: ReachyState;
    assistantAudio?: AnalyserNode | null;
    ref?: Ref<ReachyAvatarHandle>;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const motionRef = useRef<RobotMotion | null>(null);

    const stateRef = useRef(state);
    const audioRef = useRef(assistantAudio);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Inputs can change before the model finishes loading. Keep their latest
    // values so initialization uses the current state rather than stale props.
    useEffect(() => {
        stateRef.current = state;
        motionRef.current?.setState(state);
    }, [state]);

    useEffect(() => {
        audioRef.current = assistantAudio;
        motionRef.current?.attachAssistantAudio(assistantAudio);
    }, [assistantAudio]);

    // Expose gestures without making the surrounding page depend on the
    // upstream viewer or its internal objects.
    useImperativeHandle(ref, () => ({
        async playEmotion(name: string) {
            try {
                await motionRef.current?.playEmotion(name);
            } catch (cause) {
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "Could not load motion."
                );
            }
        },

        playDance(name: string) {
            motionRef.current?.playDance(name);
        },

        stopMotion() {
            motionRef.current?.stopEmotion();
            motionRef.current?.stopDance();
        },
    }), []);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        // Each mount gets its own pointer-event target, including React
        // StrictMode's setup/cleanup/setup cycle.
        const container = document.createElement("div");
        container.className = "reachy-demo-canvas";
        host.appendChild(container);

        let cancelled = false;
        let viewer: RobotViewer;
        let motion: RobotMotion | null = null;

        try {
            viewer = new RobotViewer(container);
        } catch (cause) {
            container.remove();
            setLoading(false);
            setError(
                cause instanceof Error
                    ? cause.message
                    : "WebGL could not start."
            );
            return;
        }

        const ready = Promise.all([
            viewer.load(),
            viewer.texturesReady(),
        ])
            .then(() => {
                if (cancelled) return;

                motion = new RobotMotion(viewer);
                motion.setState(stateRef.current);
                motion.attachAssistantAudio(audioRef.current);
                motionRef.current = motion;

                viewer.start();
                motion.start();
                setLoading(false);
            })
            .catch((cause: unknown) => {
                motion?.dispose();
                viewer.dispose();

                if (!cancelled) {
                    setLoading(false);
                    setError(
                        cause instanceof Error
                            ? cause.message
                            : "Reachy could not load."
                    );
                }
            });

        return () => {
            cancelled = true;
            motion?.dispose();

            if (motionRef.current === motion) {
                motionRef.current = null;
            }

            // Remove the old event target and its canvas immediately.
            container.remove();

            // A model request can finish after navigation. Wait before
            // disposing so its late geometry is released as well.
            void ready.then(() => viewer.dispose());
        };
    }, []);

    return (
        <div className="reachy-demo-viewer">
            <div ref={hostRef} className="reachy-demo-stage" />

            {loading && (
                <p className="reachy-demo-overlay" role="status">
                    Loading Reachy…
                </p>
            )}

            {error && (
                <p className="reachy-demo-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}