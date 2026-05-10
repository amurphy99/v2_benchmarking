/* AdminChat.tsx
--------------------------------------------------------------------------------
This page is where admin users can monitor and interact with a users live chat 
session in real time. It has two panels that receive live updates for the current 
chats transcript and biomarkers. It also has a series of "pills" in the header 
area where we receive other information about the chat like the duration, time 
since the last message, pause/active status from the user, and status of our own 
connection with the backend. 

It has two sets of control panels at the bottom. One is for controlling response
behavior from the chatbot -- pausing automatic responses (to allow more user 
messages to build up before the assistant responds), sending commands for it to
respond immediately, and a text box for admin users to have the bot say whatever
they want. 

The second set of controls is a simple panel with buttons. This is ultimately
meant to change based on the "source" attribute of the ChatSession we are 
listening in on, as that attribute indicates if the chat is with the web 
interface (with a virtual robot avatar), or either of the two robots that we 
also have configured to work with our system. Each one of these types of robots
has a variety of actions/movements it can do such as making different 
expressions (e.g. happy, sad, thinking, etc.) or subtle movements (e.g. nodding
yes or no). 

*/
import { useState, useRef } from "react";
import { useParams        } from "react-router-dom";

// Hook for handling the WebSocket connection
import useChatListener from "@/hooks/chat-listener/useChatListener";

// Command types
import type { ControlState, CommandAck } from "@/hooks/chat-listener/chat-controls/types";
import type { StreamStatus } from "./components/admin_header/StatusComponents";

// Data received from the backend
import { SessionInfo         } from "@/hooks/chat-listener/data_utils/sessionData";
import { useLocalChatSession } from "@/hooks/live-chat";
import { useLocalBiomarkers  } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";

// Components
import { SessionHeader      } from "./components/admin_header/SessionHeader";
import { SessionHistory     } from "./components/common/SessionHistory";
import { AdminControlsPanel } from "./components/AdminControlsPanel";

// Misc. Helpers
import { makeSampleMessage, makeSampleBiomarkerEvent } from "@/hooks/chat-listener/data_utils/adminChatSamples";

// ================================================================================
// AdminChat -- Monitor a participant's ChatSession in real time
// ================================================================================
// Live page is laid out as a fixed-viewport flex column so the controls always
// stay on screen (no page-level scrolling). SessionHistory takes the remaining
// space and scrolls internally; AdminControlsPanel pins to the bottom.
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
            listeningPaused : st?.listeningPaused ?? s.listeningPaused,
            responsesPaused : st?.responsesPaused ?? s.responsesPaused,
            manualMode      : st?.manualMode      ?? s.manualMode,
            }));
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
        listeningPaused: false,
        responsesPaused: false,
        manualMode     : false,
    });

    // Ack routing (AdminControlsPanel registers a handler; useChatListener calls it)
    const ackHandlerRef      = useRef<(ack: CommandAck) => void>(() => {});
    const registerAckHandler = (fn:   (ack: CommandAck) => void) => { ackHandlerRef.current = fn; };

    // ================================================================================
    // UI Components
    // ================================================================================
    return (
        <div className="h-screen flex flex-col bg-admin-surface text-admin-text overflow-hidden">
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
            <main className="flex-1 min-h-0 flex flex-col px-4 md:px-6 pb-4 gap-3">
                {/* Chat Messages & Biomarker History  (fills available space, scrolls internally) */}
                <div className="flex-1 min-h-0 mt-3">
                    <SessionHistory messages={session.messages} series={series} fillHeight />
                </div>

                {/* Control Buttons (pinned to bottom) */}
                <div className="shrink-0">
                    <AdminControlsPanel
                        connected            = {connected}
                        send                 = {send}
                        controlState         = {controlState}
                        setControlState      = {setControlState}
                        registerAckHandler   = {registerAckHandler}
                        onAddSampleMessage   = {addSampleMessage}
                        onAddSampleBiomarker = {addSampleBiomarkerScore}
                    />
                </div>
            </main>

        </div>
    );
}
