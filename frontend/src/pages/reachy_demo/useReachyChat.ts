/*
 * Temporary Reachy chat transport.
 * Reuse the app's microphone and PCM player; the backend owns recognition,
 * activity state, persistence, and TTS.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { getAccess } from "@/context/AuthProvider";
import { useAudioPlayer } from "@/hooks/live-chat/useAudioPlayer";
import AudioStreamer from "@/utils/AudioStreamer";
import toBase64 from "@/utils/toBase64";

import type { ChatBehavior } from "./expressionPolicy";

type Phase =
    | "idle"
    | "connecting"
    | "active"
    | "paused"
    | "ending"
    | "ended";

interface Turn {
    id: number;
    role: "user" | "assistant";
    text: string;
}

// Also release partial initialization if permission/worklet setup failed.
function releaseMicrophone(mic: AudioStreamer) {
    if (mic.running) {
        mic.stop();
        return;
    }

    mic.worklet?.disconnect();
    mic.source?.disconnect();
    mic.stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());

    if (mic.ctx && mic.ctx.state !== "closed") {
        void mic.ctx.close().catch(() => {});
    }
}

export default function useReachyChat(behavior: ChatBehavior) {
    const socketRef = useRef<WebSocket | null>(null);
    const micRef = useRef<AudioStreamer | null>(null);
    const phaseRef = useRef<Phase>("idle");
    const nextTurnRef = useRef(0);
    const behaviorRef = useRef(behavior);

    // Match persisted reply text to its actual audio playback.
    const replyTextsRef = useRef(new Map<number, string>());
    const speakingReplyRef = useRef<number | null>(null);
    const tapRef = useRef<AnalyserNode | null>(null);

    const [phase, setPhase] = useState<Phase>("idle");
    const [turns, setTurns] = useState<Turn[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [waiting, setWaiting] = useState(false);
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

    useEffect(() => {
        behaviorRef.current = behavior;
    }, [behavior]);

    const cancelMotion = useCallback(() => {
        replyTextsRef.current.clear();
        speakingReplyRef.current = null;
        behaviorRef.current.onMotionCancel();
    }, []);

    const changePhase = useCallback((value: Phase) => {
        phaseRef.current = value;
        setPhase(value);
    }, []);

    const send = useCallback((message: object) => {
        const socket = socketRef.current;

        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }, []);

    const stopMic = useCallback(() => {
        const mic = micRef.current;
        micRef.current = null;

        if (mic) releaseMicrophone(mic);
    }, []);

    const clearTap = useCallback(() => {
        tapRef.current?.disconnect();
        tapRef.current = null;
        setAnalyser(null);
    }, []);

    /*
     * Analyse the same scheduled sources that reach the speakers.
     * Leave this analyser's output unconnected to avoid duplicate sound.
     */
    const onAudioSource = useCallback((source: AudioBufferSourceNode) => {
        if (tapRef.current?.context !== source.context) {
            tapRef.current?.disconnect();
            tapRef.current = source.context.createAnalyser();
            setAnalyser(tapRef.current);
        }

        source.connect(tapRef.current!);
    }, []);

    const player = useAudioPlayer({
        onAudioSource,

        onPlaybackState: (responseId, state) => {
            send({
                type: "tts_playback",
                data: { responseId, state },
            });

            if (state === "started") {
                speakingReplyRef.current = responseId;

                const text = replyTextsRef.current.get(responseId);
                replyTextsRef.current.delete(responseId);

                if (text) behaviorRef.current.onReplyStarted(text);
            } else if (speakingReplyRef.current === responseId) {
                // An older reply finishing must not cancel a newer gesture.
                speakingReplyRef.current = null;
                behaviorRef.current.onMotionCancel();
            }
        },
    });

    const addTurn = (role: Turn["role"], text: string) => {
        const id = ++nextTurnRef.current;
        setTurns((previous) => [...previous, { id, role, text }]);
    };

    const closeSession = useCallback((notifyBackend = true) => {
        const socket = socketRef.current;

        // Old callbacks cannot affect the next conversation.
        socketRef.current = null;

        stopMic();
        player.stopPlayer();
        clearTap();
        cancelMotion();
        setWaiting(false);

        if (notifyBackend && socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: "end_chat",
                data: Date.now(),
            }));
        }

        socket?.close();
        changePhase("ended");
    }, [
        stopMic,
        player.stopPlayer,
        clearTap,
        cancelMotion,
        changePhase,
    ]);

    const fail = (cause: unknown) => {
        setError(
            cause instanceof Error
                ? cause.message
                : "The chat could not continue.",
        );

        closeSession();
    };

    const startMic = async (socket: WebSocket) => {
        if (micRef.current) return;

        const mic = new AudioStreamer({
            sampleRate: 16_000,
            chunkMs: 64,

            onError: (cause: unknown) => {
                if (
                    socketRef.current === socket &&
                    micRef.current === mic
                ) {
                    fail(cause);
                }
            },

            onChunk: (samples: Int16Array, timestamp: number) => {
                if (
                    socketRef.current !== socket ||
                    phaseRef.current !== "active"
                ) {
                    return;
                }

                send({
                    type: "audio_data",
                    timestamp,
                    data: toBase64(samples),
                    sampleRate: 16_000,
                    channels: 1,
                    bitsPerSample: 16,
                    encoding: "pcm_s16le",
                    duration: 64,
                });
            },
        });

        micRef.current = mic;
        await mic.start();

        /*
         * getUserMedia cannot be cancelled. Release its result if End Chat
         * or navigation happened while permission was pending.
         */
        if (
            socketRef.current !== socket ||
            micRef.current !== mic
        ) {
            releaseMicrophone(mic);
        }
    };

    const start = () => {
        if (!["idle", "ended"].includes(phaseRef.current)) return;

        setError(null);
        setTurns([]);
        setWaiting(false);
        changePhase("connecting");

        try {
            const token = getAccess();

            if (!token) {
                throw new Error("Please log in before starting a chat.");
            }

            // Create playback from the button's user gesture.
            player.startPlayer();

            const url = new URL("/ws/chat/activity/", window.location.href);
            url.protocol =
                window.location.protocol === "https:" ? "wss:" : "ws:";
            url.searchParams.set("token", token);
            url.searchParams.set("source", "webapp");

            const socket = new WebSocket(url);
            socketRef.current = socket;

            let controlledClosing = false;

            socket.onopen = () => {
                if (socketRef.current !== socket) return;

                changePhase("active");

                void startMic(socket).catch((cause) => {
                    if (socketRef.current === socket) fail(cause);
                });
            };

            socket.onmessage = (event) => {
                if (socketRef.current !== socket) return;

                let frame: any;
                try {
                    frame = JSON.parse(event.data);
                } catch {
                    return;
                }

                const data = frame?.data;

                if (
                    frame?.type === "user_utt" &&
                    typeof data === "string"
                ) {
                    behaviorRef.current.onMotionCancel();
                    addTurn("user", data);
                    setWaiting(true);
                } else if (frame?.type === "llm_response") {
                    const text =
                        typeof data === "string" ? data : data?.text;

                    if (typeof text === "string") {
                        addTurn("assistant", text);

                        if (typeof frame.responseId === "number") {
                            replyTextsRef.current.set(frame.responseId, text);

                            // Bound retained text if a reply never gets audio.
                            if (replyTextsRef.current.size > 32) {
                                const oldest =
                                    replyTextsRef.current.keys().next().value;

                                if (oldest !== undefined) {
                                    replyTextsRef.current.delete(oldest);
                                }
                            }
                        }
                    }

                    setWaiting(false);
                } else if (
                    frame?.type === "audio_chunk" &&
                    ["active", "paused"].includes(phaseRef.current)
                ) {
                    void player.sendAudio(data).catch((cause) => {
                        if (socketRef.current === socket) fail(cause);
                    });
                } else if (frame?.type === "cancel_audio") {
                    cancelMotion();
                    clearTap();

                    if (["active", "paused"].includes(phaseRef.current)) {
                        player.cancelAudio();
                    }

                    setWaiting(false);
                } else if (
                    frame?.type === "robot_action" &&
                    typeof data?.kind === "string" &&
                    typeof data?.value === "string"
                ) {
                    behaviorRef.current.onRobotAction(data);
                } else if (frame?.type === "chat_ended") {
                    controlledClosing = true;
                    stopMic();

                    // Network delivery has ended; buffered goodbye audio
                    // may still be playing in the browser.
                    changePhase("ending");
                } else if (frame?.type === "stream_status") {
                    if (data?.status === "paused") {
                        /*
                         * Recognition is paused. Its spoken acknowledgement
                         * may arrive next, so keep TTS playback available.
                         */
                        stopMic();
                        changePhase("paused");
                    } else if (
                        data?.status === "active" &&
                        phaseRef.current === "paused"
                    ) {
                        player.startPlayer();
                        changePhase("active");

                        void startMic(socket).catch((cause) => {
                            if (socketRef.current === socket) fail(cause);
                        });
                    }
                }
            };

            socket.onclose = (event) => {
                if (socketRef.current !== socket) return;

                socketRef.current = null;
                stopMic();

                if (controlledClosing) {
                    changePhase("ending");
                } else {
                    setError(
                        `Chat connection closed (${event.code}). ` +
                        "Start a new conversation to retry.",
                    );
                    closeSession(false);
                }
            };

            socket.onerror = () => {
                if (socketRef.current === socket) {
                    fail(new Error("Could not connect to the chat server."));
                }
            };
        } catch (cause) {
            fail(cause);
        }
    };

    // Allow the backend's final spoken reply to finish before releasing audio.
    useEffect(() => {
        if (phase === "ending" && !player.systemSpeaking) {
            closeSession(false);
        }
    }, [phase, player.systemSpeaking, closeSession]);

    const stopPlayer = player.stopPlayer;

    useEffect(() => {
        return () => {
            const socket = socketRef.current;
            socketRef.current = null;

            stopMic();
            stopPlayer();
            tapRef.current?.disconnect();
            cancelMotion();
            socket?.close();
        };
    }, [stopMic, stopPlayer, cancelMotion]);

    const avatarState = player.systemSpeaking
        ? "ai-speaking"
        : phase === "active"
            ? waiting ? "processing" : "listening"
            : "idle";

    return {
        start,
        end: () => closeSession(),
        phase,
        turns,
        error,
        analyser,
        avatarState,
    } as const;
}