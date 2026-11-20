/* A speech elicitation chat's details: its threads, reply kinds, and pacing.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/task_details/ElicitationDetails`

From the session's saved task history and its messages. The stats come first:
the threads the conversation followed, the follow-up questions the avatar
asked, the participant's average answer (words per saved message of theirs),
how often the reply gate held a reply while they seemed mid-thought (from each
reply's saved timing), and the questions about a misheard word. Then how the
avatar's replies split by kind, each thread with what each reply on it did, and
the topic: its opening question and the fresh angles the avatar could take. The
first thread is the opening question's, and every later one a new angle's.

*/
import type { ReactElement } from "react";

// From this project
import type { ChatMessage, ElicitationTaskHistory, ElicitationThread, ElicitationThreadReply, ReplyTiming } from "@/api";
import      { formatMs                                                                              } from "@/pages/common/debug/useChatTimings";
import      { Pill                                                                                  } from "../ui/Pill";
import      { StatTile, StatTileRow                                                                 } from "../ui/StatTile";

// How each reply on a thread reads (copied from `ThreadReply` in `backend/chat_app/websocket/harnesses/speech_elicitation/harness.py`)
const THREAD_REPLY_LABELS: Record<ElicitationThreadReply, string> = {
    follow_up : "Follow-up",
    share     : "Shared its own take",
    challenge : "Challenged",
    wind_down : "Wound down",
    fallback  : "Scripted (call failed)",
};

// Heading style shared by the panel's titles
const THREAD_HEADING = "m-0 font-semibold [font-family:inherit]";


