/* Draw the smiley's mouth: the closed-mouth line, or the outlined opening with its teeth and tongue.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyMouth2D`

A closed mouth is the tapered smile line. As the mouth opens, that line fades
and the opening takes over: filled with the dark mouth gradient, with the
tongue and teeth drawn inside it (clipped to its outline so they never spill
past the lips), and a rounded outline all the way around on top. `mouthEyeFill`
fills the opening with the eyes' color instead of the dark red-brown. Lines between
the teeth use the outline's color and width, so every mouth line matches.
The cold face's icicles hang from the lower lip.

Each row of teeth is shaded white at its top to soft gray at its bottom. Both
gradients are laid out from the mouth's shape each frame rather than from each
row's own outline, so when the rows meet, the upper row's shading ends exactly
at the line between them and the lower row starts white just under it.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { SmileyPaint                                                  } from "./faceDrawing2D";
import      { SMILEY_MOUTH_OUTLINE_W, SMILEY_MOUTH_Y, SMILEY_RIBBON_EDGE_W } from "./faceDrawing2D";
import      { mouthShape                                                   } from "./faceDrawing2D";
import type { FaceState                                                    } from "./faceState";

// Openness below which the opening is not drawn (the closed-mouth line covers it)
const SMILEY_MOUTH_MIN_OPEN = 0.02;

// Teeth shading, from the top of a row to its bottom (white, a glossy middle, then soft gray)
const SMILEY_TEETH_HEXES = ["#ffffff", "#f6f2ec", "#d8cebf"] as const;


// --------------------------------------------------------------------------------
// Smiley Mouth (2D)
// --------------------------------------------------------------------------------
// The mouth, in the feature group's coordinates
export default function SmileyMouth2D({face, paint}: {
    face  : FaceState;     // Combined face for this frame
    paint : SmileyPaint;   // Gradient fills from `SmileyFace2D`
}): ReactElement {
    // Clip and teeth-shading ids, unique per avatar on the page (React's ids may hold characters `url(#...)` rejects)
    const baseId        = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const clipId        = `smiley-mouth-${baseId}`;
    const topTeethId    = `smiley-top-teeth-${baseId}`;
    const bottomTeethId = `smiley-bottom-teeth-${baseId}`;
    const mouth         = mouthShape(face);

    // Shade one row of teeth between two heights, in the mouth's coordinates
    const teethShade = (id: string, [fromY, toY]: [number, number]): ReactElement => (
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={fromY} x2={0} y2={toY}>
            {SMILEY_TEETH_HEXES.map((hex: string, i: number) => <stop key={hex} offset={`${(100 * i) / (SMILEY_TEETH_HEXES.length - 1)}%`} stopColor={hex} />)}
        </linearGradient>
    );

    return (
        <g transform={`translate(0 ${SMILEY_MOUTH_Y + face.mouthShift})`}>
            {/* Opening, with the tongue and teeth clipped inside it, then its outline on top */}
            {(face.mouthOpen > SMILEY_MOUTH_MIN_OPEN) ? (
                <>
                    <defs>
                        <clipPath id={clipId}>
                            <path d={mouth.opening} />
                        </clipPath>
                        {teethShade(topTeethId,    mouth.topTeethY   )}
                        {teethShade(bottomTeethId, mouth.bottomTeethY)}
                    </defs>
                    <path d={mouth.opening} fill={paint.mouth} />
                    {(face.mouthEyeFill > 0) ? <path d={mouth.opening} fill={paint.feature} opacity={face.mouthEyeFill} /> : null}
                    <g clipPath={`url(#${clipId})`}>
                        {(face.tongue > 0) ? <ellipse {...mouth.tongue} fill={paint.tongue} opacity={face.tongue} /> : null}
                        {(face.teethTop    > 0) ? <path d={mouth.topTeeth}    fill={`url(#${topTeethId})`}    /> : null}
                        {(face.teethBottom > 0) ? <path d={mouth.bottomTeeth} fill={`url(#${bottomTeethId})`} /> : null}
                        {(face.teethGaps   > 0) ? <path d={mouth.toothGaps}   fill="none" stroke={paint.feature} strokeWidth={SMILEY_MOUTH_OUTLINE_W} opacity={face.teethGaps} /> : null}
                        {((face.teethTop > 0) && (face.teethBottom > 0)) ? (
                            <path d={mouth.rowLine} fill="none" stroke={paint.feature} strokeWidth={SMILEY_MOUTH_OUTLINE_W} strokeLinecap="round" opacity={Math.min(face.teethTop, face.teethBottom)} />
                        ) : null}
                    </g>
                    <path d={mouth.opening} fill="none" stroke={paint.feature} strokeWidth={SMILEY_MOUTH_OUTLINE_W} strokeLinejoin="round" opacity={mouth.openFade} />
                </>
            ) : null}

            {/* Lip icicles (cold face) */}
            {(face.icicles > 0) ? <path d={mouth.drool} fill={paint.ice} opacity={face.icicles} /> : null}

            {/* Tapered closed-mouth line, fading out as the mouth opens */}
            {(mouth.openFade < 1) ? (
                <path d={mouth.line} fill={paint.feature} stroke={paint.feature} strokeWidth={SMILEY_RIBBON_EDGE_W} strokeLinejoin="round" opacity={1 - mouth.openFade} />
            ) : null}
        </g>
    );
}
