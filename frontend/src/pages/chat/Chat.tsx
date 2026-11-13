/* Participant chat page: the avatar, its reply, the task beside it, and controls.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/Chat`

The avatar is the center of the page, with its latest reply in large type under
it. For the tasks, the panel beside it holds what the participant works from,
from the backend's `task_card` frames: their planning card, filled in live, or
their Map Task map with its route (which gets the wider column). Before the chat
starts, the configure-chat modal picks the chat type, its cues and task version
(`chatModes.ts`), subtitles, and the avatar; starting the chat locks them.

The avatar dozes until the chat starts and follows the conversation while it
runs (`useChatAvatar`). A chat type that drives it from the backend sends plans,
which `useLiveChat` runs on it. The settings are re-read every time the page
opens, so an avatar picked on the admin or caregiver page shows on the next
visit, unless the participant picked another one for this chat.

*/
import type { ReactElement, ReactNode    } from "react";
import      { useEffect, useRef, useState } from "react";
import type { IconType                   } from "react-icons";
import      { useNavigate                } from "react-router-dom";
import      { BsBadgeCc, BsLightningCharge, BsLockFill, BsRobot, BsSliders } from "react-icons/bs";

// From this project
import        SaveChatModal                         from "@/components/modals/SaveChatModal";
import      { useLocalChatSession                 } from "@/hooks/live-chat";
import type { TaskCard                            } from "@/hooks/live-chat/taskCardFrame";
import      { useUserSettings                     } from "@/hooks/queries/useUserSettings";
import        useLiveChat                           from "@/hooks/useLiveChat";
import      { Avatar                              } from "@/pages/common/avatar/Avatar";
import type { AvatarHandle, RobotAction           } from "@/pages/common/avatar/avatarRegistry";
import      { getAvatarEntry                      } from "@/pages/common/avatar/avatarRegistry";
import type { ChatPanel                           } from "./chatModes";
import      { CHAT_MODES, CHAT_PATH, chatModeQuery } from "./chatModes";
import      { useChatAvatar                       } from "./useChatAvatar";

// Components
import type { ChatConfig         } from "./components/ChatConfigModal";
import        ChatConfigModal      from "./components/ChatConfigModal";
import        ChatControls         from "./components/ChatControls";
import        MapTaskMapPanel      from "./components/MapTaskMapPanel";
import        PlanningCardPanel    from "./components/PlanningCardPanel";
import        ReplyCaption         from "./components/ReplyCaption";

// What the caption says before the avatar's first reply
const CHAT_IDLE_TEXT = "Press Start when you're ready.";

// The button that opens the configure-chat modal (`!` outranks Bootstrap's button reset)
const CHAT_CONFIG_BUTTON_CLASS = "flex items-center gap-2 rounded-full! border-2! border-chat-accent! bg-chat-panel px-5! py-2.5 text-lg font-semibold text-chat-accent shadow-sm hover:bg-chat-accentSoft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat-accent disabled:border-chat-border! disabled:text-chat-subtext disabled:shadow-none disabled:hover:bg-chat-panel";

// The page's choices before the participant changes any (the avatar comes from their settings)
const CHAT_DEFAULT_CONFIG: Omit<ChatConfig, "avatar"> = {mode: CHAT_MODES[0], variant: CHAT_MODES[0].variants[0]?.value ?? null, cues: true, subtitles: true};

// How wide the page is, and how its two columns split, by what sits beside the avatar (a map needs the most room)
const CHAT_PANEL_LAYOUT: Record<ChatPanel, {page: string; columns: string}> = {
    none : {page: "max-w-3xl", columns: ""                                            },
    card : {page: "max-w-6xl", columns: "lg:grid-cols-[minmax(0,1fr)_24rem]"          },
    map  : {page: "max-w-7xl", columns: "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"},
};

// Where the participant's task materials go until the backend sends them (they come once the chat starts)
function taskWaiting(what: string, Icon: IconType): ReactElement {
    return (
        <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4! rounded-3xl border-2 border-dashed border-chat-border bg-chat-panel/50 p-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-chat-accentSoft text-3xl text-chat-accent">
                <Icon aria-hidden="true" />
            </span>
            <div className="max-w-xs text-lg text-balance text-chat-subtext">Your {what} appears here when the chat starts.</div>
        </div>
    );
}

// One of the chat's choices, shown under the title
function ChoiceChip({icon: Icon, children}: {icon: IconType; children: ReactNode}): ReactElement {
    return (
        <span className="flex items-center gap-1.5 rounded-full border border-chat-border! bg-chat-panel px-3! py-1 text-sm font-medium text-chat-subtext">
            <Icon aria-hidden="true" className="text-chat-accent" /> {children}
        </span>
    );
}


