/* Draw one of the robot's eyes and its eyebrow, as light on the screen.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/render_2d/RobotEye2D`

The open eye is a pill (a rounded bar) shaded deeper at the top, with a round
white shine near its top. The closed-eye arc, the spiral, and the heart sit on
the same spot and crossfade by their amounts in the face state, as on the
smiley. The slanted eyelid and a squint's lower lid are clips that cut the pill,
so both work over the dark glass.

Sizes and positions come from the smiley's shape math at the robot's layout
(`ROBOT_FACE_LAYOUT`), so every eye and brow field means the same on both
avatars.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { SmileyPaint                                                           } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import      { browPath, eyeArcPath, eyeGeometry, heartEyeScale                      } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import      { SMILEY_RIBBON_EDGE_W, SMILEY_SPIRAL_STROKE_W                          } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import      { spiralPath, spiralRotationDeg                                         } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import      { SMILEY_EXTRA_SHINE_HEX, SMILEY_EXTRA_SHINE_OPACITY, SMILEY_HEART_PATH } from "@/pages/common/avatar/smiley/render_2d/objectDrawing2D";
import type { FaceState                                                             } from "@/pages/common/avatar/smiley/state/faceState";
import      { ROBOT_FACE_LAYOUT                                                     } from "./robotDrawing2D";

// Shine near the top of an open eye: where it sits and its size, as shares of the eye's half-width and half-height
const ROBOT_EYE_SHINE_X   = -0.2;
const ROBOT_EYE_SHINE_Y   = -0.46;
const ROBOT_EYE_SHINE_R   = 0.38;
const ROBOT_EYE_SHINE_HEX = "#ffffff";


// --------------------------------------------------------------------------------
// Robot Eye (2D)
// --------------------------------------------------------------------------------
// One eye and its brow, in the feature group's coordinates
export default function RobotEye2D({side, face, paint, fill}: {
    side  : number;        // -1 for the left eye, 1 for the right
    face  : FaceState;     // Combined face for this frame
    paint : SmileyPaint;   // Fills from `RobotFace2D` (`feature` is the screen's light)
    fill  : string;        // Open eye's fill (the light, shaded deeper at the top)
}): ReactElement {
    // Eyelid clip ids, unique per eye on the page (React's ids may hold characters `url(#...)` rejects)
    const baseId         = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const lidClipId      = `robot-lid-${baseId}`;
    const lowerLidClipId = `robot-lower-lid-${baseId}`;

    // The open eye fades out as any other eye style fades in, and its shine shrinks with it as it closes
    const eye         = eyeGeometry(side, face, ROBOT_FACE_LAYOUT);
    const openOpacity = (1 - face.eyeArc) * (1 - face.spiral) * (1 - face.heartEyes);
    const shineR      = ROBOT_EYE_SHINE_R * Math.min(eye.rx, eye.ry);

    return (
        <g>
            {/* Tapered eyebrow */}
            {(face.brows > 0) ? (
                <path d={browPath(side, face, ROBOT_FACE_LAYOUT)} fill={paint.feature} stroke={paint.feature} strokeWidth={SMILEY_RIBBON_EDGE_W} strokeLinejoin="round" opacity={face.brows} />
            ) : null}

            <g transform={`translate(${eye.cx} ${eye.cy})`}>
                {/* Open eye, with the eyelid's slant cutting off its top and a squint's lower lid its bottom */}
                <clipPath id={lidClipId}>
                    <rect x={-2 * eye.rx} y={eye.lidEdgeY} width={4 * eye.rx} height={4 * eye.ry} transform={`rotate(${eye.lidDeg} 0 ${eye.lidEdgeY})`} />
                </clipPath>
                <clipPath id={lowerLidClipId}>
                    <rect x={-2 * eye.rx} y={-2 * eye.ry} width={4 * eye.rx} height={eye.lowerLidY + (2 * eye.ry)} />
                </clipPath>
                <g clipPath={`url(#${lowerLidClipId})`}>
                    <g clipPath={`url(#${lidClipId})`} opacity={openOpacity}>
                        <rect x={-eye.rx} y={-eye.ry} width={2 * eye.rx} height={2 * eye.ry} rx={Math.min(eye.rx, eye.ry)} fill={fill} />
                        <circle cx={eye.rx * ROBOT_EYE_SHINE_X} cy={eye.ry * ROBOT_EYE_SHINE_Y} r={shineR} fill={ROBOT_EYE_SHINE_HEX} />
                    </g>
                </g>

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

                {/* Heart with a small shine (sizes are in the heart's own unit size) */}
                {(face.heartEyes > 0) ? (
                    <g transform={`scale(${heartEyeScale(face)})`} opacity={face.heartEyes}>
                        <path d={SMILEY_HEART_PATH} fill={paint.heartEye} />
                        <ellipse cx={-0.42} cy={-0.5} rx={0.2} ry={0.12} transform="rotate(-35 -0.42 -0.5)" fill={SMILEY_EXTRA_SHINE_HEX} opacity={SMILEY_EXTRA_SHINE_OPACITY} />
                    </g>
                ) : null}
            </g>
        </g>
    );
}
