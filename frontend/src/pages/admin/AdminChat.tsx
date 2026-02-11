import { useState, useRef } from "react";
import { useParams        } from "react-router-dom";

// Hook for handling the WebSocket connection
import useChatListener from "@/hooks/chat-listener/useChatListener";

// Command types
import type { ControlState, CommandAck } from "@/hooks/chat-listener/chat-controls/types";

// Data received from the backend
import { SessionInfo         } from "@/hooks/chat-listener/sessionData";
import { useLocalChatSession } from "@/hooks/live-chat";
import { useLocalBiomarkers  } from "@/hooks/chat-listener/useLocalBiomarkers";

// Components
import   ChatMessages          from "../chat/components/ChatMessages";
import { SessionHeader      }  from  "./components/adminHeader";  // TODO: rename this file
import {     BiomarkerPanel }  from  "./components/BiomarkerPanel";
import { AdminControlsPanel }  from "./components/AdminControlsPanel";

// Misc. Helpers
import { useElementHeight                            } from "@/hooks/style/useElementHeight";
import { makeSampleMessage, makeSampleBiomarkerEvent } from "@/hooks/chat-listener/adminChatSamples";

// ================================================================================
// AdminChat -- Monitor a participant's ChatSession in real time
// ================================================================================
export function AdminChat() {
    // Style Helpers
    const bioPanelRef = useRef<HTMLDivElement | null>(null);
    const bioHeight = useElementHeight(bioPanelRef);

    // --------------------------------------------------------------------------------
    // Storage Setup
    // --------------------------------------------------------------------------------
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
        onControlState    : (st)   => {
            setControlState((s) => ({
            listeningPaused: st?.listeningPaused ?? s.listeningPaused,
            responsesPaused: st?.responsesPaused ?? s.responsesPaused,
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
    // Control state (commands confirmed by backend)
    // --------------------------------------------------------------------------------
    const [controlState, setControlState] = useState<ControlState>({
        listeningPaused: false,
        responsesPaused: false,
    });

    // Ack routing (AdminControlsPanel registers a handler; useChatListener calls it)
    const ackHandlerRef = useRef<(ack: CommandAck) => void>(() => {});
    const registerAckHandler = (fn: (ack: CommandAck) => void) => { ackHandlerRef.current = fn; };


    // ================================================================================
    // UI Components
    // ================================================================================
    return (
        <div>
            {/* -------------------------------------------------------------------------------- */}
            {/* Page Header */}
            {/* -------------------------------------------------------------------------------- */}
            <SessionHeader
                title        = "Live Session Monitor"
                sessionId    = {id}
                username     = {sessionInfo?.username ?? "sample_username"}
                source       = {sessionInfo?.source   ?? "webapp"}
                mode         = "listener"
                wsState      = {connected ? "connected" : "disconnected"}
                lastEventAt  = {lastEventAt} // Date   | null
                latencyMs    = {latencyMs}   // number | null
                startTsUnix  = {sessionInfo?.startTs      ?? null}
                messageCount = {sessionInfo?.messageCount ?? session.messages.length}
            />

            {/* ================================================================================ */}
            {/* Body */}
            {/* ================================================================================ */}
            <div className="flex flex-row m-[1rem] gap-[1rem] items-start">

                {/* -------------------------------------------------------------------------------- */}
                {/* Chat Messages (set height equal to biomarker panel height) */}
                {/* -------------------------------------------------------------------------------- */}
                <div 
                    className="w-1/2 border border-gray-300 flex flex-col min-h-0 rounded-sm"
                    style={bioHeight ? { height: bioHeight } : undefined}
                >
                    <ChatMessages messages={session.messages}/>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Biomarkers */}
                {/* -------------------------------------------------------------------------------- */}
                <div ref={bioPanelRef} className="w-1/2 border border-gray-300 rounded-sm">
                   <BiomarkerPanel series={series} windowSeconds={300} />
                </div>

            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Control Buttons */}
            {/* -------------------------------------------------------------------------------- */}
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








