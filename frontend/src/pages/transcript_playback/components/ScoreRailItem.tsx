/* Per-utterance severity summary for the score rail.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/ScoreRailItem.tsx`

Renders a small horizontal bar (0 to 1 wide) colored by the WORST severity in the
utterance, plus the worst score, the average score, and the count of flagged
biomarker spans in that utterance.
*/
import { severityStyle, SEVERITY_HEX } from "../biomarkers/severity";
import { RailStats                   } from "../biomarkers/useRailStats";

interface Props { stats : RailStats | null | undefined; }

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
        <div className="flex flex-col gap-1 w-[210px]">

            {/* Line 1: severity bar + worst score */}
            <div className="flex items-center gap-2">
                <div className="relative h-2 flex-1 rounded-full bg-admin-muted border border-admin-border overflow-hidden">
                    <div
                        className="absolute left-0 top-0 h-full rounded-full transition-all"
                        style    ={{ width: `${fillPct}%`, backgroundColor: barColor }}
                    />
                </div>
                <span className="font-mono text-[13px] tabular-nums text-admin-text w-9 text-right" title="Worst score">
                    {stats.worst.toFixed(3)}
                </span>
            </div>

            {/* Line 2: average + flagged-span count */}
            <div className="flex items-baseline gap-3 font-mono text-[11px] tabular-nums text-admin-subtext whitespace-nowrap">
                <span title="Utterance average score">avg {stats.avg.toFixed(3)}</span>
                <span title="Number of flagged biomarker spans">{stats.flaggedCount}/{stats.spanCount} flagged</span>
            </div>

        </div>
    );
}
