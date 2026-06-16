/* Select which biomarker to highlight in the transcript.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/BiomarkerSelector.tsx`

Select the biomarker score from the dropdown (only shows options that have any
existing scores for the chat). The severity color key lives separately in
`SeverityLegend.tsx`.

TODO: Probably should define 'BIOMARKER_LABELS' universally somewhere

*/
import { LuInfo } from "react-icons/lu";

import { ChatBiomarkerScore } from "@/api";

// Biomarker display name mapping
const BIOMARKER_LABELS: Record<string, string> = {
    alteredgrammar : "Altered Grammar",
    anomia         : "Anomia",
    pragmatic      : "Pragmatic Impairment",
    pronunciation  : "Pronunciation",
    prosody        : "Prosody",
    turntaking     : "Turn Taking",
    perplexity     : "Perplexity Difference",
};

interface Props {
    biomarkers        : ChatBiomarkerScore[];
    selectedBiomarker : string;
    onChange          : (value        : string) => void;
    onInfoClick      ?: (biomarkerType: string) => void;
}

// ================================================================================
// Select a biomarker score type to view transcript highlighting for
// ================================================================================
// Renders a dropdown that only appears when the session has biomarker scores
// with associated time windows (start_ts / end_ts).
export default function BiomarkerSelector({ biomarkers, selectedBiomarker, onChange, onInfoClick }: Props) {
    // Get biomarkers from the ChatSession
    const available = Array.from(new Set(
        biomarkers.filter(b => b.start_ts && b.end_ts).map(b => b.score_type)
    ));
    // Don't show if there are no biomarkers
    if (available.length === 0) return null;

    // Style helper
    const selectStyle = "px-3 py-1.5 border border-admin-border rounded-md text-sm font-medium text-admin-text bg-admin-panel hover:bg-admin-muted cursor-pointer";

    // Final UI Component
    return (
        <div className="flex items-center gap-2 min-w-0">
            <label className="text-sm font-medium text-admin-subtext whitespace-nowrap">Highlight:</label>

            {/* Biomarker Dropdown */}
            <select value={selectedBiomarker} onChange={(e) => onChange(e.target.value)} className={`${selectStyle} min-w-0 flex-1`}>
                <option value="">None</option>
                {available.map(type => (
                    <option key={type} value={type}>
                        {BIOMARKER_LABELS[type] ?? type}
                    </option>
                ))}
            </select>

            {/* Biomarker Info */}
            {selectedBiomarker && onInfoClick && (
                <button
                    type       = "button"
                    onClick    = {() => onInfoClick(selectedBiomarker)}
                    className  = "p-1 rounded text-admin-subtext hover:text-admin-text hover:bg-admin-muted cursor-pointer shrink-0"
                    aria-label = "More info on this biomarker"
                    title      = "Score details"
                >
                    <LuInfo size={16} />
                </button>
            )}
        </div>
    );
}
