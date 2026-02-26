import { useState, useRef } from "react";
import { useParams        } from "react-router-dom";

// Components
import   ChatMessages          from "../chat/components/ChatMessages";
import {     BiomarkerPanel }  from  "./components/BiomarkerPanel";
import { SessionHeader      }  from  "./components/admin_header/SessionHeader";

// Misc. Helpers
import { useElementHeight           } from "@/hooks/style/useElementHeight";
import { useChatSession             } from "@/hooks/queries/useChatSessions";
import { ChatBiomarkerToLocalSeries } from '../../hooks/chat-listener/data_utils/useLocalBiomarkers';

// ================================================================================
// [INACTIVE] Admin view for completed chats
// ================================================================================
export function AdminChatInactive() {
    // Load data for the given chat (ID received on page load)
    const { id                       } = useParams();
    const { data: session, isLoading } = useChatSession(id ?? "");

    if (isLoading || !session.id) { return <>Still loading</>; }

    // Style Helpers
    const bioPanelRef = useRef<HTMLDivElement | null>(null);
    const bioHeight = useElementHeight(bioPanelRef);

    // ================================================================================
    // UI Components
    // ================================================================================
    return (
        <div className="pb-[15vh]">

            {/* -------------------------------------------------------------------------------- */}
            {/* Page Header */}
            {/* -------------------------------------------------------------------------------- */}
            <SessionHeader
                title         = "View Inactive Chat Session"
                sessionId     = {id}
                username      = {session?.profile.account.user.username ?? "sample_username"}
                source        = {session?.source   ?? "unknown"}
                mode          = {"history"}
                wsState       = {"offline"}
                messageCount  = {session?.messages.length ?? 0}
                inactive_chat = {true}
                duration      = {session?.duration}
            />


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

                {/* -------------------------------------------------------------------------------- */}
                {/* Notes and Summary */}
                {/* -------------------------------------------------------------------------------- */}
                <div 
                    className="w-full border border-gray-300 flex flex-col min-h-0 rounded-sm"
                    style={bioHeight ? { height: bioHeight } : undefined}
                >
                    <p className="flex justify-center p-1 border-b border-black/10 text-base font-semibold">Notes</p>
                    <p className="p-3">{session.notes}</p>
                </div>
                <div 
                    className="w-full border border-gray-300 flex flex-col min-h-0 rounded-sm"
                    style={bioHeight ? { height: bioHeight } : undefined}
                >
                    <p className="flex justify-center p-1 border-b border-black/10 text-base font-semibold">Summary</p>
                    <p className="p-3">{session.taskSubtype}</p>
                </div>
            </div>
            

        </div>
    );
}








