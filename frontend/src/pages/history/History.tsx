import { useState } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-bootstrap";

import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { h3  } from "@/utils/styling/sharedStyles";

import ChatSessionCard from "./components/ChatSessionCard";

import ChatHistory from "@/pages/dashboard/components/ChatHistory";

// ====================================================================
// ChatSession History Page
// ====================================================================
// Kinda want to break up into weeks and do today, this week, last week etc.
export function History() {
    const { data: sessions, isLoading } = useChatSessions();
    const [viewMode, setViewMode] = useState(0); // 0: chat, 1: week, 2: month ?


    // Sort chats utility
    const sortChats = () => { console.log("sortChats() not implemented yet..."); }

    // --------------------------------------------------------------------
    // Return UI component 
    // --------------------------------------------------------------------
    if (isLoading) { return <p>Loading chat history...</p>; }
    return (
    <div className="flex flex-col m-[1rem] gap-[0.5rem]">
        <div className="flex align-middle gap-[1rem]">
            {/* Title & Sort Option */}
            <span className={h3}> Chat History </span>
            <button onClick={sortChats} className="text-violet-500 underline hover:text-purple-900"> Sort Newest to Oldest </button>

            {/* Buttons to change the view mode for the page */}
            <div className="ml-auto flex justify-center">
                <ToggleButtonGroup type="radio" name="viewMode" defaultValue={0}>
                    <ToggleButton id="chat"  variant="outline-primary" value={0} onChange={(e) => setViewMode(+e.currentTarget.value)}> Daily  </ToggleButton>
                    <ToggleButton id="month" variant="outline-primary" value={1} onChange={(e) => setViewMode(+e.currentTarget.value)}> Weekly </ToggleButton>
                </ToggleButtonGroup>
            </div>
        </div>


        {/* Grid of ChatCards */}
        <div className="grid md:grid-cols-3 grid-cols-1 gap-[1rem]">
            {sessions.map((session) => ( <ChatSessionCard key={session.id} session={session} sessions={sessions} /> ))}
        </div>


        <div className="mt-[1rem]">
            <span className="fst-italic"> (other option for style) </span>
            <ChatHistory/>
        </div>

    </div>
    );
}
