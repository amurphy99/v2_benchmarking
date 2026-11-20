/* Participant chat page: the avatar, its reply, the task beside it, and controls.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/Chat`

The avatar is the center of the page, with its latest reply in large type under
it. For the tasks, the panel beside it holds what the participant works from,
from the backend's `task_card` frames: their planning card, filled in live, or
their Map Task map with its route (which gets the wider column). Before the chat
starts, the configure-chat modal picks the chat type, its cues and task version
(`chatModes.ts`), subtitles (off unless picked), and the avatar; starting the
chat locks them. The title row names the chat type, with the button that opens
the modal (locked once the chat starts) beside it, and the task version and cues
at the row's end (the avatar shows itself, and the debug panel has the subtitles'
switch).

The page stays put when the chat ends, however it ends. The controls give way
to an end bar with the chat's length and numbers (`useChatStats`) and a button
that reloads the page for a new chat. The backend's `task_reveal` fills in the
task's end view: both Map Task maps as one, or the threads a speech elicitation
chat followed, which get a panel of their own beside the avatar (`TaskPanel`).
A planning chat's reveal, the avatar's own card, goes across the page instead,
under the avatar and the participant's card and above the end bar, so the
avatar's box keeps its size (`PlanningRevealPanel`).

The avatar dozes until the chat starts and follows the conversation while it
runs (`useChatAvatar`). A chat type that drives it from the backend sends plans,
which `useLiveChat` runs on it. The settings are re-read every time the page
opens, so an avatar picked on the admin or caregiver page shows on the next
visit, unless the participant picked another one for this chat.

An account with debug mode on (its settings' `debug_mode`, switched on the
admin Participants page) also gets the debug panel under the controls and the
timing pills under the title. The panel switches the subtitles, the cues (in
this browser only, so its chats always run `condition=cues`), and the chat
type's shared features (`useFeatureSwitches`). The pills show the round trip to
the backend and each reply's stages (`useChatTimings`).

The first start fixes the setup the socket sends (the avatar, and whether
subtitles are on), which a task chat's run saves as the chat's setup. The debug
panel's subtitles switch never changes it: the socket reopens whenever its URL
changes, so its query must stay as it was while the chat runs.

*/
import type { ReactElement, ReactNode     } from "react";
import      { useEffect, useRef, useState } from "react";
import        toast                         from "react-hot-toast";
import type { IconType                    } from "react-icons";
import      { BsLockFill, BsSliders       } from "react-icons/bs";

// From this project
import        SaveChatModal                         from "@/components/modals/SaveChatModal";
import type { CommandAck                          } from "@/hooks/chat-listener/chat-controls/types";
import type { TaskCard                            } from "@/hooks/live-chat/taskCardFrame";
import type { TaskReveal                          } from "@/hooks/live-chat/taskRevealFrame";
import      { useUserSettings                     } from "@/hooks/queries/useUserSettings";
import        useLiveChat                           from "@/hooks/useLiveChat";
import      { Avatar                              } from "@/pages/common/avatar/Avatar";
import type { AvatarHandle, RobotAction           } from "@/pages/common/avatar/avatarRegistry";
import      { getAvatarEntry                      } from "@/pages/common/avatar/avatarRegistry";
import      { CUES_LABEL                          } from "@/pages/common/debug/debugLabels";
import      { useChatTimings                      } from "@/pages/common/debug/useChatTimings";
import type { ChatPanel, ChatStartSetup           } from "./chatModes";
import      { CHAT_MODES, CHAT_PATH, chatModeQuery } from "./chatModes";
import      { useChatAvatar                       } from "./useChatAvatar";
import      { useChatStats                        } from "./useChatStats";
import      { useFeatureSwitches                  } from "./useFeatureSwitches";

// Components
import type { ChatConfig         } from "./components/ChatConfigModal";
import        ChatConfigModal      from "./components/ChatConfigModal";
import        ChatControls         from "./components/ChatControls";
import        ChatEndBar           from "./components/ChatEndBar";
import        DebugHelpModal       from "./components/DebugHelpModal";
import        DebugPanel           from "./components/DebugPanel";
import        PlanningRevealPanel  from "./components/PlanningRevealPanel";
import        ReplyCaption         from "./components/ReplyCaption";
import        TaskPanel            from "./components/TaskPanel";
import        TimingPills          from "./components/TimingPills";

// What the caption says before the avatar's first reply
const CHAT_IDLE_TEXT = "Press Start when you're ready.";

