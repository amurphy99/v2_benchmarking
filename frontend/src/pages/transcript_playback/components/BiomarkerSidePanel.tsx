/* Collected controls for the active biomarker.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/BiomarkerSidePanel.tsx`

Bundles everything tied to the currently-selected biomarker: the highlight
dropdown, the severity color key, the score stats, and the score-rail toggle.

Rendered two ways:
  - layout="side"   => a vertical card pinned in a reserved sidebar (wide screens)
  - layout="inline" => a horizontal bar at the top of the body (narrow screens)
*/
import { LuColumns2 } from "react-icons/lu";

// From this project
import { ChatBiomarkerScore } from "@/api";
import { AdminButton        } from "@/pages/admin/components/ui/AdminButton";
import BiomarkerSelector      from "./BiomarkerSelector";
import BiomarkerStatsBar      from "./BiomarkerStatsBar";
import SeverityLegend         from "./SeverityLegend";

interface Props {
    biomarkers        : ChatBiomarkerScore[];
    selectedBiomarker : string;
    onChange          : (value        : string) => void;
    onInfoClick      ?: (biomarkerType: string) => void;
    showScoreRail     : boolean;
    onToggleScoreRail : () => void;
    layout            : "side" | "inline";
}

// ================================================================================
// BiomarkerSidePanel
// ================================================================================
export default function BiomarkerSidePanel({
    biomarkers,
    selectedBiomarker,
    onChange,
    onInfoClick,
    showScoreRail,
    onToggleScoreRail,
    layout,
}: Props) {
    const isSide = layout === "side";

    // Shared pieces (vertical when in the side card)
    const selector = (
        <BiomarkerSelector
            biomarkers        = {biomarkers}
            selectedBiomarker = {selectedBiomarker}
            onChange          = {onChange}
            onInfoClick       = {onInfoClick}
        />
    );
    const legend = <SeverityLegend   vertical={isSide} />;
    const stats  = <BiomarkerStatsBar biomarkers={biomarkers} selectedBiomarker={selectedBiomarker} vertical={isSide} />;
    const toggle = (
        <AdminButton
            variant ={showScoreRail ? "primary" : "outline"}
            size     = "sm"
            iconLeft = {<LuColumns2 size={14} />}
            onClick  = {onToggleScoreRail}
        >
            Score rail
        </AdminButton>
    );

    // --------------------------------------------------------------------------------
    // Inline bar (narrow screens) -- single horizontal wrapping row, no card
    // --------------------------------------------------------------------------------
    if (!isSide) {
        return (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {selector}
                {legend}
                {stats}
                {toggle}
            </div>
        );
    }

    // --------------------------------------------------------------------------------
    // Side card (wide screens) -- vertical, with thin dividers between sections
    // --------------------------------------------------------------------------------
    const divider = <div className="border-t border-admin-border/60" />;
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-admin-border bg-admin-panel shadow-sm p-4">
            {selector}
            {divider}
            {legend}
            {divider}
            {stats}
            {divider}
            {toggle}
        </div>
    );
}
