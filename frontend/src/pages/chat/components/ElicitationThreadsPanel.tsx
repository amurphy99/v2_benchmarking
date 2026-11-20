/* The threads a speech elicitation chat followed, shown once it ends.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/ElicitationThreadsPanel`

From the backend's `task_reveal`, in order: the topic's opening question
started the first thread, and each question that took the conversation
somewhere new started another. Each says how many follow-up questions the
avatar asked about it. Every reply on a thread asks one, except a reply that
wound the chat down, which isn't counted.

*/
import type { ReactElement } from "react";
import      { BsChatQuote  } from "react-icons/bs";

// From this project
import type { ElicitationThread, ElicitationThreadReply } from "@/api";
import type { ElicitationReveal                         } from "@/hooks/live-chat/taskRevealFrame";


// ================================================================================
// Elicitation Threads Panel
// ================================================================================
// Each question that started a thread, numbered, with its follow-ups
export default function ElicitationThreadsPanel({reveal}: {
    reveal : ElicitationReveal;  // The chat's threads, from the backend's reveal
}): ReactElement {
    return (
        <div className="rounded-2xl border border-chat-border! bg-chat-panel p-6 shadow-sm">
            {/* Heading */}
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-chat-subtext">
                <BsChatQuote aria-hidden="true" /> The conversation
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-chat-text">What you talked about</h2>
            <p className="mt-2 mb-0 text-lg leading-snug text-chat-text">Each of these questions started something new to talk about.</p>

            {/* One entry per thread, in order */}
            <div className="mt-5! space-y-4">
                {reveal.threads.map((thread: ElicitationThread, index: number) => (
                    <div key={index} className="flex gap-3!">
                        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chat-accentSoft text-base font-semibold text-chat-accent">{index + 1}</span>
                        <div className="min-w-0">
                            <div className="text-lg leading-snug text-chat-text">&ldquo;{thread.question}&rdquo;</div>
                            <div className="mt-1 text-sm text-chat-subtext">{followUpText(thread)}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}


// How many follow-up questions the avatar asked about one thread
function followUpText(thread: ElicitationThread): string {
    const count = thread.replies.filter((reply: ElicitationThreadReply) => reply !== "wind_down").length;
    if (count === 0) return "No follow-up questions";
    if (count === 1) return "1 follow-up question";
    return `${count} follow-up questions`;
}
