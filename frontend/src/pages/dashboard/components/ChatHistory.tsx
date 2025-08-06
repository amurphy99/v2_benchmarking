import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { h3              } from "@/utils/styling/sharedStyles";

import   ChatSummaryCard   from "./ChatSummaryCard";


// ====================================================================
// Chat History Panel (shown on Dashboard)
// ====================================================================
// View for multiple cards
//
// ToDo: 
// * "no chats" placeholder
//    - Maybe if no chats, create a placeholder card in the same style/shape that says something and links to the chat page ?
// * Sort button to the right of the "Chat History" h2 component
//
export default function ChatHistory() {
    const { data, isLoading } = useChatSessions();

    // Sort chats utility
    const sortChats = () => { console.log("sortChats() not implemented yet..."); }

    // Return UI component
    if (isLoading) { return <p>Loading chat history...</p>; }
    return (
        <div className="">
            {/* Title & Sort Option */}
            <div className="flex align-middle gap-3">
                <span className={h3}> Chat History </span>
                <button onClick={sortChats} className="text-violet-500 underline hover:text-purple-900"> Sort Newest to Oldest </button>
            </div>

            {/* Grid of ChatCards */}
            <div className="mt-[1rem] grid md:grid-cols-3 grid-cols-1 gap-2">
                {data.map((chat) => ( <ChatSummaryCard key={chat.id} chatSession={chat} /> ))}
            </div>
        </div>
    );
}
