/* The caption under the avatar: what the participant just said, and the reply.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/ReplyCaption`

The reply is large, so it can be read as well as heard; while the avatar works
on one, three dots pulse in its place. The participant's last words show above
it, smaller, so they can see what the avatar heard.

*/
import type { ReactElement } from "react";


// ================================================================================
// Reply Caption
// ================================================================================
// The participant's last words, then the avatar's reply (or dots while one is coming)
export default function ReplyCaption({heard, reply, awaitingReply, idleText}: {
    heard         : string | null;   // What the participant last said (null before they speak)
    reply         : string | null;   // The avatar's latest reply (null before its first)
    awaitingReply : boolean;         // The participant finished talking and the reply hasn't started
    idleText      : string;          // Shown before the first reply
}): ReactElement {
    return (
        <div className="min-h-[8rem] border-t border-chat-border px-6 py-5" aria-live="polite">
            {(heard !== null) ? <div className="text-base text-chat-subtext">You said: &ldquo;{heard}&rdquo;</div> : null}

            {awaitingReply ? (
                <div className="mt-3 flex gap-2" aria-label="The avatar is thinking">
                    <span className="h-3 w-3 animate-bounce rounded-full bg-chat-accent [animation-delay:-0.3s]" />
                    <span className="h-3 w-3 animate-bounce rounded-full bg-chat-accent [animation-delay:-0.15s]" />
                    <span className="h-3 w-3 animate-bounce rounded-full bg-chat-accent" />
                </div>
            ) : (
                <div className="mt-1 text-2xl font-medium leading-snug text-chat-text md:text-3xl">{reply ?? idleText}</div>
            )}
        </div>
    );
}
