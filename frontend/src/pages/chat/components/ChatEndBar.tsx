/* What replaces the controls once a chat ends: its numbers, and a new chat.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/ChatEndBar`

Says whether the chat ended (the participant or the avatar ended it) or was
cut off, then how long it ran and how many messages were saved, and for a chat
with no task, how many words the participant said. Starting a new chat reloads
the page, so every choice can be made again.

*/
import type { ReactElement                              } from "react";
import type { IconType                                  } from "react-icons";
import      { BsArrowRepeat, BsChatDots, BsClock, BsMic } from "react-icons/bs";

// From this project
import      { formatElapsedTime } from "@/utils/styling/numFormatting";
import type { ChatStats         } from "../useChatStats";


// ================================================================================
// Chat End Bar
// ================================================================================
// How the chat ended and its numbers, with a button for the next chat
export default function ChatEndBar({stats, showWords, disconnected}: {
    stats        : ChatStats;   // How long the chat ran, its saved messages, and the participant's words
    showWords    : boolean;     // Show the participant's words (a chat with no task)
    disconnected : boolean;     // The chat was cut off, rather than ended by either side
}): ReactElement {
    return (
        <div className="flex flex-col items-center gap-3! rounded-2xl border border-chat-border! bg-chat-panel px-5! py-3! shadow-sm sm:flex-row sm:justify-between">
            {/* How the chat ended, and its numbers */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-base text-chat-text">
                <span className="flex items-center gap-2 font-semibold">
                    <span aria-hidden="true" className={`h-3 w-3 rounded-full ${disconnected ? "bg-status-error" : "bg-status-offline"}`} />
                    {disconnected ? "Chat disconnected" : "Chat ended"}
                </span>
                <EndStat icon={BsClock}    label="Length"   value={formatElapsedTime(stats.durationSec)} />
                <EndStat icon={BsChatDots} label="Messages" value={String(stats.messages)}               />
                {showWords ? <EndStat icon={BsMic} label="Words you said" value={String(stats.words)} /> : null}
            </div>

            {/* A fresh page for the next chat */}
            <button className="flex min-h-11 items-center gap-2! rounded-full! bg-chat-accent px-6 py-2! text-lg font-semibold text-white transition hover:brightness-110" onClick={() => window.location.reload()} type="button">
                <BsArrowRepeat aria-hidden="true" /> Start a new chat
            </button>
        </div>
    );
}


// One of the chat's numbers: its icon, what it counts, and the count
function EndStat({icon: Icon, label, value}: {icon: IconType; label: string; value: string}): ReactElement {
    return (
        <span className="flex items-center gap-1.5">
            <Icon aria-hidden="true" className="text-chat-accent" />
            <span className="text-chat-subtext">{label}</span>
            <span className="font-semibold tabular-nums">{value}</span>
        </span>
    );
}
