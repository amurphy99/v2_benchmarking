/*
Wraps consecutive words belonging to the same ChatBiomarkerScore window.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/BiomarkerGroup`

Displays a popup on hover with: 
  - biomarker name
  - description
  - score
  - time range

The tooltip follows the cursor (position: fixed at clientX/Y).
Clicking a word locks the tooltip in place until the user clicks elsewhere.

TODO: Change the time on the card to be total seconds, not MM:SS:xx

*/
import { CSSProperties, ReactNode, useEffect, useState } from "react";

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
    const [locked,  setLocked ] = useState(false);
    const [pos,     setPos    ] = useState({ x: 0, y: 0 });

    // When locked: add a one-time document click listener to dismiss
    useEffect(() => {
        if (!locked) return;
        const dismiss = () => { setLocked(false); setVisible(false); };
        document.addEventListener("click", dismiss);
        return () => document.removeEventListener("click", dismiss);
    }, [locked]);

    // Elapsed time from session start
    const secStart = formatElapsedMessage(sessionStartMs, biomarker.start_ts);
    const secEnd   = formatElapsedMessage(sessionStartMs, biomarker.  end_ts);

    // Get "nice" biomarker name & description (handles unknown names)
    let name = biomarker.score_type; let desc = "";
    try { name = getBiomarkerName       (biomarker.score_type); } catch { /* unknown type */ }
    try { desc = getBiomarkerDescription(biomarker.score_type); } catch { /* unknown type */ }

    // Tooltip follows cursor -> fixed positioning relative to viewport
    const tooltipStyle: CSSProperties = {
        position : "fixed",
        left     : pos.x + 12,
        top      : pos.y,
        transform: "translateY(calc(-100% - 15px))",
        zIndex   : 50,
    };

    // Final UI Component
    return (
        <span
            onMouseEnter ={( ) => { setVisible(true); }}
            onMouseLeave ={( ) => { if (!locked) setVisible(false); }}
            onMouseMove  ={(e) => { setPos({ x: e.clientX, y: e.clientY }); }}
            onClick      ={(e) => { e.stopPropagation(); setLocked(true); setVisible(true); }}
        >
            {/* WordSpans */}
            {children}

            {visible && (
                <span className="pointer-events-none" style={tooltipStyle}>
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
