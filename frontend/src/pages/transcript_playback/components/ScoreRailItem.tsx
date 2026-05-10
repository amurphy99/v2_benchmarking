/* Per-utterance severity bar for the score rail.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/ScoreRailItem.tsx`

Renders a small horizontal bar (0 to 1 wide) colored by severity band, plus the
band label.
*/
import { severityStyle, SEVERITY_HEX } from "../biomarkers/severity";

interface Props {
    score : number | null | undefined;
}

// ================================================================================
// ScoreRailItem
// ================================================================================
export default function ScoreRailItem({ score }: Props) {
    // Return a dash for utterances with no scores
    if (score == null) {
        return (
            <div className="flex items-center justify-end h-7">
                <span className="text-admin-subtext text-xs">—</span>
            </div>
        );
    }

    // Score bar formatting
    const sev      = severityStyle(score);
    const fillPct  = Math.round((score) * 100); // 0 = bad => empty bar; 1 = good => full bar
    const barColor = sev.band === "none" ? "transparent" : SEVERITY_HEX[sev.band];

    // UI Component
    return (
        <div className="flex items-center gap-2 h-7 w-[160px]">

            {/* Score Bar */}
            <div className="relative h-2 flex-1 rounded-full bg-admin-muted border border-admin-border overflow-hidden">
                <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all"
                    style    ={{ width: `${fillPct}%`, backgroundColor: barColor }}
                />
            </div>

            {/* Score Number (3 decimal places) */}
            <span className="font-mono text-[14px] text-admin-subtext tabular-nums w-10 text-right">
                {score.toFixed(3)}
            </span>

        </div>
    );
}
