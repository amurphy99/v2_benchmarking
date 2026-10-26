/* Draw one of the smiley's eyes and its eyebrow.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/render_2d/SmileyEye2D`

The open eye, the closed-eye arc, the spiral, and the heart all sit on the same
spot and crossfade by their amounts in the face state. The slanted eyelid is a
clip that cuts the top off the open eye, so it works over any face color.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { FaceState                                                                                } from "../state/faceState";
import type { SmileyPaint                                                                              } from "./faceDrawing2D";
import      { SMILEY_HEART_EYE_EDGE_W, SMILEY_HEART_PATH, SMILEY_RIBBON_EDGE_W, SMILEY_SPIRAL_STROKE_W } from "./faceDrawing2D";
import      { browPath, eyeArcPath, eyeGeometry, heartEyeScale, spiralPath, spiralRotationDeg          } from "./faceDrawing2D";

// Heart eye outline and gloss
const SMILEY_HEART_EYE_EDGE_HEX      = "#8a0820";
const SMILEY_HEART_EYE_GLOSS_HEX     = "#ffffff";
const SMILEY_HEART_EYE_GLOSS_OPACITY = 0.6;


// --------------------------------------------------------------------------------
// Smiley Eye (2D)
// --------------------------------------------------------------------------------
// One eye and its brow, in the feature group's coordinates
export default function SmileyEye2D({side, face, paint}: {
    side  : number;        // -1 for the left eye, 1 for the right
    face  : FaceState;     // Combined face for this frame
    paint : SmileyPaint;   // Gradient fills from `SmileyFace2D`
}): ReactElement {
    // Eyelid clip id, unique per eye on the page (React's ids may hold characters `url(#...)` rejects)
    const lidClipId = `smiley-lid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    // The open eye fades out as any other eye style fades in
    const eye         = eyeGeometry(side, face);
    const openOpacity = (1 - face.eyeArc) * (1 - face.spiral) * (1 - face.heartEyes);

    return (
        <g>
            {/* Tapered eyebrow */}
            {(face.brows > 0) ? (
                <path d={browPath(side, face)} fill={paint.feature} stroke={paint.feature} strokeWidth={SMILEY_RIBBON_EDGE_W} strokeLinejoin="round" opacity={face.brows} />
            ) : null}

            <g transform={`translate(${eye.cx} ${eye.cy})`}>
                {/* Open eye, with the eyelid's slant cutting off its top */}
                <clipPath id={lidClipId}>
                    <rect x={-2 * eye.rx} y={eye.lidEdgeY} width={4 * eye.rx} height={4 * eye.ry} transform={`rotate(${eye.lidDeg} 0 ${eye.lidEdgeY})`} />
                </clipPath>
                <ellipse rx={eye.rx} ry={eye.ry} fill={paint.feature} clipPath={`url(#${lidClipId})`} opacity={openOpacity} />

                {/* Tapered closed-eye arc */}
                {(face.eyeArc > 0) ? (
                    <path d={eyeArcPath(face)} fill={paint.feature} stroke={paint.feature} strokeWidth={SMILEY_RIBBON_EDGE_W} strokeLinejoin="round" opacity={face.eyeArc} />
                ) : null}

                {/* Spinning spiral */}
                {(face.spiral > 0) ? (
                    <path
                        d              = {spiralPath(face)}
                        transform      = {`rotate(${spiralRotationDeg(side, face)})`}
                        fill           = "none"
                        stroke         = {paint.feature}
                        strokeWidth    = {SMILEY_SPIRAL_STROKE_W}
                        strokeLinecap  = "round"
                        strokeLinejoin = "round"
                        opacity        = {face.spiral}
                    />
                ) : null}

                {/* Heart with a thin darker outline and a small gloss (sizes are in the heart's own unit size,
                    so the outline width undoes its scale) */}
                {(face.heartEyes > 0) ? (
                    <g transform={`scale(${heartEyeScale(face)})`} opacity={face.heartEyes}>
                        <path d={SMILEY_HEART_PATH} fill={paint.heartEye} stroke={SMILEY_HEART_EYE_EDGE_HEX} strokeWidth={SMILEY_HEART_EYE_EDGE_W / heartEyeScale(face)} strokeLinejoin="round" />
                        <ellipse cx={-0.42} cy={-0.5} rx={0.2} ry={0.12} transform="rotate(-35 -0.42 -0.5)" fill={SMILEY_HEART_EYE_GLOSS_HEX} opacity={SMILEY_HEART_EYE_GLOSS_OPACITY} />
                    </g>
                ) : null}
            </g>
        </g>
    );
}
