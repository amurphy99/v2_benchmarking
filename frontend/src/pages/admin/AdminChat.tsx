import { useState, useRef  }   from "react";
import { useParams }   from "react-router-dom";


// Components
import { SessionHeader } from  "./components/adminHeader";
import   LiveBiomarkers  from "./components/LiveBiomarkers";
import   ChatMessages    from "../chat/components/ChatMessages";
import { BiomarkerPanel } from "./components/BiomarkerPanel";

// Hook for handling the WebSocket connection
import   useChatListener       from "@/hooks/chat-listener/useChatListener";
import { SessionInfo         } from "@/hooks/chat-listener/sessionData";
import { useLocalChatSession } from "@/hooks/live-chat";
import { useLocalBiomarkers  } from "@/hooks/chat-listener/useLocalBiomarkers";


import { useElementHeight } from "@/hooks/style/useElementHeight";


import { makeSampleMessage, makeSampleBiomarkerEvent } from "@/hooks/chat-listener/adminChatSamples";





// ================================================================================
// AdminChat
// ================================================================================
// Monitor a participant's ChatSession in real time
export function AdminChat() {
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
    });

    // --------------------------------------------------------------------------------
    // Style Helpers
    // --------------------------------------------------------------------------------
    const bioPanelRef = useRef<HTMLDivElement | null>(null);
    const bioHeight = useElementHeight(bioPanelRef);
    

    // --------------------------------------------------------------------------------
    // [DEBUGGING] Sample Data Methods 
    // --------------------------------------------------------------------------------
    const [isUserRole, setIsUserRole] = useState<boolean>(true);

    function addSampleMessage() {
        pushMessageObj(makeSampleMessage(isUserRole));
        setIsUserRole((prev) => !prev);
    }

    function addSampleBiomarkerScore() {
        pushScoreObj(makeSampleBiomarkerEvent());
        
    }

    // <LiveBiomarkers scores={biomarkerScores}/>
    //  <BiomarkerPanel series={series} windowSeconds={300} />

    // ================================================================================
    // Page Components
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
            <div className="flex flex-row gap-[2rem] m-[2rem]">
                <button className="btn btn-primary" onClick={addSampleMessage}>Add sample message</button>
                <button className="btn btn-primary" onClick={addSampleBiomarkerScore}>Add sample biomarker score</button>
            </div>

        </div>
    );
}








