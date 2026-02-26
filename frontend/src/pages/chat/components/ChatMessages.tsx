// ================================================================================
// Render a single chat message from the user or the robot
// ================================================================================
import { useRef, useEffect, useMemo } from "react";
import { LocalChatMessage  } from "@/hooks/live-chat";
import { ChatMessage } from "@/api";

// --------------------------------------------------------------------------------
// Format Timestamps
// --------------------------------------------------------------------------------
function parseTs(ts: string): number {
  const t = Date.parse(ts);                   // Convert ISO string into epoch ms
  return Number.isFinite(t) ? t : Date.now(); // Fallback to "now" if invalid
}

// Display elapsed time since chat start in M:SS.xx (xx = centiseconds)
function formatElapsed(chatStartMs: number | null, msgTsIso: string): string {
  if (!chatStartMs) return "—";

  const msgMs = parseTs(msgTsIso);
  const diffMs = Math.max(0, msgMs - chatStartMs);

  const minutes = Math.floor( diffMs / 60_000);
  const seconds = Math.floor((diffMs % 60_000) / 1_000);
  const centis  = Math.floor((diffMs %  1_000) /    10); // 2 decimals of milliseconds

  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

// --------------------------------------------------------------------------------
// Format the Message Bubbles
// --------------------------------------------------------------------------------
function MessageBubble({ msg, elapsed }: { msg: LocalChatMessage | ChatMessage, elapsed: string }) {
    // Style differentiation between the user and the system
    const messageStyle = {
        user:    { sender: "User",     marginFar: "ml-auto", marginClose: "mr-[1em]", bubbleColor: "bg-purple-200" },
        default: { sender: "Cognibot", marginFar: "mr-auto", marginClose: "ml-[1em]", bubbleColor: "bg-green-200"  },
    };

    const { sender, marginFar, marginClose, bubbleColor } = (messageStyle as any)[msg.role] || messageStyle.default;

    // Styles
    const messageBubbleStyle = `flex flex-col ${marginFar} ${marginClose} gap-0`;
    const messageTextStyle   = `${bubbleColor} px-[0.5em] py-[0.5em] w-fit rounded-sm leading-snug m-0`;
    const messageTimeStyle   = `${marginFar} text-gray-500 text-xs leading-none mt-[0.25em] font-mono tabular-nums`;

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
export default function ChatMessages({ messages, chatStartTsIso }: { 
    messages        : LocalChatMessage[] | ChatMessage[]; 
    chatStartTsIso? : string | null; 
}) {
    // Automatically scroll to bottom when messages change
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const bottomRef          = useRef<HTMLDivElement | null>(null);

    // Only auto scroll to the bottom if the user is already at/close to the bottom already
    useEffect(() => {
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
            if (chatStartTsIso) return parseTs(chatStartTsIso);
            if (messages.length > 0) return parseTs(messages[0].ts);
            return null;
    }, [chatStartTsIso, messages.length ? messages[0].ts : null]);

  // Return UI component
  return (
    <div className="flex flex-col h-full min-h-0">
        <p className="flex justify-center py-1 border-b border-black/10 text-base font-semibold">Chat History</p>

        {/* This is the ONLY scrollable area */}
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 p-0">
            {messages.map((msg) => (
                <MessageBubble msg={msg} key={msg.id} elapsed={formatElapsed(chatStartMs, msg.ts)} />
            ))}
            <div ref={bottomRef} />
        </div>
    </div>
  );
}
