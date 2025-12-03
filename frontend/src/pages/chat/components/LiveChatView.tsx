import { useState } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-bootstrap";

import { LocalChatMessage } from "@/hooks/live-chat";
import { useAuth } from "@/context/AuthProvider";

import Avatar from "@/pages/common/avatar/Avatar";
import AvatarView from "./AvatarView";
import ChatMessages from "./ChatMessages";

// --------------------------------------------------------------------
// Get the most recent message from the system
// --------------------------------------------------------------------
const default_message = `Chat with me! Here's a long message to ensure that the scrolling behavior works correctly. The intended behavior
is that when this message is long enough and displays over several lines, the chat bubble should display a horizontal scrollbar instead of
being very long and taking too much vertical space, thereby covering the recording buttons.`;
export function getRecentMessage(messages: LocalChatMessage[], fallback = default_message): string {
    const latest = messages.reduce<LocalChatMessage | null>((acc, m) => {
        if (m.role !== "assistant") return acc; // skip
        return !acc || m.ts > acc.ts ? m : acc; // keep newer
    }, null);
    return latest ? latest.content : fallback;
}

// ====================================================================
// LiveChatView (show the Avater and/or the messages from the conversation)
// ====================================================================
export default function LiveChatView({ messages }: { messages: LocalChatMessage[] }) {
    const [viewMode, setViewMode] = useState(4);
    const { user } = useAuth();

    // --------------------------------------------------------------------
    // Main view for the page
    // --------------------------------------------------------------------
    function getView() {
        const chatHistoryWrapper1 = "flex flex-col justify-self-center mt-[1em] mb-[2rem] h-[65vh] w-full md:w-1/2 md:border-x-1 md:border-blue-200";
        const chatHistoryWrapper2 = "overflow-y-auto w-full md:w-1/2 h-1/2 md:h-full md:border-r-1 md:border-b-0 border-b-1 border-blue-200";

        // Chat history or Avatar views separately
        if (viewMode == 1) {
        return (
            <div className={chatHistoryWrapper1}>
            <ChatMessages messages={messages} />
            </div>
        );
        } else if (viewMode == 3) {
        return (
            <div className="h-[65vh] mb-[2rem]">
            <AvatarView chatbotMessage={getRecentMessage(messages)} />
            </div>
        );
        }

        // Default / main view for the app -- keeping the other ones still though for debugging (want to be able to see the chat history)
        else if (viewMode == 4) {
        return (
            <div className="h-[65vh] mb-[2rem]">
            <div className="my-[1rem] flex justify-center border-1 border-black p-[1em] rounded-lg mx-[25%] overflow-y-scroll h-[10vh]">
                {getRecentMessage(messages)}
            </div>
            <div className="h-[60vh] mt-[1em] w-full">
                <Avatar />
            </div>
            </div>
        );
        }

        // Combined split view
        else if (viewMode == 2) {
        return (
            <div className="flex md:flex-row flex-col h-[65vh] mt-[1em] w-full mb-[2rem]">
            <div className={chatHistoryWrapper2}>
                <ChatMessages messages={messages} />{" "}
            </div>
            <div className="md:w-1/2 w-[100vw] md:h-full h-[65vh]">
                <AvatarView chatbotMessage={getRecentMessage(messages)} />{" "}
            </div>
            </div>
        );
        }
    }

    // --------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------
    if (user.is_staff) {
        return (
        <>
            {/* Buttons to change the view mode for the page */}
            <div className="ml-[1rem] mt-[1rem] flex justify-center">
            <ToggleButtonGroup type="radio" name="viewMode" defaultValue={4}>
                <ToggleButton
                id="messages"
                variant="outline-primary"
                value={1}
                onChange={(e) => setViewMode(+e.currentTarget.value)}
                >
                Messages
                </ToggleButton>
                <ToggleButton
                id="split"
                variant="outline-primary"
                value={2}
                onChange={(e) => setViewMode(+e.currentTarget.value)}
                >
                Messages & Chatbot
                </ToggleButton>
                <ToggleButton
                id="avatar_old"
                variant="outline-primary"
                value={3}
                onChange={(e) => setViewMode(+e.currentTarget.value)}
                >
                Chatbot (old)
                </ToggleButton>
                <ToggleButton
                id="avatar"
                variant="outline-primary"
                value={4}
                onChange={(e) => setViewMode(+e.currentTarget.value)}
                >
                Chatbot
                </ToggleButton>
            </ToggleButtonGroup>
            </div>

            {/* Show the active view mode (4 options) */}
            {getView()}
        </>
        );
    } else {
        return <>{getView()}</>;
    }
}
