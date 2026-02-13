import { useState, useRef } from "react";
import { useParams        } from "react-router-dom";

// Command types
import type { ControlState, CommandAck } from "@/hooks/chat-listener/chat-controls/types";

// Components
import   ChatMessages          from "../chat/components/ChatMessages";
import {     BiomarkerPanel }  from  "./components/BiomarkerPanel";

// Misc. Helpers
import { useElementHeight                            } from "@/hooks/style/useElementHeight";
import { useChatSession } from "@/hooks/queries/useChatSessions";
import { ChatBiomarkerToLocalSeries } from '../../hooks/chat-listener/data_utils/useLocalBiomarkers';

// ================================================================================
// AdminChat -- Monitor a participant's ChatSession in real time
// ================================================================================
export function AdminChatInactive() {
    // Style Helpers
    const bioPanelRef = useRef<HTMLDivElement | null>(null);
    const bioHeight = useElementHeight(bioPanelRef);

    // --------------------------------------------------------------------------------
    // WebSocket Setup
    // --------------------------------------------------------------------------------
    // Received on page load
    const { id } = useParams();

    // --------------------------------------------------------------------------------
    // Data Setup
    // --------------------------------------------------------------------------------
    const { data: session, isLoading } = useChatSession(id ?? "");

    if (isLoading || !session.id) {
        return null;
    }

    // ================================================================================
    // UI Components
    // ================================================================================
    return (
        <div className="pb-[15vh]">
            {/* ================================================================================ */}
            {/* Body */}
            {/* ================================================================================ */}
            <div className="grid grid-cols-2 m-[1rem] gap-[1rem] items-start">

                {/* -------------------------------------------------------------------------------- */}
                {/* Chat Messages (set height equal to biomarker panel height) */}
                {/* -------------------------------------------------------------------------------- */}
                <div 
                    className="w-full border border-gray-300 flex flex-col min-h-0 rounded-sm"
                    style={bioHeight ? { height: bioHeight } : undefined}
                >
                    <ChatMessages messages={session.messages}/>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Biomarkers */}
                {/* -------------------------------------------------------------------------------- */}
                <div ref={bioPanelRef} className="w-full border border-gray-300 rounded-sm">
                   <BiomarkerPanel series={ChatBiomarkerToLocalSeries(session.biomarkers)} windowSeconds={"all"} />
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Topics and Sentiment */}
                {/* -------------------------------------------------------------------------------- */}
                <div 
                    className="w-full border border-gray-300 flex flex-col min-h-0 rounded-sm"
                    style={bioHeight ? { height: bioHeight } : undefined}
                >
                    <p className="flex justify-center p-1 border-b border-black/10 text-base font-semibold">Topics</p>
                    <p className="p-3">{session.topics.replace(/[\[\]"']/g, "").split(",").join(", ")}</p>
                </div>
                <div 
                    className="w-full border border-gray-300 flex flex-col min-h-0 rounded-sm"
                    style={bioHeight ? { height: bioHeight } : undefined}
                >
                    <p className="flex justify-center p-1 border-b border-black/10 text-base font-semibold">Sentiment</p>
                    <p className="p-3">{session.sentiment}</p>
                </div>
            </div>
            

        </div>
    );
}








