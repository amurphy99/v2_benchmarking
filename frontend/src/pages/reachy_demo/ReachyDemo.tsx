/*
 * Activity chat client for the isolated Reachy preview.
 * Dialogue, STT, TTS, and persistence stay in the existing backend.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import ReachyAvatar from "./ReachyAvatar";
import type { ReachyAvatarHandle } from "./ReachyAvatar";
import ReachyPreviewPanel from "./ReachyPreviewPanel";
import type { PreviewInput } from "./ReachyPreviewPanel";
import { createExpressionPolicy } from "./expressionPolicy";
import useReachyChat from "./useReachyChat";

import "./reachyDemo.css";

export default function ReachyDemo() {
    const avatarRef = useRef<ReachyAvatarHandle>(null);

    const [preview, setPreview] = useState<PreviewInput>({
        state: "idle",
        analyser: null,
    });

    // Keep policy timers and cooldowns stable across page renders.
    const behavior = useMemo(
        () => createExpressionPolicy(() => avatarRef.current),
        [],
    );

    const chat = useReachyChat(behavior);
    const canStart = chat.phase === "idle" || chat.phase === "ended";

    useEffect(() => {
        return () => {
            // Stop the recurring scheduler as well as any active gesture.
            behavior.setListening(false);
            behavior.onMotionCancel();
        };
    }, [behavior]);

    // Only live listening enables attention gestures; manual previews do not.
    useEffect(() => {
        behavior.setListening(
            chat.phase === "active" &&
            ["listening", "user-speaking"].includes(chat.avatarState),
        );
    }, [behavior, chat.phase, chat.avatarState]);

    return (
        <main className="reachy-demo-page">
            <h1>Reachy Mini Simulator</h1>

            <p>
                Start a conversation, then speak normally. This uses your
                account&apos;s activity chat and the app&apos;s default voice.
            </p>

            <div className="reachy-demo-workspace">
                <div className="reachy-demo-conversation">
                    <ReachyAvatar
                        ref={avatarRef}
                        state={canStart ? preview.state : chat.avatarState}
                        assistantAudio={
                            canStart ? preview.analyser : chat.analyser
                        }
                    />

                    <div
                        className="reachy-demo-controls"
                        aria-label="Conversation controls"
                    >
                        <button
                            type="button"
                            disabled={!canStart}
                            onClick={() => {
                                behavior.onMotionCancel();
                                setPreview({
                                    state: "idle",
                                    analyser: null,
                                });
                                chat.start();
                            }}
                        >
                            {chat.phase === "ended"
                                ? "New conversation"
                                : "Start conversation"}
                        </button>

                        <button
                            type="button"
                            disabled={canStart}
                            onClick={chat.end}
                        >
                            End conversation
                        </button>
                    </div>

                    <p role="status">
                        Connection: {chat.phase}. Robot:{" "}
                        {canStart ? preview.state : chat.avatarState}.
                    </p>

                    <label htmlFor="reachy-reply-delay">
                        Wait before replying
                    </label>{" "}

                    <select
                        id="reachy-reply-delay"
                        value={chat.replyDelay}
                        onChange={(event) =>
                            chat.changeReplyDelay(Number(event.target.value))
                        }
                    >
                        {[0.5, 0.75, 1, 1.5, 2, 3, 3.5, 4].map((seconds) => (
                            <option key={seconds} value={seconds}>
                                {seconds} seconds
                            </option>
                        ))}
                    </select>

                    <p>
                        {canStart
                            ? "Applied when the next conversation starts."
                            : chat.appliedReplyDelay === chat.replyDelay
                                ? "Reply delay applied."
                                : "Applying reply delay…"}
                    </p>

                    {chat.error && <p role="alert">{chat.error}</p>}

                    <section
                        className="reachy-demo-transcript"
                        aria-label="Conversation transcript"
                    >
                        {chat.turns.map((turn) => (
                            <p key={turn.id}>
                                <strong>
                                    {turn.role === "user" ? "You" : "Reachy"}:
                                </strong>{" "}
                                {turn.text}
                                {turn.interrupted && <em> (interrupted)</em>}
                            </p>
                        ))}
                    </section>
                </div>

                {canStart ? (
                    <ReachyPreviewPanel
                        avatarRef={avatarRef}
                        onPreviewChange={setPreview}
                    />
                ) : (
                    <aside className="reachy-demo-preview">
                        <h2>Avatar preview</h2>
                        <p>
                            End the conversation to test motions, postures,
                            or sample speech.
                        </p>
                    </aside>
                )}
            </div>
        </main>
    );
}