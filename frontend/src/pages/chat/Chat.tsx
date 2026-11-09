/* Participant chat page: the avatar, its reply, the task beside it, and controls.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/Chat`

The avatar is the center of the page, with its latest reply in large type under
it. For the tasks, the panel beside it holds what the participant works from:
their planning card, filled in live from the backend's `task_card` frames, or
the Map Task's instructions. Before the chat starts, the picker chooses the chat
type (`chatModes.ts`).

The avatar dozes until the chat starts and follows the conversation while it
runs (`useChatAvatar`). A chat type that drives it from the backend sends plans,
which `useLiveChat` runs on it. The settings are re-read every time the page
opens, so an avatar picked on the admin or caregiver page shows on the next
visit.

*/
import type { ReactElement                } from "react";
import      { useEffect, useRef, useState } from "react";
import      { useNavigate                 } from "react-router-dom";

// From this project
import        SaveChatModal               from "@/components/modals/SaveChatModal";
import      { useLocalChatSession       } from "@/hooks/live-chat";
import type { TaskCard                  } from "@/hooks/live-chat/taskCardFrame";
import      { useUserSettings           } from "@/hooks/queries/useUserSettings";
import        useLiveChat                 from "@/hooks/useLiveChat";
import      { Avatar                    } from "@/pages/common/avatar/Avatar";
import type { AvatarHandle, RobotAction } from "@/pages/common/avatar/avatarRegistry";
import type { ChatMode                  } from "./chatModes";
import      { CHAT_MODES, variantLabel  } from "./chatModes";
import      { useChatAvatar             } from "./useChatAvatar";

// Components
import type { DebugTurn          } from "./components/ActivityDebugPanel";
import        ActivityDebugPanel   from "./components/ActivityDebugPanel";
import        ChatControls         from "./components/ChatControls";
import        MapTaskNote          from "./components/MapTaskNote";
import        PlanningCardPanel    from "./components/PlanningCardPanel";
import        ReplyCaption         from "./components/ReplyCaption";

// What the caption says before the avatar's first reply
const CHAT_IDLE_TEXT = "Press Start when you're ready.";

// The chat type and task version pickers
const CHAT_PICKER_CLASS = "rounded-xl border border-chat-border bg-chat-panel px-4 py-2 text-base text-chat-text disabled:opacity-50";

// Where the participant's card goes until the backend sends it (it comes once the chat starts)
const CARD_WAITING = (
    <div className="rounded-2xl border border-dashed border-chat-border bg-chat-panel/60 p-6 text-lg text-chat-subtext">
        Your card appears here when the chat starts.
    </div>
);


