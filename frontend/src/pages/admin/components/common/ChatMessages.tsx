/* Show all messages for a ChatSession (using color-coded message bubbles).
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/common/ChatMessages.tsx`

*/
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
        user:    { sender: "User",     marginFar: "ml-auto", marginClose: "mr-[0em]", bubbleColor: "bg-purple-200 text-purple-900" },
        default: { sender: "Cognibot", marginFar: "mr-auto", marginClose: "ml-[0em]", bubbleColor: "bg-green-200  text-green-900"  },
    };

    const { sender, marginFar, marginClose, bubbleColor } = (messageStyle as any)[msg.role] || messageStyle.default;

    // Styles
    const messageBubbleStyle = `flex flex-col my-1 ${marginFar} ${marginClose} max-w-[85%]`;
    const messageTextStyle   = `${bubbleColor} px-2.5 py-1.5 rounded-md leading-snug m-0 text-sm`;
    const messageTimeStyle   = `${marginFar} text-admin-subtext text-[11px] leading-none mt-1 mb-1.5 font-mono tabular-nums`;

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

    // If for an INACTIVE chat, reverse the message order so earliest are first
    // Collapse consecutive USER messages into one bubble
    const renderMessages = useMemo(() => {
        const arr = messages as Array<LocalChatMessage | ChatMessage>;
        return collapseConsecutiveMessages(arr);
    }, [messages]);

    // Only auto scroll to the bottom if the user is already at/close to the bottom already
    // (fixed a bug where it was pulling the entire page instead of just this container)
    useEffect(() => {
        if (!do_auto_scroll) return;
        const container = scrollContainerRef.current;
        if (!container) return;

        // Check if they are close enough to the bottom
        const NEAR_BOTTOM_PX = 96;  // (pixels from bottom)
        const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
        const wasNearBottom = distanceFromBottom < NEAR_BOTTOM_PX;

        // Wait one frame so the new message is in the DOM, then scroll
        if (wasNearBottom) {
            requestAnimationFrame(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
                }
            });
        }
    }, [renderMessages.length, do_auto_scroll]);  // length avoids reruns if array identity changes

    // Determine chat start time
    // (if backend provides startTs, use it; otherwise use the first message timestamp)
    const chatStartMs = useMemo(() => {
            if (chatStartTsIso     ) return parseTs(chatStartTsIso);
            if (messages.length > 0) return parseTs(messages[0].ts);
            return null;
    }, [chatStartTsIso, messages.length ? messages[0].ts : null]);

    // --------------------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------------------
    return (
        <div className="flex flex-col h-full min-h-0">

            {/* Header */}
            <div className="flex justify-center py-2 border-b border-admin-border shrink-0">
                <p className="text-sm font-semibold text-admin-text m-0">Chat History</p>
            </div>

            {/* Messages (scrollable area) */}
            <div
                ref       = {scrollContainerRef}
                className = "flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-0 px-4 py-3"
            >
                {renderMessages.map((msg) => (
                    <MessageBubble msg={msg} key={msg.id} elapsed={formatElapsedMessage(chatStartMs, msg.ts)} />
                ))}
            </div>

        </div>
    );
}
