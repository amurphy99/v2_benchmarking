/*
Wraps consecutive words belonging to the same ChatBiomarkerScore window.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/BiomarkerGroup`

Displays a popup on hover with: 
  - biomarker name
  - description
  - score
  - time range

TODO: Make it more robust, so the popup should show up on the left or follow the users cursor
TODO: If the user clicks on it, the popup should stay until they click somewhere else to make it go away

*/
import { ReactNode, useState } from "react";

// From this project
import { ChatBiomarkerScore                        } from "@/api";
import { getBiomarkerName, getBiomarkerDescription } from "@/utils/misc/descriptions";
import { formatElapsedMessage                      } from "@/utils/styling/numFormatting";

interface Props {
    biomarker     : ChatBiomarkerScore;
    sessionStartMs: number;
    children      : ReactNode;
}

// --------------------------------------------------------------------------------
// Wraps words from the same biomarker score so they show the same popup
// --------------------------------------------------------------------------------
export default function BiomarkerGroup({ biomarker, sessionStartMs, children }: Props) {
    const [visible, setVisible] = useState(false);

    // Elapsed time from session start
    const secStart = formatElapsedMessage(sessionStartMs, biomarker.start_ts)
    const secEnd   = formatElapsedMessage(sessionStartMs, biomarker.  end_ts)

    // Get "nice" biomarker name & description (handles unknown names)
    let name = biomarker.score_type; let desc = "";
    try { name = getBiomarkerName       (biomarker.score_type); } catch { /* unknown type */ }
    try { desc = getBiomarkerDescription(biomarker.score_type); } catch { /* unknown type */ }

    // Final UI Component
    return (
        <span className ="relative" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
            {/* WordSpans */}
            {children}

            {visible && (
                <span className="absolute bottom-full left-0 z-50 mb-1 pointer-events-none">
                    <span className="flex flex-col gap-[2px] bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 whitespace-nowrap">

                        {/* Name + Score */}
                        <span className="flex items-baseline justify-between gap-4">
                            <span className="font-semibold text-gray-800">{name}</span>
                            <span className="font-mono text-violet-600">{biomarker.score.toFixed(4)}</span>
                        </span>

                        {/* Description */}
                        {desc && <span className="text-gray-500">{desc}</span>}

                        {/* Time Range */}
                        <span className="text-gray-400 text-small">{secStart}s - {secEnd}s</span>

                    </span>
                </span>
            )}
        </span>
    );
}
