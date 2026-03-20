// Format timestamps
import { parseTs } from "@/utils/styling/numFormatting";

// Two different possible types that we can get ChatMessages as
import { LocalChatMessage } from "@/hooks/live-chat";
import { ChatMessage      } from "@/api";


// Data required for rendering the chat bubbles
type MessageLike = {
    id         : string | number;
    role       : string;
    content    : string;
    ts         : string;
    start_ts ? : string | null;
    end_ts   ? : string | null;
};

// ================================================================================
// Combine consecutive user messages into a single bubble
// ================================================================================
// TODO: Do we have to do this every time there is a new message ?
export function collapseConsecutiveMessages<T extends MessageLike>(messages : T[]): T[] {
    // Loop through messages
    const out: T[] = [];
    for (const msg of messages) {
        const prev = out[out.length - 1];

        // Only collapse consecutive messages from the chosen role
        if (doCollapse({prev, msg})) {
            const mergedContent = [prev.content, msg.content]
                .filter((s) => s && s.trim().length > 0)
                .join(" "); // "\n" | " "

            // Merge messages
            const merged = {
                ...prev,                    // Keep prev.id so React keys stay stable and unique
                content  : mergedContent,
                ts       : prev.ts,         // Which messages timestamp to keep 
                start_ts : prev.start_ts,
                end_ts   : msg .  end_ts,
            } as T;

            // Save the merged message
            out[out.length - 1] = merged;
            continue;
        }

        // Just push the message and continue if no collapse is needed
        out.push(msg);
    }

    return out;
}

// --------------------------------------------------------------------------------
// Helper for determining if messages should be collapsed
// --------------------------------------------------------------------------------
// Max pause only factors in if we have `start_ts` AND `end_ts` working
function doCollapse({prev, msg, roleToCollapse="user", maxPause=3.0} : {
    prev             : LocalChatMessage | ChatMessage | MessageLike | null;
    msg              : LocalChatMessage | ChatMessage | MessageLike | null;
    roleToCollapse ? : string | null;
    maxPause       ? : number | null;
}) {
    // Confirm both objects exist & are from the role to collapse
    if (!(prev && (prev.role === roleToCollapse))) return false;
    if (!(msg  && (msg .role === roleToCollapse))) return false;

    // Confirm the time between messages isn't too long 
    // (only do this if we have a valid `start_ts` from msg)
    if (msg.start_ts && prev.end_ts) {
        const pause = parseTs(msg.start_ts) - parseTs(prev.end_ts);
        if (pause > maxPause) return false;
    }

    // If all of these pass, return thet they can be collapsed
    return true;
}
