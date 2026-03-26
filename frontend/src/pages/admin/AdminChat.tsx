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
import { SessionHeader      } from  "./components/admin_header/SessionHeader";
import { SessionHistory     } from "./components/common/SessionHistory";
import { AdminControlsPanel } from "./components/AdminControlsPanel";

// Misc. Helpers
import { makeSampleMessage, makeSampleBiomarkerEvent } from "@/hooks/chat-listener/data_utils/adminChatSamples";

// ================================================================================
// AdminChat -- Monitor a participant's ChatSession in real time
// ================================================================================
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

    // --------------------------------------------------------------------------------
    // [DEBUGGING] Sample Data Methods 
    // --------------------------------------------------------------------------------
    const [isUserRole, setIsUserRole] = useState<boolean>(true);
    function addSampleMessage       () {pushMessageObj(makeSampleMessage(isUserRole)); setIsUserRole((prev) => !prev);}
    function addSampleBiomarkerScore() {  pushScoreObj(makeSampleBiomarkerEvent()); }

    // --------------------------------------------------------------------------------
    // Stream status (reflects user's chat state: active | paused | ended)
    // --------------------------------------------------------------------------------
    const [streamStatus, setStreamStatus] = useState<StreamStatus>("active");

    // --------------------------------------------------------------------------------
    // Control state (commands confirmed by backend)
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
        <div className="pb-[15vh]">

            {/* Page Header */}
            <SessionHeader
                title         = "Monitor Live Chat Session"
                sessionId     = {id}
                username      = {sessionInfo?.username ?? "unknown_username"}
                source        = {sessionInfo?.source   ?? "unknown"}
                mode          = "listener"
                wsState       = {connected ? "connected" : "disconnected"}
                lastEventAt   = {lastEventAt} // Date   | null
                latencyMs     = {latencyMs}   // number | null
                startTsUnix   = {sessionInfo?.startTs      ?? null}
                messageCount  = {session.messages.length}
                streamStatus  = {streamStatus}
                inactive_chat = {false}
            />

            {/* -------------------------------------------------------------------------------- */}
            {/* Page Body */}
            {/* -------------------------------------------------------------------------------- */}
            {/* Chat Messages & Biomarker History */}
            <SessionHistory messages={session.messages} series={series} /> 

            {/* Control Buttons */}
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
    );
}

