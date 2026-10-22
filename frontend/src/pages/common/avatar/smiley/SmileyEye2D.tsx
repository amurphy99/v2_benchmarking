/* Draw one of the smiley's eyes and its eyebrow.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyEye2D`

The open eye, the closed-eye arc, the spiral, and the heart all sit on the same
spot and crossfade by their amounts in the face state. The slanted eyelid is a
clip that cuts the top off the open eye, so it works over any face color.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import      { SMILEY_BROW_STROKE_W, SMILEY_FEATURE_HEX, SMILEY_FEATURE_STROKE_W               } from "./faceDrawing2D";
import      { SMILEY_HEART_HEX, SMILEY_HEART_PATH, SMILEY_SPIRAL_STROKE_W                     } from "./faceDrawing2D";
import      { browPath, eyeArcPath, eyeGeometry, heartEyeScale, spiralPath, spiralRotationDeg } from "./faceDrawing2D";
import type { FaceState                                                                       } from "./faceState";


// --------------------------------------------------------------------------------
// Smiley Eye (2D)
// --------------------------------------------------------------------------------
// One eye and its brow, in the feature group's coordinates
export default function SmileyEye2D({side, face}: {
    side : number;      // -1 for the left eye, 1 for the right
    face : FaceState;   // Combined face for this frame
}): ReactElement {
    // Eyelid clip id, unique per eye on the page (React's ids may hold characters `url(#...)` rejects)
    const lidClipId = `smiley-lid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    // The open eye fades out as any other eye style fades in
    const eye         = eyeGeometry(side, face);
    const openOpacity = (1 - face.eyeArc) * (1 - face.spiral) * (1 - face.heartEyes);

    return (
        <g>
            {/* Eyebrow */}
            {(face.brows > 0) ? (
                <path d={browPath(side, face)} fill="none" stroke={SMILEY_FEATURE_HEX} strokeWidth={SMILEY_BROW_STROKE_W} strokeLinecap="round" opacity={face.brows} />
            ) : null}

            <g transform={`translate(${eye.cx} ${eye.cy})`}>
                {/* Open eye, with the eyelid's slant cutting off its top */}
                <clipPath id={lidClipId}>
                    <rect x={-2 * eye.rx} y={eye.lidEdgeY} width={4 * eye.rx} height={(3 * eye.ry) + SMILEY_FEATURE_STROKE_W} transform={`rotate(${eye.lidDeg} 0 ${eye.lidEdgeY})`} />
                </clipPath>
                <ellipse rx={eye.rx} ry={eye.ry} fill={SMILEY_FEATURE_HEX} clipPath={`url(#${lidClipId})`} opacity={openOpacity} />

                {/* Closed-eye arc */}
                {(face.eyeArc > 0) ? (
                    <path d={eyeArcPath(face)} fill="none" stroke={SMILEY_FEATURE_HEX} strokeWidth={SMILEY_FEATURE_STROKE_W} strokeLinecap="round" opacity={face.eyeArc} />
                ) : null}

                {/* Spinning spiral */}
                {(face.spiral > 0) ? (
                    <path
                        d              = {spiralPath(face)}
                        transform      = {`rotate(${spiralRotationDeg(side, face)})`}
                        fill           = "none"
                        stroke         = {SMILEY_FEATURE_HEX}
                        strokeWidth    = {SMILEY_SPIRAL_STROKE_W}
                        strokeLinecap  = "round"
                        strokeLinejoin = "round"
                        opacity        = {face.spiral}
                    />
                ) : null}

                {/* Heart */}
                {(face.heartEyes > 0) ? (
                    <path d={SMILEY_HEART_PATH} transform={`scale(${heartEyeScale(face)})`} fill={SMILEY_HEART_HEX} opacity={face.heartEyes} />
                ) : null}
            </g>
        </g>
    );
}