// How often debug mode times the round trip to the backend (the admin live chat page pings as often)
const CHAT_PING_MS = 3_000;

// The button that opens the configure-chat modal (`!` outranks Bootstrap's button reset)
const CHAT_CONFIG_BUTTON_CLASS = "flex items-center gap-2 rounded-full! border-2! border-chat-accent! bg-chat-panel px-5! py-2.5 text-lg font-semibold text-chat-accent shadow-sm hover:bg-chat-accentSoft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat-accent disabled:border-chat-border! disabled:text-chat-subtext disabled:shadow-none disabled:hover:bg-chat-panel";

// The page's choices before the participant changes any (the avatar comes from their settings)
const CHAT_DEFAULT_CONFIG: Omit<ChatConfig, "avatar"> = {mode: CHAT_MODES[0], variant: CHAT_MODES[0].variants[0]?.value ?? null, cues: true, subtitles: false};

// How wide the page is, and how its two columns split, by what sits beside the avatar (a map needs the most room;
// with nothing beside it, the page is as wide as with a card, so the controls and the debug pills have room)
const CHAT_PANEL_LAYOUT: Record<ChatPanel, {page: string; columns: string}> = {
    none : {page: "max-w-6xl", columns: ""                                            },
    card : {page: "max-w-6xl", columns: "lg:grid-cols-[minmax(0,1fr)_24rem]"          },
    map  : {page: "max-w-7xl", columns: "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"},
};

// One choice the chat runs with, at the title row's end (colored like the "Plan complete" banner)
function ChoiceChip({icon: Icon, children}: {icon: IconType; children: ReactNode}): ReactElement {
    return (
        <span className="flex items-center gap-1.5 rounded-full border border-chat-accent/20! bg-chat-accentSoft px-3! py-1 text-sm font-medium text-chat-accent">
            <Icon aria-hidden="true" /> {children}
        </span>
    );
}


