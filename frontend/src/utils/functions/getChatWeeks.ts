import { ChatSession, BiomarkerType      } from "@/api";
import { getSessionsBefore, averageScore } from "@/utils/misc/scores";

// Interface for the ChatWeek objects we return
export interface ChatWeek {
    start      : Date;           // Monday 00:00:00
    end        : Date;           // Sunday 23:59:59.999
    sessions   : ChatSession[];
    prevScores : Record<BiomarkerType, number>;
}


// ====================================================================
// Groups chat-sessions into Monday-to-Sunday buckets
// ====================================================================
const weekStartsOn = 1; // 0 = Sunday, 1 = Monday
export function groupSessionsByWeek(sessions: ChatSession[]): ChatWeek[] {
    if (!sessions.length) return [];

    // Sort the chats and get the start of the first week
    const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstChatDate = new Date(sorted[0].date);
    const firstMonday  = startOfWeek(firstChatDate, weekStartsOn);

    // --------------------------------------------------------------------
    // Iterate and bucket
    // --------------------------------------------------------------------
    // Prepare objects to store the results
    const result : ChatWeek[]    = [];
    let cursor   : Date          = new Date(firstMonday);
    let bucket   : ChatSession[] = [];

    for (const chat of sorted) {
        const chatDate = new Date(chat.date);

        // Advance cursor until chat fits in current week
        while (chatDate >= endOfWeek(cursor, weekStartsOn)) {
            // Flush previous bucket
            result.push({
                start      : new Date(cursor),
                end        : endOfWeek(cursor, weekStartsOn, true),
                sessions   : bucket,
                prevScores : averageScore(getSessionsBefore(sessions, new Date(cursor))),
            });

            // Advance 7 days
            cursor.setDate(cursor.getDate() + 7);
            bucket = [];
        }
        bucket.push(chat);
    }

    // Flush the last bucket
    result.push({
        start      : new Date(cursor),
        end        : endOfWeek(cursor, weekStartsOn, true),
        sessions   : bucket,
        prevScores : averageScore(getSessionsBefore(sessions, new Date(cursor))),
    });

    return result;
}

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------
function startOfWeek(d: Date, weekStartsOn: 0 | 1): Date {
    const out = new Date(d);
    const day = out.getDay();
    const diff = (day < weekStartsOn) ? day + (7 - weekStartsOn) : day - weekStartsOn;
    out.setDate(out.getDate() - diff);
    out.setHours(0, 0, 0, 0);
    return out;
}

function endOfWeek(weekStart: Date, weekStartsOn: 0 | 1, inclusiveEnd = false): Date {
    const out = new Date(weekStart);
    out.setDate(out.getDate() + 7);            // next Monday
    if (inclusiveEnd) out.setMilliseconds(-1); // Sunday 23:59:59.999
    return out;
}
