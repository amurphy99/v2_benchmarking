/* Transcript container w audio playback controls & biomarker highlighting.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/PlaybackTranscript.tsx`

When the score rail is enabled, both columns share a single CSS grid so each
utterance and its score-rail item land in the same row. This will make their 
heights equalize automatically.

*/
import { Fragment, useMemo } from "react";

// From this project
import { ChatMessage, ChatBiomarkerScore } from "@/api";
import   UtteranceLine                     from "./UtteranceLine";
import   ScoreRailItem                     from "./ScoreRailItem";
import { useBiomarkerWordScores          } from "./../utils/useBiomarkerScores";
import { useBiomarkerMessageScores       } from "./../utils/useBiomarkerScores";

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
    // Map of word/message IDs -> most-severe biomarker score (re-calculated only when the biomarker selection or data changes)
    // TODO: Actually use the message scores map
    const biomarkerWordScores = useBiomarkerWordScores   (messages, biomarkers, selectedBiomarker, sessionStartMs);
    const biomarkerMsgsScores = useBiomarkerMessageScores(messages, biomarkers, selectedBiomarker, sessionStartMs);

    // Sort the messages and display; including the list of words to highlight
    const sorted = useMemo(
        () => [...messages].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()),
        [messages],
    );

    // Active line for the playback caret
    const activeMessageId = useMemo(() => {
        for (const m of sorted) {
            const start = (new Date(m.start_ts ?? m.ts).getTime() - sessionStartMs) / 1_000;
            const end   = (new Date(m.end_ts   ?? m.ts).getTime() - sessionStartMs) / 1_000;
            if (currentTime >= start && currentTime < end) return m.id;
        }
        return null;
    }, [sorted, currentTime, sessionStartMs]);

    const containerClass = showScoreRail
        ? "mx-auto max-w-[1200px] px-4 md:px-6 py-6"
        : "mx-auto max-w-[900px] px-4 md:px-6 py-6";

    return (
        <div className={containerClass}>
            <div className="rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden">
                {sorted.length === 0 ? (
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
                        {sorted.map((msg, idx) => {
                            const isLast = idx === sorted.length - 1;
                            const rowBorder = isLast ? "" : "border-b border-admin-border/60";
                            const utteranceCell = (
                                <div className={`px-5 py-3 ${rowBorder}`}>
                                    <UtteranceLine
                                        msg                ={msg}
                                        userName           ={userName}
                                        sessionStartMs     ={sessionStartMs}
                                        currentTime        ={currentTime}
                                        biomarkerWordScores={biomarkerWordScores}
                                        onSeek             ={onSeek}
                                        isActiveLine       ={msg.id === activeMessageId}
                                    />
                                </div>
                            );

                            if (!showScoreRail) {
                                return <div key={msg.id}>{utteranceCell}</div>;
                            }

                            const score = biomarkerMsgsScores.get(msg.id) ?? null;
                            return (
                                <Fragment key={msg.id}>
                                    {utteranceCell}
                                    <div className={`px-4 py-3 flex items-center border-l border-admin-border ${rowBorder}`}>
                                        <ScoreRailItem score={score} />
                                    </div>
                                </Fragment>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
