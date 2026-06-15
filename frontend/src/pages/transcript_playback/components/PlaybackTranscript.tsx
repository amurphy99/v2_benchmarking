/* Transcript container w audio playback controls & biomarker highlighting.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/PlaybackTranscript.tsx`

When the score rail is enabled, both columns share a single CSS grid so each
utterance and its score-rail item land in the same row. This will make their 
heights equalize automatically.

*/
import { Fragment, useDeferredValue, useMemo } from "react";

// From this project
import { ChatMessage, ChatBiomarkerScore, ChatWord } from "@/api";
import { Spinner                                   } from "@/components/Spinner";
import   UtteranceLine                               from "./UtteranceLine";
import   ScoreRailItem, { RailStats }                from "./ScoreRailItem";
import { useBiomarkerWordScores                    } from "./../utils/useBiomarkerScores";
import { splitWordsByGap                           } from "./../utils/utteranceFormatting";

// One rendered transcript row: a whole message, or one "gap-split" piece of a 
// turn (where there was a pause longer than 1.5 seconds).
// `words` is the slice to render (null => render the whole message / no words).
type DisplayRow = { key: string; msg: ChatMessage; words: ChatWord[] | null };

// Format a row's word-level biomarker scores into worst/avg/span-count for the info rail
function railStatsForWords(
    words      : ChatWord[] | null,
    wordScores : Map<number, ChatBiomarkerScore>,
): RailStats | null {
    if (!words || words.length === 0) return null;

    const found: ChatBiomarkerScore[] = [];
    for (const w of words) { const s = wordScores.get(w.id); if (s) found.push(s); }
    if (found.length === 0) return null;

    // Statistics
    const worst     = Math.min(...found.map(s => s.score));
    const avg       = found.reduce((a, s) => a + s.score, 0) / found.length;
    const spanCount = new Set(found.map(s => s.id)).size;
    return { worst, avg, spanCount };
}

interface Props {
    messages         : ChatMessage[];
    biomarkers       : ChatBiomarkerScore[];
    sessionStartMs   : number;
    currentTime      : number;
    selectedBiomarker: string;
    userName         : string;
    onSeek           : (sec: number) => void;
    showScoreRail   ?: boolean;
}

// ================================================================================
// Display the transcript (sorted messages with highlighted word IDs)
// ================================================================================
export default function PlaybackTranscript({
    messages,
    biomarkers,
    sessionStartMs,
    currentTime,
    selectedBiomarker,
    userName,
    onSeek,
    showScoreRail = false,
}: Props) {
    // Defer the heavy computations behind matching each word with it's proper 
    // highlight so the page doesn't freeze: React keeps the previously-committed (old) 
    // highlights on screen while the new ones compute at low priority. The value
    // `computing` is true during that transition, which we use to dim the transcript 
    // and show a spinner overlay.
    const deferredBiomarker = useDeferredValue(selectedBiomarker);
    const computing         = deferredBiomarker !== selectedBiomarker;

    // Map of word ID -> most-severe biomarker score (re-calculated only when the biomarker selection or data changes).
    // The score rail derives its per-row stats from this same map (see railStatsForWords).
    const biomarkerWordScores = useBiomarkerWordScores(messages, biomarkers, deferredBiomarker, sessionStartMs);

    // Sort the messages and display; including the list of words to highlight
    const sorted = useMemo(
        () => [...messages].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()),
        [messages],
    );

    // Expand messages into display rows (split a user turn into separate utterances
    // wherever there's a long silent gap between words). This is for the frontend UI
    // only, the backend data stays the same.
    const displayRows = useMemo<DisplayRow[]>(() => {
        const rows: DisplayRow[] = [];
        for (const msg of sorted) {
            const words = msg.words ?? [];
            if (msg.role === "user" && words.length > 0) { for (const piece of splitWordsByGap(words)) { rows.push({ key: `w${piece[0].id}`, msg, words: piece }); } } 
            else                                         {                                               rows.push({ key: `m${  msg   .id}`, msg, words: null  });   }
        }
        return rows;
    }, [sorted]);

    // Active row for the playback caret (matched per display row, not per message)
    const activeRowKey = useMemo(() => {
        for (const row of displayRows) {
            const startIso = row.words?.length ? row.words[0].start_ts                  : (row.msg.start_ts ?? row.msg.ts);
            const endIso   = row.words?.length ? row.words[row.words.length - 1].end_ts : (row.msg.end_ts   ?? row.msg.ts);
            const start    = (new Date(startIso).getTime() - sessionStartMs) / 1_000;
            const end      = (new Date(endIso  ).getTime() - sessionStartMs) / 1_000;
            if (currentTime >= start && currentTime < end) return row.key;
        }
        return null;
    }, [displayRows, currentTime, sessionStartMs]);

    const containerClass = showScoreRail
        ? "mx-auto max-w-[1200px] px-4 md:px-6 py-6"
        : "mx-auto max-w-[900px] px-4 md:px-6 py-6";

    return (
        <div className={containerClass}>
            <div className="relative rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden">

                {/* While new highlights compute, dim the transcript + show a spinner overlay */}
                {computing && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-admin-panel/40">
                        <Spinner />
                    </div>
                )}

                <div className={computing ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
                {displayRows.length === 0 ? (
                    <div className="px-6 py-8 text-center text-admin-subtext">No messages in this session.</div>
                ) : (
                    <div className={`grid ${showScoreRail ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"}`}>
                        
                        {/* -------------------------------------------------------------------------------- */}
                        {/* Header row when rail visible */}
                        {/* -------------------------------------------------------------------------------- */}
                        {showScoreRail && (
                            <>
                                <div className="px-5 py-2 text-[11px] uppercase font-semibold text-admin-subtext border-b border-admin-border">
                                    Transcript
                                </div>
                                <div className="px-4 py-2 text-[11px] uppercase font-semibold text-admin-subtext border-b border-l border-admin-border">
                                    Score
                                </div>
                            </>
                        )}

                        {/* -------------------------------------------------------------------------------- */}
                        {/* Transcript (utterance lines) */}
                        {/* -------------------------------------------------------------------------------- */}
                        {displayRows.map((row, idx) => {
                            const isLast = idx === displayRows.length - 1;
                            const rowBorder = isLast ? "" : "border-b border-admin-border/60";
                            const utteranceCell = (
                                <div className={`px-5 py-3 ${rowBorder}`}>
                                    <UtteranceLine
                                        msg                ={row.msg}
                                        words              ={row.words ?? undefined}
                                        userName           ={userName}
                                        sessionStartMs     ={sessionStartMs}
                                        currentTime        ={currentTime}
                                        biomarkerWordScores={biomarkerWordScores}
                                        onSeek             ={onSeek}
                                        isActiveLine       ={row.key === activeRowKey}
                                    />
                                </div>
                            );

                            if (!showScoreRail) {
                                return <div key={row.key}>{utteranceCell}</div>;
                            }

                            const stats = railStatsForWords(row.words, biomarkerWordScores);
                            return (
                                <Fragment key={row.key}>
                                    {utteranceCell}
                                    <div className={`px-4 py-3 flex items-center border-l border-admin-border ${rowBorder}`}>
                                        <ScoreRailItem stats={stats} />
                                    </div>
                                </Fragment>
                            );
                        })}
                    </div>
                )}
                </div>
            </div>
        </div>
    );
}
