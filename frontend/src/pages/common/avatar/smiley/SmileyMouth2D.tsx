/* Draw the smiley's mouth: the closed-mouth line, or the outlined opening with its teeth and tongue.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyMouth2D`

A closed mouth is the tapered smile line. As the mouth opens, that line fades
and the opening takes over: filled with the dark mouth gradient, with the
tongue and teeth drawn inside it (clipped to its outline so they never spill
past the lips), and a rounded outline all the way around on top.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { SmileyPaint                                                  } from "./faceDrawing2D";
import      { SMILEY_MOUTH_OUTLINE_W, SMILEY_MOUTH_Y, SMILEY_RIBBON_EDGE_W } from "./faceDrawing2D";
import      { mouthShape                                                   } from "./faceDrawing2D";
import type { FaceState                                                    } from "./faceState";

// Lines between teeth and between the rows
const SMILEY_TOOTH_LINE_HEX = "#c9bca9";
const SMILEY_TOOTH_LINE_W   = 1.8;

// Openness below which the opening is not drawn (the closed-mouth line covers it)
const SMILEY_MOUTH_MIN_OPEN = 0.02;


// --------------------------------------------------------------------------------
// Smiley Mouth (2D)
// --------------------------------------------------------------------------------
// The mouth, in the feature group's coordinates
export default function SmileyMouth2D({face, paint}: {
    face  : FaceState;     // Combined face for this frame
    paint : SmileyPaint;   // Gradient fills from `SmileyFace2D`
}): ReactElement {
    // Opening clip id, unique per avatar on the page (React's ids may hold characters `url(#...)` rejects)
    const clipId = `smiley-mouth-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const mouth  = mouthShape(face);

    return (
        <g transform={`translate(0 ${SMILEY_MOUTH_Y})`}>
            {/* Opening, with the tongue and teeth clipped inside it, then its outline on top */}
            {(face.mouthOpen > SMILEY_MOUTH_MIN_OPEN) ? (
                <>
                    <clipPath id={clipId}>
                        <path d={mouth.opening} />
                    </clipPath>
                    <path d={mouth.opening} fill={paint.mouth} />
                    <g clipPath={`url(#${clipId})`}>
                        {(face.tongue > 0) ? <ellipse {...mouth.tongue} fill={paint.tongue} opacity={face.tongue} /> : null}
                        {(face.teethTop    > 0) ? <path d={mouth.topTeeth}    fill={paint.teeth} /> : null}
                        {(face.teethBottom > 0) ? <path d={mouth.bottomTeeth} fill={paint.teeth} /> : null}
                        {(face.teethGaps   > 0) ? <path d={mouth.toothGaps}   fill="none" stroke={SMILEY_TOOTH_LINE_HEX} strokeWidth={SMILEY_TOOTH_LINE_W} opacity={face.teethGaps} /> : null}
                        {((face.teethTop > 0) && (face.teethBottom > 0)) ? (
                            <path d={mouth.rowLine} fill="none" stroke={SMILEY_TOOTH_LINE_HEX} strokeWidth={SMILEY_TOOTH_LINE_W} opacity={Math.min(face.teethTop, face.teethBottom)} />
                        ) : null}
                    </g>
                    <path d={mouth.opening} fill="none" stroke={paint.feature} strokeWidth={SMILEY_MOUTH_OUTLINE_W} strokeLinejoin="round" opacity={mouth.openFade} />
                </>
            ) : null}

            {/* Tapered closed-mouth line, fading out as the mouth opens */}
            {(mouth.openFade < 1) ? (
                <path d={mouth.line} fill={paint.feature} stroke={paint.feature} strokeWidth={SMILEY_RIBBON_EDGE_W} strokeLinejoin="round" opacity={1 - mouth.openFade} />
            ) : null}
        </g>
    );
}
