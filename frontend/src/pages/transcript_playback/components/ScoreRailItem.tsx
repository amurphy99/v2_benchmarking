/* Per-utterance severity summary for the score rail.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/ScoreRailItem.tsx`

Renders a small horizontal bar (0 to 1 wide) colored by the WORST severity in the
utterance, plus the worst score, the average score, and the count of flagged
biomarker spans in that utterance.
*/
import { severityStyle, SEVERITY_HEX } from "../biomarkers/severity";

// Per-utterance rollup derived from the word-level biomarker scores
export interface RailStats {
    worst     : number;  // Lowest (most severe) score in the utterance
    avg       : number;  // Mean score across flagged words
    spanCount : number;  // Number of distinct biomarker windows touching the utterance
}

interface Props {
    stats : RailStats | null | undefined;
}

// ================================================================================
// ScoreRailItem
// ================================================================================
export default function ScoreRailItem({ stats }: Props) {
    // Return a dash for utterances with no scores
    if (stats == null) {
        return (
            <div className="flex items-center justify-end h-7">
                <span className="text-admin-subtext text-xs">—</span>
            </div>
        );
    }

    // Bar reflects the WORST score (0 = bad => empty bar; 1 = good => full bar)
    const sev      = severityStyle(stats.worst);
    const fillPct  = Math.round(stats.worst * 100);
    const barColor = sev.band === "none" ? "transparent" : SEVERITY_HEX[sev.band];

    // UI Component
    return (
        <div className="flex items-center gap-2 h-7 w-[210px]">

            {/* Score Bar (colored by worst severity) */}
            <div className="relative h-2 flex-1 rounded-full bg-admin-muted border border-admin-border overflow-hidden">
                <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all"
                    style    ={{ width: `${fillPct}%`, backgroundColor: barColor }}
                />
            </div>

            {/* Worst | Average | Span count */}
            <div className="flex items-baseline gap-2 font-mono text-[13px] tabular-nums whitespace-nowrap">
                <span className="text-admin-text w-9 text-right" title="Worst score">
                    {stats.worst.toFixed(2)}
                </span>
                <span className="text-admin-subtext" title="Average score">
                    avg={stats.avg.toFixed(2)}
                </span>
                <span className="text-admin-subtext" title="Flagged spans">
                    #{stats.spanCount}
                </span>
            </div>

        </div>
    );
}