// ================================================================================
// Chat Page
// ================================================================================
// The participant's live chat with the avatar
export function Chat(): ReactElement {
    const navigate  = useNavigate();
    const avatarRef = useRef<AvatarHandle>(null);
    const { data: settings, isFetchedAfterMount } = useUserSettings();

    // Which chat type to open, and its task content (both picked before the chat starts; null for a type without variants)
    const [mode,    setMode   ] = useState<ChatMode>(CHAT_MODES[0]);
    const [variant, setVariant] = useState<string | null>(CHAT_MODES[0].variants[0] ?? null);

    // What the participant sees: their last words, the latest reply, and their task card
    const [heard,         setHeard        ] = useState<string   | null>(null);
    const [reply,         setReply        ] = useState<string   | null>(null);
    const [taskCard,      setTaskCard     ] = useState<TaskCard | null>(null);
    const [awaitingReply, setAwaitingReply] = useState(false);   // From the participant's finished utterance until the reply starts (the avatar's "thinking" look)
    const [debugTurns,    setDebugTurns   ] = useState<DebugTurn[]>([]);

    // Where the chat is: started once, the microphone on, and an admin keeping the audio
    const [started,        setStarted       ] = useState(false);
    const [recording,      setRecording     ] = useState(false);
    const [adminRecording, setAdminRecording] = useState(false);
    const [showModal,      setShowModal     ] = useState(false);

    // Local (view-only) record of the conversation
    const { pushMessage } = useLocalChatSession();

    // --------------------------------------------------------------------------------
    // Live Chat
    // --------------------------------------------------------------------------------
    // The participant finished an utterance (the backend's transcript): the avatar starts thinking
    const onUserUtterance = (text: string): void => { pushMessage("user", text); setHeard(text); setAwaitingReply(true); };

    // The avatar's reply arrived
    const onSystemUtterance = (text: string): void => { pushMessage("assistant", text); setReply(text); };

    // Backend `robot_action` frames: {kind: "emotion" | "animation", value, duration_ms} (each avatar acts them out its own way)
    const onRobotAction = (data: RobotAction): void => { avatarRef.current?.performAction(data); };

    // Avatar from the participant's settings (`UserSettings.modelChoice`), null until this visit's settings arrive
    const model = isFetchedAfterMount ? settings.modelChoice : null;

    const { start, stop, save, chatEnding, systemSpeaking, readSpeechLoudness, readSpeechRemaining } = useLiveChat({
        onUserUtterance,
        onSystemUtterance,
        onScores          : () => {},
        onRobotAction,
        onTaskCard        : setTaskCard,
        onDebugTurn       : (turn) => { setDebugTurns((previous: DebugTurn[]) => [...previous, {ts: Date.now(), ...turn}]); },
        onChatClosed      : () => { setRecording(false); setShowModal(false); navigate("/chat/end"); },
        onChatPaused      : () => { setRecording(false); },
        onChatResumed     : () => { setRecording(true ); },
        onRecordingStatus : (enabled: boolean) => { setAdminRecording(enabled); },
        wsPath            : mode.wsPath,
        extraQuery        : new URLSearchParams((variant === null) ? mode.query : {...mode.query, variant}).toString(),
        avatarRef,
        avatarModel       : model,
    });

    // Start or resume, pause, and end (ending asks first)
    const startChat = (): void => { start(); setRecording(true); setStarted(true); };
    const pauseChat = (): void => { stop (); setRecording(false); };
    const saveChat  = (): void => { save (); setShowModal(false); navigate("/chat/end"); };
    const askToEnd  = (): void => { setShowModal(true); if (recording) pauseChat(); };

    // Picking another chat type starts its view fresh, on its default variant
    const pickMode = (index: number): void => {
        setMode(CHAT_MODES[index]);
        setVariant(CHAT_MODES[index].variants[0] ?? null);
        setTaskCard(null);
        setDebugTurns([]);
        setHeard(null);
        setReply(null);
    };

    // A reply that starts playing, or a chat that stops, ends the wait for a reply
    useEffect(() => { if (systemSpeaking || !recording) setAwaitingReply(false); }, [systemSpeaking, recording]);

    // Doze while stopped, and follow the conversation while running
    useChatAvatar(avatarRef, model, {running: recording, systemSpeaking, awaitingReply}, {readSpeechLoudness, readSpeechRemaining});

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    // Wait for this visit's settings (a cached copy could still name an avatar changed since)
    if (model === null) { return <div className="p-8 text-lg text-chat-subtext">Loading...</div>; }

    // The panel beside the avatar (the task's materials), and the avatar's framing (a held card or map needs its body)
    const panel =
        (mode.panel === "card")           ? ((taskCard !== null) ? <PlanningCardPanel card={taskCard} /> : CARD_WAITING) :
        (mode.panel === "map")            ? <MapTaskNote /> :
        (mode.panel === "activity_debug") ? <ActivityDebugPanel turns={debugTurns} /> :
                                            null;
    const zoom = (window.isMobile && (panel === null)) ? "head" : "body";

    return (
        <>
            <div className="min-h-[85vh] bg-chat-surface px-4 py-6 md:px-8">
                <div className={`mx-auto flex flex-col gap-6 ${(panel !== null) ? "max-w-6xl" : "max-w-3xl"}`}>
                    {/* -------------------------------------------------------------------------------- */}
                    {/* Chat Type */}
                    {/* -------------------------------------------------------------------------------- */}
                    <header className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-widest text-chat-subtext">Chat</div>
                            <h1 className="text-3xl font-semibold text-chat-text">{mode.label}</h1>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <select
                                aria-label = "Chat type"
                                className  = {CHAT_PICKER_CLASS}
                                disabled   = {started}
                                onChange   = {(event) => pickMode(Number(event.target.value))}
                                value      = {CHAT_MODES.indexOf(mode)}
                            >
                                {CHAT_MODES.map((option: ChatMode, index: number) => <option key={option.label} value={index}>{option.label}</option>)}
                            </select>

                            {/* The task content, for chat types that have it */}
                            {(variant !== null) ? (
                                <select
                                    aria-label = "Task version"
                                    className  = {CHAT_PICKER_CLASS}
                                    disabled   = {started}
                                    onChange   = {(event) => setVariant(event.target.value)}
                                    value      = {variant}
                                >
                                    {mode.variants.map((option: string) => <option key={option} value={option}>{variantLabel(option)}</option>)}
                                </select>
                            ) : null}
                        </div>
                    </header>

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Avatar and Task */}
                    {/* -------------------------------------------------------------------------------- */}
                    <main className={`grid gap-6 ${(panel !== null) ? "lg:grid-cols-[minmax(0,1fr)_24rem]" : ""}`}>
                        <section className="flex flex-col overflow-hidden rounded-3xl border border-chat-border bg-chat-stage shadow-sm">
                            <div className="h-[46vh] md:h-[56vh]">
                                <Avatar model={model} zoom={zoom} ref={avatarRef} />
                            </div>
                            <ReplyCaption heard={heard} reply={reply} awaitingReply={awaitingReply} idleText={CHAT_IDLE_TEXT} />
                        </section>
                        {(panel !== null) ? <aside>{panel}</aside> : null}
                    </main>

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Controls */}
                    {/* -------------------------------------------------------------------------------- */}
                    <ChatControls
                        adminRecording = {adminRecording}
                        chatEnding     = {chatEnding}
                        onEnd          = {askToEnd}
                        onPause        = {pauseChat}
                        onStart        = {startChat}
                        recording      = {recording}
                        started        = {started}
                    />
                </div>
            </div>

            {/* Asks before ending the chat */}
            <SaveChatModal show={showModal} onClose={() => setShowModal(false)} saveChat={saveChat} />
        </>
    );
}