// ================================================================================
// Chat Page
// ================================================================================
// The participant's live chat with the avatar
export function Chat(): ReactElement {
    const avatarRef = useRef<AvatarHandle>(null);
    const { data: settings, isFetchedAfterMount } = useUserSettings();

    // The configure-chat choices (fixed once the chat starts), and an avatar picked for this chat only (null for the settings' avatar)
    const [config,     setConfig    ] = useState<Omit<ChatConfig, "avatar">>(CHAT_DEFAULT_CONFIG);
    const [avatarPick, setAvatarPick] = useState<string | null>(null);
    const [showConfig, setShowConfig] = useState(false);
    const { mode, variant, cues, subtitles } = config;

    // The avatar and subtitles as the chat first started (null until then), which the socket sends
    const [startSetup, setStartSetup] = useState<ChatStartSetup | null>(null);

    // What the participant sees: their last words, the latest reply, their task card, and what the task revealed as it ended
    const [heard,         setHeard        ] = useState<string     | null>(null);
    const [reply,         setReply        ] = useState<string     | null>(null);
    const [taskCard,      setTaskCard     ] = useState<TaskCard   | null>(null);
    const [reveal,        setReveal       ] = useState<TaskReveal | null>(null);
    const [awaitingReply, setAwaitingReply] = useState(false);   // From the participant's finished utterance until the reply starts (the avatar's "thinking" look)

    // Where the chat is: started once, the microphone on, and an admin keeping the audio
    const [started,        setStarted       ] = useState(false);
    const [recording,      setRecording     ] = useState(false);
    const [adminRecording, setAdminRecording] = useState(false);
    const [showModal,      setShowModal     ] = useState(false);

    // The chat's length and numbers, for the end bar
    const { stats, noteStart, noteMessage, noteEnd } = useChatStats();

    // Debug mode (from this visit's settings): the cues shown in this browser, the help modal, and the timing
    const debugMode = isFetchedAfterMount && settings.debug_mode;
    const [cuesShown,     setCuesShown    ] = useState(true);
    const [showDebugHelp, setShowDebugHelp] = useState(false);
    const { timings, noteReplyTiming, noteLatency } = useChatTimings();

    // --------------------------------------------------------------------------------
    // Live Chat
    // --------------------------------------------------------------------------------
    // The participant finished an utterance (the backend's transcript): the avatar starts thinking
    const onUserUtterance = (text: string): void => { setHeard(text); setAwaitingReply(true); };

    // The avatar's reply arrived
    const onSystemUtterance = (text: string): void => { setReply(text); };

    // Backend `robot_action` frames: {kind: "emotion" | "animation", value, duration_ms} (each avatar acts them out its own way)
    const onRobotAction = (data: RobotAction): void => { avatarRef.current?.performAction(data); };

    // Avatar picked for this chat, else the participant's settings (`UserSettings.modelChoice`); null until this visit's settings arrive
    const model = isFetchedAfterMount ? (avatarPick ?? settings.modelChoice) : null;

    // A shared feature that couldn't be switched says why
    const onCommandAck = (ack: CommandAck): void => { if ((ack.name === "set_feature") && !ack.ok) toast.error(`Couldn't switch that feature: ${ack.message}`); };

    const { start, stop, save, chatEnding, chatOver, systemSpeaking, readSpeechLoudness, readSpeechRemaining, controlState, sendCommand } = useLiveChat({
        onUserUtterance,
        onSystemUtterance,
        onScores           : () => {},
        onRobotAction,
        onTaskCard         : setTaskCard,
        onTaskReveal       : setReveal,
        onCommittedMessage : noteMessage,
        onChatClosed       : () => { setRecording(false); setShowModal(false); noteEnd(); },
        onChatPaused       : () => { setRecording(false); },
        onChatResumed      : () => { setRecording(true ); },
        onRecordingStatus  : (enabled: boolean) => { setAdminRecording(enabled); },
        wsPath             : CHAT_PATH,
        extraQuery         : chatModeQuery(mode, variant, debugMode || cues, startSetup),
        avatarRef,
        avatarModel        : model,
        onCommandAck,
        onReplyTiming      : noteReplyTiming,
        onLatency          : noteLatency,
        pingMs             : debugMode ? CHAT_PING_MS : null,
        hideCues           : debugMode && !cuesShown,
    });

    // Debug mode's switches for the chat type's shared features
    const { switches, toggle } = useFeatureSwitches(debugMode ? mode.features : [], controlState, sendCommand);

    // Start or resume (the first start fixes the setup the socket sends), pause, and end
    // (ending asks first; the page stays put, and the end bar comes once the socket closes)
    const startChat = (avatar: string): void => { if (!started) setStartSetup({avatar, subtitles}); start(); setRecording(true); setStarted(true); noteStart(); };
    const pauseChat = (): void => { stop (); setRecording(false); };
    const saveChat  = (): void => { save (); setShowModal(false); };
    const askToEnd  = (): void => { setShowModal(true); if (recording) pauseChat(); };

    // Apply the modal's choices (another chat type starts its task view fresh)
    const saveConfig = ({avatar, ...rest}: ChatConfig): void => {
        if (rest.mode !== mode) setTaskCard(null);
        setConfig(rest);
        setAvatarPick(avatar);
        setShowConfig(false);
    };

    // A reply that starts playing, or a chat that stops, ends the wait for a reply
    useEffect(() => { if (systemSpeaking || !recording) setAwaitingReply(false); }, [systemSpeaking, recording]);

    // Doze while stopped, and follow the conversation while running
    useChatAvatar(avatarRef, model, {running: recording, systemSpeaking, awaitingReply}, {readSpeechLoudness, readSpeechRemaining});

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    // Wait for this visit's settings (a cached copy could still name an avatar changed since)
    if (model === null) {
        return (
            <div className="flex min-h-dvh items-center justify-center gap-3 bg-chat-surface text-lg text-chat-subtext">
                <span aria-hidden="true" className="h-6 w-6 animate-spin rounded-full border-2 border-chat-accent border-t-transparent" />
                Getting your chat ready…
            </div>
        );
    }

    // What goes beside the avatar (a speech elicitation chat's threads get a card's column once it ends), the page's
    // layout for it, and the avatar's framing (a held card or map needs its body)
    const panel  = (reveal?.kind === "speech_elicitation") ? "card" : mode.panel;
    const layout = CHAT_PANEL_LAYOUT[panel];
    const zoom   = (window.isMobile && (panel === "none")) ? "head" : "body";

    // The chat's choices, for the chips in the title row and for the modal to start from
    const avatarEntry  = getAvatarEntry(model);
    const variantLabel = mode.variants.find((option) => option.value === variant)?.label;
    const modalConfig  = {...config, avatar: avatarEntry.id};

    return (
        <>
            <div className="min-h-dvh bg-chat-surface px-4! py-4! md:px-8">
                <div className={`mx-auto flex flex-col gap-6 ${layout.page}`}>
                    {/* -------------------------------------------------------------------------------- */}
                    {/* Chat Type and Configure */}
                    {/* -------------------------------------------------------------------------------- */}
                    <header className="flex flex-col gap-3! pl-14">
                        {/* Title row: the chips sit at its end, or on a line of their own */}
                        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3!">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2!">
                                {/* Chat type, raised to sit level with the pills */}
                                <h1 className="m-0! -translate-y-0.5 text-2xl! font-semibold! leading-tight! text-chat-text md:-translate-y-1 md:text-4xl!">{mode.label}</h1>

                                {/* Opens the setup modal, until the chat starts */}
                                <button className={CHAT_CONFIG_BUTTON_CLASS} disabled={started} onClick={() => setShowConfig(true)} title={started ? "Settings are fixed once the chat starts" : undefined} type="button">
                                    {started ? <><BsLockFill aria-hidden="true" /> Locked in</> : <><BsSliders aria-hidden="true" /> Set up chat</>}
                                </button>
                            </div>

                            {/* The choices this chat runs with that can't be seen on the page */}
                            <div className="flex flex-wrap gap-2">
                                {(variantLabel !== undefined) ? <ChoiceChip icon={mode.icon}>{variantLabel}</ChoiceChip> : null}
                                {mode.hasCues ? <ChoiceChip icon={CUES_LABEL.icon}>Cues {(debugMode ? cuesShown : cues) ? "on" : "off"}</ChoiceChip> : null}
                            </div>
                        </div>

                        {/* Debug mode: each reply's total delay and its stages, and the round trip */}
                        {debugMode ? <TimingPills features={mode.features} timings={timings} /> : null}
                    </header>

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Avatar and Task */}
                    {/* -------------------------------------------------------------------------------- */}
                    <main className={`grid gap-6 ${layout.columns}`}>
                        <section className="flex flex-col overflow-hidden rounded-3xl border border-chat-border! bg-chat-stage shadow-sm">
                            <div className="h-[46vh] md:h-[56vh]">
                                <Avatar model={model} zoom={zoom} ref={avatarRef} />
                            </div>
                            {subtitles ? <ReplyCaption heard={heard} reply={reply} awaitingReply={awaitingReply} idleText={CHAT_IDLE_TEXT} /> : null}
                        </section>
                        {(panel !== "none") ? <aside className="min-w-0"><TaskPanel mode={mode} card={taskCard} reveal={reveal} /></aside> : null}
                    </main>

                    {/* -------------------------------------------------------------------------------- */}
                    {/* The Avatar's Card, Once a Planning Chat Ends */}
                    {/* -------------------------------------------------------------------------------- */}
                    {(reveal?.kind === "cooperative_planning") ? <PlanningRevealPanel reveal={reveal} /> : null}

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Controls, or the End Bar */}
                    {/* -------------------------------------------------------------------------------- */}
                    {chatOver ? (
                        <ChatEndBar disconnected={!chatEnding} showWords={mode.panel === "none"} stats={stats} />
                    ) : (
                        <ChatControls
                            adminRecording = {adminRecording}
                            chatEnding     = {chatEnding}
                            onEnd          = {askToEnd}
                            onPause        = {pauseChat}
                            onStart        = {() => startChat(avatarEntry.id)}
                            recording      = {recording}
                            started        = {started}
                        />
                    )}

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Debug Panel (its switches act on a running chat) */}
                    {/* -------------------------------------------------------------------------------- */}
                    {(debugMode && !chatOver) ? (
                        <DebugPanel
                            cuesShown   = {cuesShown}
                            hasCues     = {mode.hasCues}
                            onCues      = {setCuesShown}
                            onFeature   = {toggle}
                            onHelp      = {() => setShowDebugHelp(true)}
                            onSubtitles = {(on: boolean) => setConfig({...config, subtitles: on})}
                            subtitles   = {subtitles}
                            switches    = {switches}
                        />
                    ) : null}
                </div>
            </div>

            {/* Chat choices, before the chat starts, and what the debug panel's switches and numbers mean */}
            <ChatConfigModal show={showConfig} config={modalConfig} debugMode={debugMode} onClose={() => setShowConfig(false)} onSave={saveConfig} />
            <DebugHelpModal  show={showDebugHelp} onClose={() => setShowDebugHelp(false)} />

            {/* Asks before ending the chat */}
            <SaveChatModal show={showModal} onClose={() => setShowModal(false)} saveChat={saveChat} />
        </>
    );
}
