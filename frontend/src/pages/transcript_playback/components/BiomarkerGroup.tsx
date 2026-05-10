/* Wraps consecutive words belonging to the same ChatBiomarkerScore window.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/BiomarkerGroup`

Hover popup shows: name, score, description, time range, and an info button
that opens the per-biomarker explainer modal. 

The tooltip follows the cursor (position: fixed at clientX/Y).
Clicking a word locks the tooltip in place until the user clicks elsewhere.
*/
import { CSSProperties, ReactNode, useContext, useEffect, useState } from "react";
import { LuInfo } from "react-icons/lu";

// From this project
import { ChatBiomarkerScore                        } from "@/api";
import { getBiomarkerName, getBiomarkerDescription } from "@/utils/misc/descriptions";
import { formatElapsedMessage                      } from "@/utils/styling/numFormatting";
import { BiomarkerInfoContext                      } from "../biomarkers/BiomarkerInfoContext";

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
    const openInfo = useContext(BiomarkerInfoContext);

    // When locked: add a one-time document click listener to dismiss
    useEffect(() => {
        if (!locked) return;
        const dismiss = () => { setLocked(false); setVisible(false); };

        // Use a small timeout so the initial click that sets locked=true finishes before we start listening for the dismiss click
        const timer = setTimeout(() => { document.addEventListener("click", dismiss); }, 10);
    
        return () => { clearTimeout(timer); document.removeEventListener("click", dismiss); };
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
            onMouseLeave ={( ) => { if (!locked)   setVisible(false); }}
            onMouseMove  ={(e) => { if (!locked) { setPos({ x: e.clientX, y: e.clientY }); } }} // ONLY track coordinates if the tooltip is not locked in place
            onClick      ={(e) => { e.stopPropagation(); setLocked(true); setVisible(true); }}
        >
            {/* WordSpans */}
            {children}

            {visible && (
                <span style={tooltipStyle} className="pointer-events-none">
                    <span className="flex flex-col gap-1 bg-white bg-admin-panel border border-admin-border rounded-lg shadow-xl px-3 py-2 whitespace-nowrap pointer-events-auto">

                        {/* Name + Score */}
                        <span className="flex items-baseline justify-between gap-3">
                            <span className="font-semibold text-admin-text">{name}</span>
                            <span className="flex items-center gap-2">
                                <span className="font-mono text-admin-accent">{biomarker.score.toFixed(4)}</span>
                                {openInfo && (
                                    <button
                                        type     ="button"
                                        onClick  ={(e) => { e.stopPropagation(); openInfo(biomarker.score_type); }}
                                        className="p-0.5 rounded text-admin-subtext hover:text-admin-text hover:bg-admin-muted cursor-pointer"
                                        aria-label="Score details"
                                        title    ="More info"
                                    >
                                        <LuInfo size={14} />
                                    </button>
                                )}
                            </span>
                        </span>

                        {/* Description */}
                        {desc && <span className="text-admin-subtext text-xs">{desc}</span>}

                        {/* Time Range */}
                        <span className="text-admin-subtext text-[11px]">{secStart}s - {secEnd}s</span>

                    </span>
                </span>
            )}
        </span>
    );
}
