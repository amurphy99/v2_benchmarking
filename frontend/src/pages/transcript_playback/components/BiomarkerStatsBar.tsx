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
}

// ================================================================================
// Shows score count, average score, and worst (lowest) score
// ================================================================================
export default function BiomarkerStatsBar({ biomarkers, selectedBiomarker }: Props) {
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

    return (
        <div className="flex items-center gap-2">
            <Pill label="Instances" value={instances.length} />
            <Pill label="Average"   value={avg  .toFixed(3)} variant={severityStyle(avg  ).pillVariant } />
            <Pill label="Worst"     value={worst.toFixed(3)} variant={severityStyle(worst).pillVariant } />
            <Pill label="Best"      value={best .toFixed(3)} variant={severityStyle(best ).pillVariant } />
        </div>
    );
}