// ================================================================================
// Elicitation Details
// ================================================================================
// The conversation's numbers, how the replies split, each thread, and the topic
export default function ElicitationDetails({view, messages}: {
    view     : ElicitationTaskHistory;  // The saved topic and threads (or an older session's topic only)
    messages : ChatMessage[];           // The session's saved messages, in order
}): ReactElement {
    // --------------------------------------------------------------------------------
    // Conversation Stats
    // --------------------------------------------------------------------------------
    // The threads (null when they weren't saved), and every reply on them
    const threads   = view.threads;
    const replies   = (threads === null) ? [] : threads.flatMap((thread: ElicitationThread) => thread.replies);
    const followUps = replies.filter((reply: ElicitationThreadReply) => reply !== "wind_down").length;

    // The participant's answers, in words
    const answers = messages.filter((message: ChatMessage) => message.role === "user").map((message: ChatMessage) => countWords(message.content));
    const words   = answers.reduce((total: number, count: number) => total + count, 0);

    // The replies with saved timing, and the ones the reply gate held
    const timings = messages.flatMap((message: ChatMessage): ReplyTiming[] => ((message.role === "assistant") && message.timing) ? [message.timing] : []);
    const holds   = timings.map((timing: ReplyTiming) => timing.hold_ms).filter((ms: number | null): ms is number => ms !== null);

    // How many replies of each kind: the opening question, the new angles, each kind on a thread, and the misheard-word questions
    const clarifications = view.clarifications;
    const kinds: [string, number][] = ((threads === null) || (clarifications === null)) ? [] : [
        ["Opening question", Math.min(threads.length, 1)],
        ["New angle",        Math.max(threads.length - 1, 0)],
        ...Object.entries(THREAD_REPLY_LABELS).map(([kind, label]: [string, string]): [string, number] => [label, replies.filter((reply: ElicitationThreadReply) => reply === kind).length]),
        ["Asked about a misheard word", clarifications],
    ];

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <div className="flex flex-col gap-5">
            {/* -------------------------------------------------------------------------------- */}
            {/* Conversation Stats */}
            {/* -------------------------------------------------------------------------------- */}
            <section className="flex flex-col gap-3">
                <h2 className={`${THREAD_HEADING} text-xl!`}>The conversation</h2>
                <StatTileRow>
                    <StatTile label="Threads"             value={(threads === null) ? "—" : String(threads.length)}                          sub="the opening, and each new angle"                                                                                    />
                    <StatTile label="Follow-ups"          value={(threads === null) ? "—" : String(followUps)}                               sub={perThread(followUps, threads)}                                         help="Replies that dug further into a thread (each asks another question)" />
                    <StatTile label="Average answer"      value={(answers.length > 0) ? `${Math.round(words / answers.length)} words` : "—"} sub={`${answers.length} answers, ${words} words in all`}                    help="Words per saved message of the participant's" />
                    <StatTile label="Held replies"        value={(timings.length > 0) ? `${holds.length} of ${timings.length}` : "—"}        sub={(holds.length > 0) ? `${formatMs(average(holds))} on average` : "replies timed"} help="How often the reply gate waited because the participant seemed mid-thought" />
                    <StatTile label="Misheard words"      value={(clarifications === null) ? "—" : String(clarifications)}                   sub="questions about one"                                                   help="Replies asking about a word the reply check thought was misheard" />
                    <StatTile label="Said they were done" value={(view.wound_down === null) ? "—" : (view.wound_down ? "Yes" : "No")}       sub="when the chat ended"                                                   help="Whether the participant had said they wanted to stop when the chat ended" />
                </StatTileRow>

                {/* How the avatar's replies split by kind */}
                {(threads !== null) ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-admin-subtext">
                        <span className="font-semibold">Replies</span>
                        {kinds.map(([label, count]: [string, number]) => <Pill key={label} label={label} value={String(count)} />)}
                    </div>
                ) : <p className="m-0 text-sm text-admin-subtext">The threads weren't saved for this session, so its replies can't be split by kind.</p>}
            </section>

            {/* -------------------------------------------------------------------------------- */}
            {/* Threads */}
            {/* -------------------------------------------------------------------------------- */}
            {(threads !== null) ? (
                <section>
                    <h3 className={`${THREAD_HEADING} mb-2 text-base!`}>Threads</h3>
                    <div className="flex flex-col gap-3">
                        {threads.map((thread: ElicitationThread, index: number) => (
                            <article key={index} className="flex gap-3 rounded-xl border border-admin-border p-4!">
                                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-admin-accentSoft text-sm font-semibold text-admin-accent2">{index + 1}</span>
                                <div className="min-w-0">
                                    <p className="m-0 text-sm">&ldquo;{thread.question}&rdquo;</p>
                                    <p className="mt-1 mb-0 text-xs text-admin-subtext">{(index === 0) ? "The opening question" : "A new angle"} · {threadFollowUps(thread)}</p>
                                    {(thread.replies.length > 0) ? (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {thread.replies.map((reply: ElicitationThreadReply, step: number) => <span key={step} className="rounded-md bg-admin-muted px-2 py-0.5 text-xs text-admin-text">{THREAD_REPLY_LABELS[reply]}</span>)}
                                        </div>
                                    ) : null}
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            ) : null}

            {/* -------------------------------------------------------------------------------- */}
            {/* Topic */}
            {/* -------------------------------------------------------------------------------- */}
            <section className="rounded-xl border border-admin-border bg-admin-muted p-4!">
                <h3 className={`${THREAD_HEADING} mb-2 text-sm!`}>Topic</h3>
                <p className="mb-3 text-sm">&ldquo;{view.opening}&rdquo;</p>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-admin-subtext">Fresh angles the avatar could take</p>
                <ul className="mb-0 list-disc space-y-1 pl-5 text-sm">
                    {view.angles.map((angle: string) => <li key={angle}>{angle}</li>)}
                </ul>
            </section>
        </div>
    );
}


// --------------------------------------------------------------------------------
// Counting
// --------------------------------------------------------------------------------
// Words in one message: runs of anything but spaces
function countWords(text: string): number {
    return text.split(/\s+/).filter((word: string) => word.length > 0).length;
}

// The mean of some numbers (called only with at least one)
function average(values: number[]): number {
    return values.reduce((total: number, value: number) => total + value, 0) / values.length;
}

// Follow-ups per thread, as the line under their count
function perThread(followUps: number, threads: ElicitationThread[] | null): string {
    return ((threads === null) || (threads.length === 0)) ? "follow-up questions" : `${(followUps / threads.length).toFixed(1)} a thread on average`;
}

// One thread's follow-up questions (a reply that wound the chat down asks none)
function threadFollowUps(thread: ElicitationThread): string {
    const count = thread.replies.filter((reply: ElicitationThreadReply) => reply !== "wind_down").length;
    return (count === 1) ? "1 follow-up question" : `${count} follow-up questions`;
}
