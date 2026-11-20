/* The history page's Response timing card: how long each reply took, with averages.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/ResponseTimingCard`

One row per assistant reply that was timed. The stages come from the timing
saved with each reply (`ChatMessage.timing`): Google finishing the transcript,
the reply being worked out (its model calls, the reply check beside them, and
any hold), and the first sentence's speech. The delay comes from the saved
timestamps instead: from the participant's last word (their message's word
times) to their page reporting that the reply's audio started. So chats from
before timing was saved still show their delays. Each column's average sits at
the top. The card shows only for a chat with something timed.

*/
import type { ReactElement } from "react";
import      { useMemo      } from "react";

// From this project
import type { ChatMessage, ChatSession, ReplyTiming                         } from "@/api";
import      { TIMING_LABELS                                                } from "@/pages/common/debug/debugLabels";
import      { featuresOff, formatMs, replyCheckMs, replyLlmMs, timingStat } from "@/pages/common/debug/useChatTimings";
import      { Pill                                                         } from "./ui/Pill";

// One reply's row: its place among the chat's replies, its text, and each stage (null where it wasn't timed)
type TimingRow = {
    id       : number;          // The reply's message ID
    number   : number;          // Its place among the chat's replies (counting the untimed ones)
    text     : string;          // What the avatar said
    delay    : number | null;   // The participant's last word -> the reply's audio started
    stt      : number | null;   // Their last word -> the reply started
    generate : number | null;   // The reply worked out, any hold included
    llm      : number | null;   // Its own model calls
    check    : number | null;   // The reply check's call
    hold     : number | null;   // The reply gate's hold
    tts      : number | null;   // The first sentence's speech
    off      : string[];        // Shared features switched off for it
};

// One timed column: the row field it shows, its heading, and what it measures
type TimingColumn = {key: "delay" | "stt" | "generate" | "llm" | "check" | "hold" | "tts"; label: string; help: string};

// The table's timed columns, in order
const TIMING_COLUMNS: TimingColumn[] = [
    {key: "delay",    label: "Delay",      help: TIMING_LABELS.delay.help},
    {key: "stt",      label: "Transcript", help: "From the end of the participant's last word until the reply started: mostly Google finishing the transcript."},
    {key: "generate", label: "Reply",      help: "The chat type worked the reply out, any hold included."},
    {key: "llm",      label: "LLM",        help: TIMING_LABELS.llm.help},
    {key: "check",    label: "Check",      help: TIMING_LABELS.check.help},
    {key: "hold",     label: "Hold",       help: "How long the reply gate held the reply while the participant seemed mid-thought."},
    {key: "tts",      label: "TTS",        help: TIMING_LABELS.tts.help},
];


// --------------------------------------------------------------------------------
// Rows
// --------------------------------------------------------------------------------
// The chat's timed replies in order (a reply with neither saved timing nor the timestamps for a delay is left out)
function timingRows(messages: ChatMessage[]): TimingRow[] {
    const rows : TimingRow[] = [];
    let number = 0;
    messages.forEach((message: ChatMessage, index: number) => {
        if (message.role !== "assistant") return;
        number += 1;

        // The delay needs the participant's own message just before it (a turn the avatar started has none)
        const before   = (index > 0) ? messages[index - 1] : null;
        const lastWord = ((before !== null) && (before.role === "user")) ? before.end_ts : null;
        const delay    = ((typeof lastWord === "string") && (typeof message.start_ts === "string")) ? (Date.parse(message.start_ts) - Date.parse(lastWord)) : null;

        // The stages, from the timing saved with it (older replies have none)
        const timing = message.timing ?? null;
        if ((timing === null) && (delay === null)) return;
        const stage = (pick: (saved: ReplyTiming) => number | null): number | null => (timing === null) ? null : pick(timing);
        rows.push({
            id       : message.id,
            number,
            text     : message.content,
            delay,
            stt      : stage((saved: ReplyTiming) => saved.stt_ms),
            generate : stage((saved: ReplyTiming) => saved.generate_ms),
            llm      : stage(replyLlmMs),
            check    : stage(replyCheckMs),
            hold     : stage((saved: ReplyTiming) => saved.hold_ms),
            tts      : stage((saved: ReplyTiming) => saved.tts_ms),
            off      : (timing === null) ? [] : featuresOff(timing),
        });
    });
    return rows;
}


// ================================================================================
// Response Timing Card
// ================================================================================
// Each column's average, then one row per timed reply (nothing for a chat with nothing timed)
export function ResponseTimingCard({session}: {
    session : ChatSession;  // The completed chat, with its messages
}): ReactElement | null {
    const rows = useMemo((): TimingRow[] => timingRows(session.messages), [session.messages]);
    if (rows.length === 0) return null;

    // How many replies were held
    const held = rows.filter((row: TimingRow) => row.hold !== null).length;
    return (
        <section className="rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden">
            {/* -------------------------------------------------------------------------------- */}
            {/* Title and Averages */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="px-5 py-3 border-b border-admin-border flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-base font-semibold text-admin-text">Response timing</div>
                    <div className="text-xs text-admin-subtext mt-0.5">
                        {rows.length} {(rows.length === 1) ? "reply" : "replies"} timed{(held > 0) ? `, ${held} held` : ""}. Hover a heading for what it measures.
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                    {TIMING_COLUMNS.map((column: TimingColumn) => (
                        <Pill key={column.key} label={`${column.label} avg`} value={formatMs(timingStat(rows.map((row: TimingRow) => row[column.key])).average)} />
                    ))}
                </div>
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* One Row per Reply */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-admin-text">
                    <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-admin-subtext">
                            <th className="px-3 py-2 font-semibold">#</th>
                            {TIMING_COLUMNS.map((column: TimingColumn) => <th key={column.key} className="px-3 py-2 font-semibold whitespace-nowrap" title={column.help}>{column.label}</th>)}
                            <th className="px-3 py-2 font-semibold whitespace-nowrap" title="Shared features switched off for this reply">Off</th>
                            <th className="px-3 py-2 font-semibold">What it said</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row: TimingRow) => (
                            <tr key={row.id} className="border-t border-admin-border">
                                <td className="px-3 py-2 text-admin-subtext tabular-nums">{row.number}</td>
                                {TIMING_COLUMNS.map((column: TimingColumn) => <td key={column.key} className="px-3 py-2 whitespace-nowrap tabular-nums">{formatMs(row[column.key])}</td>)}
                                <td className="px-3 py-2 whitespace-nowrap text-admin-subtext">{(row.off.length > 0) ? row.off.join(", ") : "—"}</td>
                                <td className="px-3 py-2 max-w-[28rem] truncate text-admin-subtext" title={row.text}>{row.text}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
