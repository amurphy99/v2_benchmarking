import { useRef, useEffect, useMemo } from "react";

// From this project
import { parseTs, formatElapsedMessage } from "@/utils/styling/numFormatting";
import { collapseConsecutiveMessages   } from "../../utils/collapseMessages";

// Two different possible types that we can get ChatMessages as
import { LocalChatMessage } from "@/hooks/live-chat";
import { ChatMessage      } from "@/api";


// --------------------------------------------------------------------------------
// Render a single chat message from the user or the robot
// --------------------------------------------------------------------------------
function MessageBubble({ msg, elapsed }: { msg: LocalChatMessage | ChatMessage, elapsed: string }) {
    // Style differentiation between the user and the system
    const messageStyle = {
        user:    { sender: "User",     marginFar: "ml-auto", marginClose: "mr-[0em]", bubbleColor: "bg-purple-200" },
        default: { sender: "Cognibot", marginFar: "mr-auto", marginClose: "ml-[0em]", bubbleColor: "bg-green-200"  },
    };

    const { sender, marginFar, marginClose, bubbleColor } = (messageStyle as any)[msg.role] || messageStyle.default;

    // Styles
    const messageBubbleStyle = `flex flex-col my-[0rem] ${marginFar} ${marginClose} gap-0 pb-[0rem]`;
    const messageTextStyle   = `${bubbleColor} px-[0.5em] py-[0.5em] w-fit rounded-sm leading-snug m-0`;
    const messageTimeStyle   = `${marginFar} text-gray-500 text-xs leading-none mt-[0.25rem] mb-[0.5rem] font-mono tabular-nums`;

    // UI elment for a text bubble & timestamp
    return (
        <div key={msg.id} className={messageBubbleStyle}>
            <p className={messageTextStyle}> <b>{sender}:</b> {msg.content} </p>
            <p className={messageTimeStyle}>                  {elapsed    } </p>
        </div>
    );
}

// ================================================================================
// ChatMessages (scroll view)
// ================================================================================
export function ChatMessages({ messages, chatStartTsIso, do_auto_scroll=true } : { 
    messages        : LocalChatMessage[] | ChatMessage[]; 
    chatStartTsIso? : string  | null; 
    do_auto_scroll? : boolean | null; // False for inactive chat sessions
}) {
    // Automatically scroll to bottom when messages change
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const bottomRef          = useRef<HTMLDivElement | null>(null);

    // If for an INACTIVE chat, reverse the message order so earliest are first
    // Collapse consecutive USER messages into one bubble
    const renderMessages = useMemo(() => {
        const arr  = messages as Array<LocalChatMessage | ChatMessage>;
        //const msgs = do_auto_scroll ? arr : [...arr].reverse();
        return collapseConsecutiveMessages(arr);
    }, [messages]);

    // Only auto scroll to the bottom if the user is already at/close to the bottom already
    useEffect(() => {
        if (!do_auto_scroll) return;
        const container = scrollContainerRef.current;
        if (!container) return;

        // Check if they are close enough
        const threshold      = 100; // (pixels from bottom)
        const scrollPosition = container.scrollTop + container.clientHeight;
        const isAtBottom     = container.scrollHeight - scrollPosition < threshold;

        // Wait one frame so the new message is in the DOM, then scroll
        if (isAtBottom) {
            requestAnimationFrame(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); });
        }
    }, [messages.length]); // length avoids reruns if array identity changes

    // Determine chat start time
    // If backend provides startTs, use it; otherwise use the first message timestamp.
    const chatStartMs = useMemo(() => {
            if (chatStartTsIso     ) return parseTs(chatStartTsIso);
            if (messages.length > 0) return parseTs(messages[0].ts);
            return null;
    }, [chatStartTsIso, messages.length ? messages[0].ts : null]);


    // --------------------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------------------
    // Might need to add this back to the header, depends on if it scrolls...
    return (
        <div className="flex flex-col h-full min-h-0 rounded-xl border border-black/10 bg-white overflow-hidden">
            {/* Header */}
            <div className="flex justify-center py-2 border-b border-black/10 shrink-0">
                <p className="text-base font-semibold m-0">Chat History</p>
            </div>

            {/* Scrollable Area */}
            <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[0rem] px-[1rem] py-[0.5rem]">
                {renderMessages.map((msg) => (
                    <MessageBubble msg={msg} key={msg.id} elapsed={formatElapsedMessage(chatStartMs, msg.ts)} />
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
