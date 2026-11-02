/* Robot view: the live chat monitor plus the robot's camera and telemetry.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/AdminRobotView`

Experimental (see `backend/chat_app/websocket/experimental/buddy/README.md`).
Opened from the Robot view link on a Buddy session's monitor page. It has the
monitor page's transcript, chat controls, avatar actions, and biomarkers over the
same listener socket, and opens a second socket for the robot's media: the camera
image, telemetry, and robot state.

NOTE: The listener wiring is copied from `AdminChat.tsx` on purpose, so the
      experiment leaves that page untouched. If this graduates, both pages
      should share one hook.

*/
import type { ReactElement     } from "react";
import      { useRef, useState } from "react";
import      { useParams        } from "react-router-dom";

// From this project
import type { CommandAck, ControlState } from "@/hooks/chat-listener/chat-controls/types";
import      { useCommandAcks           } from "@/hooks/chat-listener/chat-controls/useCommandAcks";
import type { SessionInfo              } from "@/hooks/chat-listener/data_utils/sessionData";
import      { useLocalBiomarkers       } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";
import        useChatListener            from "@/hooks/chat-listener/useChatListener";
import      { useLocalChatSession      } from "@/hooks/live-chat";
import      { getCapabilityProfile     } from "@/pages/admin/capabilities/profiles";
import      { makeSampleBiomarkerEvent, makeSampleMessage } from "@/hooks/chat-listener/data_utils/adminChatSamples";

// Admin components (reused unchanged)
import      { AdminControlsPanel } from "@/pages/admin/components/AdminControlsPanel";
import      { SessionHeader      } from "@/pages/admin/components/admin_header/SessionHeader";
import type { StreamStatus       } from "@/pages/admin/components/admin_header/StatusComponents";
import      { BiomarkerPanel     } from "@/pages/admin/components/common/BiomarkerPanel";
import      { ChatMessages       } from "@/pages/admin/components/common/ChatMessages";
import        AvatarActionsGroup   from "@/pages/admin/components/controlGroups/AvatarActionsGroup";

// Robot view
import type { InputModeState } from "./components/RobotStatePanel";
import        RobotStatePanel    from "./components/RobotStatePanel";
import type { SideTab        } from "./components/SideTabs";
import        SideTabs           from "./components/SideTabs";
import        TelemetryPanel     from "./components/TelemetryPanel";
import        VideoFeed          from "./components/VideoFeed";
import      { useMediaViewer } from "./useMediaViewer";


