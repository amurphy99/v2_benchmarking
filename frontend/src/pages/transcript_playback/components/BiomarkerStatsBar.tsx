/* Summary stats for the currently selected biomarker type.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/BiomarkerStatsBar.tsx`

*/
import { ChatBiomarkerScore } from "@/api";
import { Pill               } from "@/pages/admin/components/ui/Pill";
import { severityStyle      } from "../biomarkers/severity";

interface Props {
    biomarkers       : ChatBiomarkerScore[];
    selectedBiomarker: string;
    vertical        ?: boolean;  // stack pills in a column (for the side panel)
}

// ================================================================================
// Shows score count, average score, and worst (lowest) score
// ================================================================================
export default function BiomarkerStatsBar({ biomarkers, selectedBiomarker, vertical = false }: Props) {
    if (!selectedBiomarker) return null;

    // Only count instances that have a time window (i.e. are mapped to transcript regions)
    const instances = biomarkers.filter(b =>
        b.score_type === selectedBiomarker && b.start_ts && b.end_ts
    );
    if (instances.length === 0) return null;

    // Get the stats to show
    const avg   = instances.reduce((s, b) => s + b.score, 0) / instances.length;
    const worst = Math.min(...instances.map(b => b.score));
    const best  = Math.max(...instances.map(b => b.score));

    // In the vertical (side-panel) layout, make every pill the same width as the
    // WIDEST one (a single max-content grid column), with the label left-aligned
    // and the number right-aligned.
    const pillClass = vertical ? "w-full justify-between" : "";

    return (
        <div className={vertical ? "grid grid-cols-[max-content] gap-1.5" : "flex items-center gap-2"}>
            <Pill label="Instances" value={instances.length} className={pillClass} />
            <Pill label="Average"   value={avg  .toFixed(3)} variant={severityStyle(avg  ).pillVariant} className={pillClass} />
            <Pill label="Worst"     value={worst.toFixed(3)} variant={severityStyle(worst).pillVariant} className={pillClass} />
            <Pill label="Best"      value={best .toFixed(3)} variant={severityStyle(best ).pillVariant} className={pillClass} />
        </div>
    );
}
