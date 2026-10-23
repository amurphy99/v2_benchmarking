/* Admin page for monitoring and steering one participant's live chat.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/AdminChat`

This page is where admin users can monitor and interact with a users live chat
session in real time. It receives live updates for the current chat's transcript
and biomarkers. It also has a series of "pills" in the header area where we
receive other information about the chat like the duration, time since the last
message, pause/active status from the user, and status of our own connection
with the backend.

The transcript fills the main area and scrolls on its own. Under it sit the
chat controls: pausing automatic responses (to allow more user messages to
build up before the assistant responds), sending commands for it to respond
immediately, a text box for admin users to have the bot say whatever they want,
and the recording toggle.

The side column has two tabs. "Avatar" holds the buttons for the avatar or
robot actions, which change based on the "source" attribute of the ChatSession
we are listening in on (the web interface with a virtual avatar, or either of
the two robots we also have configured to work with our system), such as
expressions (e.g. happy, sad, thinking) or movements (e.g. nodding yes or no).
"Biomarkers" holds the live biomarker scores.

On a wide screen the page fits the window and only the panels scroll; on a
narrow one everything stacks and the page itself scrolls.

*/
import { useState, useRef } from "react";
import { useParams        } from "react-router-dom";

// Hooks for the WebSocket connection and the commands sent through it
import   useChatListener    from "@/hooks/chat-listener/useChatListener";
import { useCommandAcks   } from "@/hooks/chat-listener/chat-controls/useCommandAcks";

// Command types
import type { ControlState, CommandAck } from "@/hooks/chat-listener/chat-controls/types";
import type { StreamStatus } from "./components/admin_header/StatusComponents";

// Which robot actions the monitored frontend can perform
import { getCapabilityProfile } from "./capabilities/profiles";

// Data received from the backend
import { SessionInfo         } from "@/hooks/chat-listener/data_utils/sessionData";
import { useLocalChatSession } from "@/hooks/live-chat";
import { useLocalBiomarkers  } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";

// Components
import { SessionHeader      } from "./components/admin_header/SessionHeader";
import { ChatMessages       } from "./components/common/ChatMessages";
import { AdminControlsPanel } from "./components/AdminControlsPanel";
import { LiveSidePanel      } from "./components/LiveSidePanel";

// Misc. Helpers
import { makeSampleMessage, makeSampleBiomarkerEvent } from "@/hooks/chat-listener/data_utils/adminChatSamples";

// ================================================================================
// AdminChat -- Monitor a participant's ChatSession in real time
// ================================================================================
// On a wide screen the page is a fixed-viewport layout so the controls always stay
// on screen (no page-level scrolling): the transcript and the side column each
// scroll internally, and the chat controls sit under the transcript.
export function AdminChat() {
    // SessionInfo sent initially by the backend
    const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);

    // Chat Messages & Biomarker Scores
    const { session, setMessages, pushMessageObj } = useLocalChatSession();
    const { series,  setScores,   pushScoreObj   } = useLocalBiomarkers ();

    // --------------------------------------------------------------------------------
    // WebSocket Setup
    // --------------------------------------------------------------------------------
    // Received on page load
    const { id } = useParams();

    // Connect
    const { send, connected, lastEventAt, latencyMs } = useChatListener({
        session_id        : id,
        enabled           : true,
        setSessionInfo    : setSessionInfo,
        setHistMessages   : (data) => { setMessages   (data) },
        setHistBiomarkers : (data) => { setScores     (data) },
        addNewMessage     : (data) => { pushMessageObj(data) },
        addNewBiomarkers  : (data) => { pushScoreObj  (data) },

        // For admin commands
        onCommandAck      : (ack)  => { ackHandlerRef.current(ack); },
        onStreamStatus    : (st)   => { setStreamStatus(st?.status ?? "active"); },
        onControlState    : (st)   => {
            setControlState((s) => ({
                listening         : st?.listening         ?? s.listening,
                response_mode     : st?.response_mode     ?? s.response_mode,
                recording_enabled : st?.recording_enabled ?? s.recording_enabled,
            }));
        },
        onRecordingStatus : (st)   => {
            setControlState((s) => ({...s, recording_enabled: st?.enabled ?? s.recording_enabled}));
        },
    });

    // [DEBUGGING] Sample Data Methods
    // TODO: I think we can delete these? There are multiple other places we have to look around for though...
    const [isUserRole, setIsUserRole] = useState<boolean>(true);
    function addSampleMessage       () {pushMessageObj(makeSampleMessage(isUserRole)); setIsUserRole((prev) => !prev);}
    function addSampleBiomarkerScore() {  pushScoreObj(makeSampleBiomarkerEvent()); }

    // Stream status (reflects user's chat state: active | paused | ended)
    const [streamStatus, setStreamStatus] = useState<StreamStatus>("active");

    // --------------------------------------------------------------------------------
    // Control state (command success/failure confirmed by backend acks)
    // --------------------------------------------------------------------------------
    const [controlState, setControlState] = useState<ControlState>({
        listening         : "active",
        response_mode     : "automatic",
        recording_enabled : false,
    });

    // Ack routing (useCommandAcks registers a handler; useChatListener calls it)
    const ackHandlerRef      = useRef<(ack: CommandAck) => void>(() => {});
    const registerAckHandler = (fn:   (ack: CommandAck) => void) => { ackHandlerRef.current = fn; };

    // Every control's commands, with the buttons' pending flags (shared by the controls row and the side column)
    const { pending, actions } = useCommandAcks({connected, send, controlState, setControlState, registerAckHandler});

    // Which action buttons to offer, based on what the monitored frontend can actually do.
    // `avatarModel` only matters for the webapp, where the avatar is a per-user setting.
    const capabilities = getCapabilityProfile(sessionInfo?.source, sessionInfo?.avatarModel);

    // ================================================================================
    // UI Components
    // ================================================================================
    return (
        <div className="min-h-screen lg:h-screen flex flex-col bg-admin-surface text-admin-text lg:overflow-hidden">
            {/* Page Header */}
            <SessionHeader
                title         = "Monitor Live Chat Session"
                sessionId     = {id}
                username      = {sessionInfo?.username ?? "unknown_username"}
                source        = {sessionInfo?.source   ?? "unknown"}
                mode          = "listener"
                wsState       = {connected ? "connected" : "disconnected"}
                lastEventAt   = {lastEventAt}
                latencyMs     = {latencyMs}
                startTsUnix   = {sessionInfo?.startTs      ?? null}
                messageCount  = {session.messages.length}
                streamStatus  = {streamStatus}
                inactive_chat = {false}
            />

            {/* -------------------------------------------------------------------------------- */}
            {/* Page Body */}
            {/* -------------------------------------------------------------------------------- */}
            <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)] gap-4 px-4 md:px-6 pt-3 pb-4">
                {/* Transcript (fills the column and scrolls internally) with the chat controls under it */}
                <div className="min-h-0 flex flex-col gap-3">
                    <div className="h-[60vh] lg:h-auto lg:flex-1 min-h-0 rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden flex flex-col">
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

                {/* Side column: the avatar's action buttons and the biomarker scores */}
                <LiveSidePanel
                    connected        = {connected}
                    capabilities     = {capabilities}
                    pendingEmotion   = {pending.robot_emotion}
                    pendingAnimation = {pending.robot_animation}
                    onEmotion        = {actions.robotEmotion}
                    onAnimation      = {actions.robotAnimation}
                    series           = {series}
                />
            </main>
        </div>
    );
}
