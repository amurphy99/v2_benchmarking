import { ChatSession, BiomarkerType, ChatMessage, AlbumImage      } from "@/api";
import { getSessionsBefore, averageScore } from "@/utils/misc/scores";
import { matchImage } from "./matchImage";

// Interface for the ChatWeek objects we return
export interface ChatWeek {
    start      : Date;           // Monday 00:00:00
    end        : Date;           // Sunday 23:59:59.999
    sessions   : ChatSession[];
    prevScores : Record<BiomarkerType, number>;
    image      : AlbumImage | null;
}

export interface ChatsPerDay {
    day   : string;  // "Mon", "Tue", ..., "Today"
    chats : number;  // Number of chats on that day
}

export interface SessionsOnDay {
    day     : string;
    sessions: ChatSession[];
}

// ====================================================================
// Groups chat-sessions into Monday-to-Sunday buckets
// ====================================================================
export function groupSessionsByWeek(sessions: ChatSession[], weekStartsOn: 0 | 1 = 1): ChatWeek[] {
    if (!sessions.length) return [];

    // Sort the chats and get the start of the first week
    const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstChatDate = new Date(sorted[0].date);
    const weekStart  = startOfWeek(firstChatDate, weekStartsOn);

    // --------------------------------------------------------------------
    // Iterate and bucket
    // --------------------------------------------------------------------
    // Prepare objects to store the results
    const result : ChatWeek[]    = [];
    let cursor   : Date          = new Date(weekStart);
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
                image      : matchImage(bucket, getMainTopic(bucket)),
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
        image      : matchImage(bucket, getMainTopic(bucket)),
    });

    return result;
}

export function getCurrentWeek(sessions: ChatSession[], weekStartsOn: 0 | 1 = 1): ChatWeek {
    const weekStart  = startOfWeek(new Date(), weekStartsOn);
    const weekEnd    = endOfWeek(weekStart, weekStartsOn, true);
    if (sessions.length == 0) {
        return ({
            start: weekStart,
            end: weekEnd,
            sessions: [],
            prevScores: {},
            image: null
        })
    }
    let bucket: ChatSession[] = [];
    const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const chat of sorted) {
        const chatDate = new Date(chat.date);
        if (chatDate > weekEnd) {
            break;
        }
        if (chatDate >= weekStart) {
            bucket.push(chat);
        }
    }

    return ({
        start: weekStart,
        end: weekEnd,
        sessions: bucket,
        prevScores: {},
        image: matchImage(bucket, getMainTopic(bucket)),
    })
}

export function getNumChatsInWeek(week: ChatWeek): ChatsPerDay[] {
    const dayTracks: ChatsPerDay[] = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(week.start);
        day.setDate(day.getDate() + i);
        const chats = getChatsOnDay(week, day);
        if (sameDay(day, new Date())) {
            dayTracks.push({ day: "Today", chats: chats.length });
        } else {
            const weekday = day.toLocaleString('en-us', {  weekday: 'short' });
            dayTracks.push({ day: weekday, chats: chats.length });
        }
    }
    return dayTracks;
}

export function getChatsInWeek(week: ChatWeek): SessionsOnDay[] {
    const chatTrack: SessionsOnDay[] = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(week.start);
        day.setDate(day.getDate() + i);
        const chats = getChatsOnDay(week, day);
        if (sameDay(day, new Date())) {
            chatTrack.push({ day: "Today", sessions: chats});
        } else {
            const weekday = day.toLocaleString('en-us', {  weekday: 'short' });
            chatTrack.push({ day: weekday, sessions: chats});
        }
    }
    return chatTrack;
}

/**
 * Gets the ChatMessages of every session in a ChatWeek
 * @param week The ChatWeek to get the messages of
 * @returns A 1-d array of all the chat messages for the week
 */
export function getMessages(sessions: ChatSession[]) {
    var messages: ChatMessage[] = [];
    for (var i = 0; i < sessions.length; i++) {
        var session: ChatSession = sessions[i];
        for (var j = 0; j < session.messages.length; j++) {
            messages.push(session.messages[j]);
        }
    }
    return messages;
}

export function getMainTopic(sessions: ChatSession[]) {
    var topics: string[] = [];
    for (var i = 0; i < sessions.length; i++) {
        var session: ChatSession = sessions[i];
        var sessionTopics = session.topics.replace(/[\[\]"']/g, "").split(",");
        for (var j = 0; j < sessionTopics.length; j++) {
            var topic = sessionTopics[j].trim();
            if (topic && !topics.includes(topic)) {
                topics.push(topic);
            }
        }
    }
    const mostFrequent = Array.from(new Set(topics)).reduce((prev, curr) =>
        topics.filter(el => el === curr).length > topics.filter(el => el === prev).length ? curr : prev
    );
    return mostFrequent;
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

function sameDay(d1: Date, d2: Date) {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth()    === d2.getMonth() &&
        d1.getDate()     === d2.getDate();
    }

function getChatsOnDay(week: ChatWeek, day: Date) {
    return week.sessions.filter(s => {
        const d = new Date(s.date);
        return sameDay(d, day);
    });
}