// ================================================================================
// Chat Page
// ================================================================================
// The participant's live chat with the avatar
export function Chat(): ReactElement {
    const navigate  = useNavigate();
    const avatarRef = useRef<AvatarHandle>(null);
    const { data: settings, isFetchedAfterMount } = useUserSettings();

    // The configure-chat choices (fixed once the chat starts), and an avatar picked for this chat only (null for the settings' avatar)
    const [config,     setConfig    ] = useState<Omit<ChatConfig, "avatar">>(CHAT_DEFAULT_CONFIG);
    const [avatarPick, setAvatarPick] = useState<string | null>(null);
    const [showConfig, setShowConfig] = useState(false);
    const { mode, variant, cues, subtitles } = config;

    // What the participant sees: their last words, the latest reply, and their task card
    const [heard,         setHeard        ] = useState<string   | null>(null);
    const [reply,         setReply        ] = useState<string   | null>(null);
    const [taskCard,      setTaskCard     ] = useState<TaskCard | null>(null);
    const [awaitingReply, setAwaitingReply] = useState(false);   // From the participant's finished utterance until the reply starts (the avatar's "thinking" look)

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

    // Avatar picked for this chat, else the participant's settings (`UserSettings.modelChoice`); null until this visit's settings arrive
    const model = isFetchedAfterMount ? (avatarPick ?? settings.modelChoice) : null;

    const { start, stop, save, chatEnding, systemSpeaking, readSpeechLoudness, readSpeechRemaining } = useLiveChat({
        onUserUtterance,
        onSystemUtterance,
        onScores          : () => {},
        onRobotAction,
        onTaskCard        : setTaskCard,
        onChatClosed      : () => { setRecording(false); setShowModal(false); navigate("/chat/end"); },
        onChatPaused      : () => { setRecording(false); },
        onChatResumed     : () => { setRecording(true ); },
        onRecordingStatus : (enabled: boolean) => { setAdminRecording(enabled); },
        wsPath            : CHAT_PATH,
        extraQuery        : chatModeQuery(mode, variant, cues),
        avatarRef,
        avatarModel       : model,
    });

    // Start or resume, pause, and end (ending asks first)
    const startChat = (): void => { start(); setRecording(true); setStarted(true); };
    const pauseChat = (): void => { stop (); setRecording(false); };
    const saveChat  = (): void => { save (); setShowModal(false); navigate("/chat/end"); };
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

    // The panel beside the avatar (the task's materials), the page's layout for it, and the avatar's framing (a held card or map needs its body)
    const panel =
        (mode.panel === "card") ? ((taskCard?.kind === "cooperative_planning") ? <PlanningCardPanel card={taskCard} /> : taskWaiting("card", mode.icon)) :
        (mode.panel === "map" ) ? ((taskCard?.kind === "map_task")             ? <MapTaskMapPanel   map={taskCard}  /> : taskWaiting("map",  mode.icon)) :
                                  null;
    const layout = CHAT_PANEL_LAYOUT[mode.panel];
    const zoom   = (window.isMobile && (panel === null)) ? "head" : "body";

    // The chat's choices, for the chips under the title and for the modal to start from
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
                    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4! pl-14">
                        <div className="flex min-w-0 flex-col gap-2">
                            <div className="text-xs font-semibold uppercase tracking-widest text-chat-subtext">Chat</div>
                            <h1 className="m-0! text-2xl! font-semibold! leading-tight! text-chat-text md:text-4xl!">{mode.label}</h1>

                            {/* The choices this chat runs with */}
                            <div className="flex flex-wrap gap-2">
                                {(variantLabel !== undefined) ? <ChoiceChip icon={mode.icon}>{variantLabel}</ChoiceChip> : null}
                                {mode.hasCues ? <ChoiceChip icon={BsLightningCharge}>Cues {cues ? "on" : "off"}</ChoiceChip> : null}
                                <ChoiceChip icon={BsBadgeCc}>Subtitles {subtitles ? "on" : "off"}</ChoiceChip>
                                <ChoiceChip icon={BsRobot}>{avatarEntry.label}</ChoiceChip>
                            </div>
                        </div>

                        {/* Opens the setup modal, until the chat starts */}
                        <button className={CHAT_CONFIG_BUTTON_CLASS} disabled={started} onClick={() => setShowConfig(true)} title={started ? "Settings are fixed once the chat starts" : undefined} type="button">
                            {started ? <><BsLockFill aria-hidden="true" /> Locked in</> : <><BsSliders aria-hidden="true" /> Set up chat</>}
                        </button>
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
                        {(panel !== null) ? <aside className="min-w-0">{panel}</aside> : null}
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

            {/* Chat choices, before the chat starts */}
            <ChatConfigModal show={showConfig} config={modalConfig} onClose={() => setShowConfig(false)} onSave={saveConfig} />

            {/* Asks before ending the chat */}
            <SaveChatModal show={showModal} onClose={() => setShowModal(false)} saveChat={saveChat} />
        </>
    );
}