// ================================================================================
// Admin Robot View
// ================================================================================
// Monitor a robot's live chat and watch its camera and telemetry
export function AdminRobotView(): ReactElement {
    // Session info, messages, and biomarker scores from the listener socket
    const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
    const { session, setMessages, pushMessageObj } = useLocalChatSession();
    const { series,  setScores,   pushScoreObj   } = useLocalBiomarkers ();

    // Chat control state, and the input mode the robot's chat socket reports
    const [streamStatus, setStreamStatus] = useState<StreamStatus>("active");
    const [inputMode,    setInputMode   ] = useState<InputModeState | null>(null);
    const [controlState, setControlState] = useState<ControlState>({listening: "active", response_mode: "automatic", recording_enabled: false});

    // Ack routing (useCommandAcks registers a handler; useChatListener calls it)
    const ackHandlerRef      = useRef<(ack: CommandAck) => void>((): void => {});
    const registerAckHandler = (fn: (ack: CommandAck) => void): void => { ackHandlerRef.current = fn; };

    // --------------------------------------------------------------------------------
    // Listener Socket (wired as in AdminChat)
    // --------------------------------------------------------------------------------
    const { id } = useParams();
    const { send, connected, lastEventAt, latencyMs } = useChatListener({
        session_id        : id,
        enabled           : true,
        setSessionInfo    : setSessionInfo,
        setHistMessages   : (data) => { setMessages   (data); },
        setHistBiomarkers : (data) => { setScores     (data); },
        addNewMessage     : (data) => { pushMessageObj(data); },
        addNewBiomarkers  : (data) => { pushScoreObj  (data); },

        // Commands and the state they confirm
        onCommandAck      : (ack) => { ackHandlerRef.current(ack); },
        onStreamStatus    : (st ) => { setStreamStatus(st.status); },
        onRecordingStatus : (st ) => { setControlState((s: ControlState): ControlState => ({...s, recording_enabled: st.enabled})); },
        onControlState    : (st ) => {
            setControlState({listening: st.listening, response_mode: st.response_mode, recording_enabled: st.recording_enabled});

            // Only the robot's own commands carry the input mode (after its capability probe)
            if ((typeof st.input_mode === "string") && (typeof st.input_mode_revision === "number")) setInputMode({mode: st.input_mode, revision: st.input_mode_revision});
        },
    });

    // Every chat control's commands, with the buttons' pending flags
    const { pending, actions } = useCommandAcks({connected, send, controlState, setControlState, registerAckHandler});
    const capabilities         = getCapabilityProfile(sessionInfo?.source, sessionInfo?.avatarModel);

    // Development sample buttons in the controls row (same as AdminChat)
    const [isUserRole, setIsUserRole] = useState<boolean>(true);
    const addSampleMessage        = (): void => { pushMessageObj(makeSampleMessage(isUserRole)); setIsUserRole((prev: boolean): boolean => !prev); };
    const addSampleBiomarkerScore = (): void => { pushScoreObj(makeSampleBiomarkerEvent()); };

    // --------------------------------------------------------------------------------
    // Media Socket and Side Tabs
    // --------------------------------------------------------------------------------
    const media  = useMediaViewer(id);
    const scored = series.points.length;
    const tabs: SideTab[] = [
        {
            id      : "robot",
            label   : "Robot",
            content : <RobotStatePanel connected={media.connected} latencyMs={media.latencyMs} session={media.session} status={media.status} inputMode={inputMode} />,
        },
        {
            id      : "telemetry",
            label   : "Telemetry",
            content : <TelemetryPanel telemetry={media.telemetry} droppedTotal={media.droppedTotal} capabilities={(media.status !== null) ? media.status.capabilities : null} />,
        },
        {
            id      : "avatar",
            label   : "Avatar",
            content : <AvatarActionsGroup connected={connected} capabilities={capabilities} pending={{robot_emotion: pending.robot_emotion, robot_animation: pending.robot_animation}} onEmotion={actions.robotEmotion} onAnimation={actions.robotAnimation} />,
        },
        {
            id      : "biomarkers",
            label   : (scored > 0) ? `Biomarkers (${scored})` : "Biomarkers",
            content : <div className="rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden"><BiomarkerPanel series={series} windowSeconds="all" /></div>,
        },
    ];

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <div className="min-h-screen lg:h-screen flex flex-col bg-admin-surface text-admin-text lg:overflow-hidden">
            <SessionHeader
                title         = "Robot View"
                sessionId     = {id}
                username      = {sessionInfo?.username ?? "unknown_username"}
                source        = {sessionInfo?.source   ?? "unknown"}
                mode          = "listener"
                wsState       = {connected ? "connected" : "disconnected"}
                lastEventAt   = {lastEventAt}
                latencyMs     = {latencyMs}
                startTsUnix   = {sessionInfo?.startTs ?? null}
                messageCount  = {session.messages.length}
                streamStatus  = {streamStatus}
                inactive_chat = {false}
            />

            {/* -------------------------------------------------------------------------------- */}
            {/* Page Body */}
            {/* -------------------------------------------------------------------------------- */}
            <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[minmax(0,1fr)] gap-4 px-4 md:px-6 pt-3 pb-4">
                {/* Camera, transcript, and chat controls (the column scrolls on its own on a wide screen) */}
                <div className="min-h-0 flex flex-col gap-3 lg:overflow-y-auto">
                    <VideoFeed connected={media.connected} session={media.session} image={media.image} measuredFps={media.measuredFps} />
                    <div className="shrink-0 h-[40vh] min-h-[240px] rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden flex flex-col">
                        <ChatMessages messages={session.messages} />
                    </div>
                    <div className="shrink-0">
                        <AdminControlsPanel
                            connected            = {connected}
                            controlState         = {controlState}
                            pending              = {pending}
                            actions              = {actions}
                            onAddSampleMessage   = {addSampleMessage}
                            onAddSampleBiomarker = {addSampleBiomarkerScore}
                        />
                    </div>
                </div>

                {/* Side column: robot state, telemetry, avatar actions, biomarkers */}
                <SideTabs tabs={tabs} />
            </main>
        </div>
    );
}
