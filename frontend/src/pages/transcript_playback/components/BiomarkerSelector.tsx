/* Select which biomarker to highlight in the transcript.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/BiomarkerSelector.tsx`

Select the biomarker score from the dropdown (only shows options that have any
existing scores for the chat). Also shows a "legend" explaining the meaning of
the highlights.

TODO: Probably should define 'BIOMARKER_LABELS' universally somewhere

*/
import { LuInfo } from "react-icons/lu";

import { ChatBiomarkerScore } from "@/api";
import { SEVERITY_HEX       } from "../biomarkers/severity";

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

    // Three reference swatches matching the new traffic-light scale.
    const swatches = [
        { color: SEVERITY_HEX.severe,   alpha: 0.75, label: "Severe"   },
        { color: SEVERITY_HEX.moderate, alpha: 0.45, label: "Moderate" },
        { color: SEVERITY_HEX.mild,     alpha: 0.20, label: "Mild"     },
    ];

    // Final UI Component
    return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">

            {/* Biomarker Dropdown */}
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-admin-subtext whitespace-nowrap">Highlight:</label>
                <select value={selectedBiomarker} onChange={(e) => onChange(e.target.value)} className={selectStyle}>
                    <option value="">None</option>
                    {available.map(type => (
                        <option key={type} value={type}>
                            {BIOMARKER_LABELS[type] ?? type}
                        </option>
                    ))}
                </select>
                {selectedBiomarker && onInfoClick && (
                    <button
                        type     ="button"
                        onClick  ={() => onInfoClick(selectedBiomarker)}
                        className="p-1 rounded text-admin-subtext hover:text-admin-text hover:bg-admin-muted cursor-pointer"
                        aria-label="More info on this biomarker"
                        title    ="Score details"
                    >
                        <LuInfo size={16} />
                    </button>
                )}
            </div>

            {/* Severity Color Legend */}
            <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-wide text-admin-subtext">Severity</span>
                {swatches.map(({ color, alpha, label }) => (
                    <span key={label} className="flex items-center gap-1.5">
                        <span
                            className ="inline-block w-4 h-4 rounded"
                            style     ={{ backgroundColor: hexAlpha(color, alpha) }}
                        />
                        <span className="text-xs text-admin-text">{label}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

function hexAlpha(hex: string, alpha: number): string {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
