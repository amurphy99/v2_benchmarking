/* Draw one frame of the robot avatar: a silver head with a face on its screen.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/render_2d/RobotFace2D`

A pure renderer for the same `FaceState` the smiley draws, so every expression,
movement, animation, and plan works on the robot unchanged. It holds no timers
or behavior. From back to front it draws the head (`RobotShell2D`), the screen
set into it (`RobotGlass2D`), the looks that cover both (`RobotOverlays2D`:
fearful shading, frost, icicles), and then the face on the glass, in light.
The eyes are `RobotEye2D`, and the mouth is the smiley's own `SmileyMouth2D` at
the robot's sizes and colors. Everything on the glass shares one soft glow, and
dims with the face's `glow`.

The robot's colors for the frame come from `robotColors`, which also tints them
with an emotion's color.

The face's objects (hearts, then hands in front of the features) and the held
prop are the smiley's parts, with silver hands. The prop is held by the body, so
it sits outside the head's group and is clipped to the frame. A soft shadow
sits on the ground under the head, as under the smiley.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { FaceObject, HandObject, HeartObject                } from "@/pages/common/avatar/smiley/objects/faceObjects";
import        SmileyHand2D                                         from "@/pages/common/avatar/smiley/render_2d/SmileyHand2D";
import        SmileyHeart2D                                        from "@/pages/common/avatar/smiley/render_2d/SmileyHeart2D";
import        SmileyMap2D                                          from "@/pages/common/avatar/smiley/render_2d/SmileyMap2D";
import        SmileyMouth2D                                        from "@/pages/common/avatar/smiley/render_2d/SmileyMouth2D";
import type { SmileyPaint, Sprite                                } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import      { SMILEY_FACE_R, tearSprite, zzzSprites              } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import      { mixRgb, rgbString, verticalGradient                } from "@/pages/common/avatar/smiley/render_2d/gradients2D";
import      { SMILEY_EXTRA_SHINE_HEX, SMILEY_EXTRA_SHINE_OPACITY } from "@/pages/common/avatar/smiley/render_2d/objectDrawing2D";
import      { SMILEY_TEAR_PATH                                   } from "@/pages/common/avatar/smiley/render_2d/objectDrawing2D";
import type { FaceState                                          } from "@/pages/common/avatar/smiley/state/faceState";
import        RobotEye2D                                           from "./RobotEye2D";
import        RobotGlass2D                                         from "./RobotGlass2D";
import        RobotOverlays2D                                      from "./RobotOverlays2D";
import        RobotShell2D                                         from "./RobotShell2D";
import      { robotColors                                        } from "./robotColors";
import      { ROBOT_CHEEK_X, ROBOT_CHEEK_Y, ROBOT_FACE_LAYOUT    } from "./robotDrawing2D";
import      { ROBOT_TURN_SHIFT_X, ROBOT_TURN_SHIFT_Y             } from "./robotDrawing2D";
import      { screenBox, screenCenter                            } from "./robotDrawing2D";

// Frame around the head, in face units
const ROBOT_VIEW_HALF_W = 144;    // Beside the head, for its ear pads, sways, and the hearts
const ROBOT_VIEW_TOP    = -155;   // Above it, for the antennas, bounces, and the Zs
const ROBOT_VIEW_BOTTOM = 132;    // Below it, for its shadow, icicles, and a hand on the chin (a put-away prop waits just under it)

// The face on the screen: its brightness with no glow, and the softness of the glow around everything on the glass
const ROBOT_SCREEN_DIM = 0.35;
const ROBOT_GLOW_BLUR  = 2.8;

// Open eyes: the light's color, deeper at the top and paler at the bottom
const ROBOT_EYE_TOP_RGB    = [16, 56, 110] as const;
const ROBOT_EYE_TOP_MIX    = 0.38;
const ROBOT_EYE_BOTTOM_MIX = 0.3;    // Toward white

// Inside an open mouth: the light's color, mostly see-through
const ROBOT_MOUTH_FILL_OPACITY = 0.2;

// Cheek lights (always on a little, brighter with `blush`)
const ROBOT_CHEEK_RX    = 9;
const ROBOT_CHEEK_RY    = 5.5;
const ROBOT_CHEEK_HEX   = "#ff7d9c";
const ROBOT_CHEEK_REST  = 0.3;     // Opacity with no blush
const ROBOT_CHEEK_BLUSH = 0.65;    // Opacity a full blush adds

// Extra colors, light at the top to deep at the bottom
const ROBOT_TONGUE_HEXES = ["#ff9db4", "#f2607f"] as const;
const ROBOT_HEART_HEXES  = ["#ff9db0", "#ee2f4d"] as const;   // Floating hearts and heart eyes
const ROBOT_TEAR_HEXES   = ["#d8f2ff", "#3b97e6"] as const;
const ROBOT_ICE_HEXES    = ["#ffffff", "#9fd7f6"] as const;   // Icicles, base to tip
const ROBOT_ZZZ_PALE_MIX = 0.45;                              // How far the top of each Z mixes from the light toward white

// The tear starts this far lower than on the smiley, under the robot's lower eye
const ROBOT_TEAR_DROP = 18;

// Top edge of a raised prop: just under the eyes at their lowest look at it
const ROBOT_MAP_RAISED_TOP = 30;

// Ground shadow (lift is how far the head is above its resting height, in face radii)
const ROBOT_SHADOW_Y           = 116;    // Shadow center, below the resting head
const ROBOT_SHADOW_RX          = 84;     // Shadow half-width and half-height with the head at rest
const ROBOT_SHADOW_RY          = 10;
const ROBOT_SHADOW_LIFT_SHRINK = 1.2;    // Shadow size lost per face radius of lift
const ROBOT_SHADOW_LIFT_FADE   = 1.5;    // Shadow opacity lost per face radius of lift
const ROBOT_SHADOW_HEX         = "#000000";
const ROBOT_SHADOW_OPACITY     = 0.28;   // Shadow opacity at its center (it fades to clear at the edge)


// ================================================================================
// Robot Face (2D)
// ================================================================================
// Render one face state as an SVG robot that fills its box
export default function RobotFace2D({face}: {
    face : FaceState;   // Combined face for this frame (from `useFaceController`)
}): ReactElement {
    // Paint ids, unique per avatar on the page (React's ids may hold characters `url(#...)` rejects)
    const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const id     = (name: string): string => `robot-${name}-${baseId}`;
    const url    = (name: string): string => `url(#${id(name)})`;

    // --------------------------------------------------------------------------------
    // Colors
    // --------------------------------------------------------------------------------
    // The robot's own colors this frame, tinted by any emotion's color
    const colors = robotColors(face);
    const light  = rgbString(colors.light);

    // Fills handed to the smiley's parts (the mouth, hands, hearts, and held prop)
    const paint: SmileyPaint = {
        feature  : light,
        mouth    : url("mouth"),
        tongue   : url("tongue"),
        hand     : [rgbString(colors.shell.top), rgbString(colors.shell.base), rgbString(colors.shell.edge)],
        skinEdge : rgbString(colors.shell.deep),
        heart    : url("heart"),
        heartEye : url("heart"),
        ice      : url("ice"),
        tear     : url("tear"),
        zzz      : url("zzz"),
        blush    : ROBOT_CHEEK_HEX,
    };

    // --------------------------------------------------------------------------------
    // Layout
    // --------------------------------------------------------------------------------
    // Frame around the head (the held prop is clipped to it)
    const view    = {x: -ROBOT_VIEW_HALF_W, y: ROBOT_VIEW_TOP, width: 2 * ROBOT_VIEW_HALF_W, height: ROBOT_VIEW_BOTTOM - ROBOT_VIEW_TOP};
    const viewBox = `${view.x} ${view.y} ${view.width} ${view.height}`;

    // Shadow follows the head's size, and shrinks and fades as the head lifts off the ground
    const lift          = Math.max(0, -face.offsetY);
    const shadowSpread  = face.scale * Math.max(0, 1 - (lift * ROBOT_SHADOW_LIFT_SHRINK));
    const shadowOpacity = Math.max(0, 1 - (lift * ROBOT_SHADOW_LIFT_FADE));

    // The features slide with the head turn, further than the screen under them
    const slide              = `translate(${face.turnX * ROBOT_TURN_SHIFT_X} ${face.turnY * ROBOT_TURN_SHIFT_Y})`;
    const [screenX, screenY] = screenCenter(face);

    // Where the tear is in its drip, and the cheek lights' brightness
    const tear  = tearSprite(face);
    const cheek = ROBOT_CHEEK_REST + (ROBOT_CHEEK_BLUSH * face.blush);

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <svg className="no-transition h-full w-full" viewBox={viewBox} role="img" aria-label="Robot avatar">
            {/* -------------------------------------------------------------------------------- */}
            {/* Gradients, Glow, and Clips */}
            {/* -------------------------------------------------------------------------------- */}
            <defs>
                {/* Features and extras */}
                {verticalGradient(id("eye"),    [rgbString(mixRgb(colors.light, [...ROBOT_EYE_TOP_RGB], ROBOT_EYE_TOP_MIX)), rgbString(mixRgb(colors.light, [255, 255, 255], ROBOT_EYE_BOTTOM_MIX))])}
                {verticalGradient(id("zzz"),    [rgbString(mixRgb(colors.light, [255, 255, 255], ROBOT_ZZZ_PALE_MIX)), light])}
                {verticalGradient(id("tongue"), ROBOT_TONGUE_HEXES)}
                {verticalGradient(id("heart"),  ROBOT_HEART_HEXES )}
                {verticalGradient(id("tear"),   ROBOT_TEAR_HEXES  )}
                {verticalGradient(id("ice"),    ROBOT_ICE_HEXES   )}
                <linearGradient id={id("mouth")}>
                    <stop offset="0%" stopColor={light} stopOpacity={ROBOT_MOUTH_FILL_OPACITY} />
                </linearGradient>

                {/* One soft glow around everything drawn on the screen */}
                <filter id={id("glow")} x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation={ROBOT_GLOW_BLUR} result="blur" />
                    <feMerge>
                        <feMergeNode in="blur"          />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                {/* The ground shadow */}
                <radialGradient id={id("shadow")}>
                    <stop offset="0%"   stopColor={ROBOT_SHADOW_HEX} stopOpacity={ROBOT_SHADOW_OPACITY} />
                    <stop offset="100%" stopColor={ROBOT_SHADOW_HEX} stopOpacity={0}                    />
                </radialGradient>

                {/* The glass (the face on it never spills onto the bezel), and the frame */}
                <clipPath id={id("screen")}>
                    <rect {...screenBox(0)} transform={`translate(${screenX} ${screenY})`} />
                </clipPath>
                <clipPath id={id("view")}>
                    <rect x={view.x} y={view.y} width={view.width} height={view.height} />
                </clipPath>
            </defs>

            {/* -------------------------------------------------------------------------------- */}
            {/* Ground Shadow */}
            {/* -------------------------------------------------------------------------------- */}
            {/* Outside the head group, so it never tilts or lifts with the head */}
            <ellipse
                cx      = {face.offsetX * SMILEY_FACE_R}
                cy      = {ROBOT_SHADOW_Y}
                rx      = {ROBOT_SHADOW_RX * shadowSpread}
                ry      = {ROBOT_SHADOW_RY * shadowSpread}
                fill    = {url("shadow")}
                opacity = {shadowOpacity}
            />

            <g transform={`translate(${face.offsetX * SMILEY_FACE_R} ${face.offsetY * SMILEY_FACE_R}) rotate(${face.tilt}) scale(${face.scale})`}>
                {/* -------------------------------------------------------------------------------- */}
                {/* Head, Screen, and the Looks That Cover Them */}
                {/* -------------------------------------------------------------------------------- */}
                <RobotShell2D    face={face} shades={colors.shell} lightRgb={colors.light} />
                <RobotGlass2D    face={face} light={light} bezel={paint.skinEdge} lip={rgbString(colors.shell.edge)} />
                <RobotOverlays2D face={face} ice={paint.ice} />

                {/* -------------------------------------------------------------------------------- */}
                {/* Features (drawn in light on the glass; they slide with the head turn) */}
                {/* -------------------------------------------------------------------------------- */}
                <g clipPath={url("screen")}>
                    <g filter={url("glow")} opacity={ROBOT_SCREEN_DIM + ((1 - ROBOT_SCREEN_DIM) * face.glow)}>
                        <g transform={slide}>
                            {/* Cheek lights */}
                            <ellipse cx={-ROBOT_CHEEK_X} cy={ROBOT_CHEEK_Y} rx={ROBOT_CHEEK_RX} ry={ROBOT_CHEEK_RY} fill={paint.blush} opacity={cheek} />
                            <ellipse cx={ ROBOT_CHEEK_X} cy={ROBOT_CHEEK_Y} rx={ROBOT_CHEEK_RX} ry={ROBOT_CHEEK_RY} fill={paint.blush} opacity={cheek} />

                            {/* Eyes and mouth */}
                            <RobotEye2D    side={-1} face={face} paint={paint} fill={url("eye")}          />
                            <RobotEye2D    side={ 1} face={face} paint={paint} fill={url("eye")}          />
                            <SmileyMouth2D           face={face} paint={paint} layout={ROBOT_FACE_LAYOUT} />

                            {/* Tear running down the glass under the right eye */}
                            {(face.tear > 0) ? (
                                <g transform={`translate(${tear.x} ${tear.y + ROBOT_TEAR_DROP}) scale(${tear.size})`} opacity={tear.opacity}>
                                    <path d={SMILEY_TEAR_PATH} fill={paint.tear} />
                                    <ellipse cx={-0.35} cy={-0.15} rx={0.2} ry={0.38} fill={SMILEY_EXTRA_SHINE_HEX} opacity={SMILEY_EXTRA_SHINE_OPACITY} />
                                </g>
                            ) : null}
                        </g>
                    </g>
                </g>

                {/* -------------------------------------------------------------------------------- */}
                {/* Zs and Objects (in front of the head; they slide with the features) */}
                {/* -------------------------------------------------------------------------------- */}
                <g transform={slide}>
                    {/* Sleep Zs rising beside the head */}
                    {(face.zzz > 0) ? zzzSprites(face).map((z: Sprite, i: number) => (
                        <text key={i} x={z.x} y={z.y} fontSize={z.size} fontWeight={800} fontFamily="ui-rounded, system-ui, sans-serif" fill={paint.zzz} opacity={z.opacity}>z</text>
                    )) : null}

                    {/* Hearts, then the hands in front of everything (a hand's key holds its shape while two crossfade) */}
                    {face.objects.filter(isHeart).map((heart: HeartObject) => <SmileyHeart2D key={heart.key}                   heart={heart} timeSec={face.timeSec} paint={paint} />)}
                    {face.objects.filter(isHand ).map((hand : HandObject ) => <SmileyHand2D  key={`${hand.key}-${hand.shape}`} hand={hand}                          paint={paint} />)}
                </g>
            </g>

            {/* -------------------------------------------------------------------------------- */}
            {/* Held Prop (the map or the card) */}
            {/* -------------------------------------------------------------------------------- */}
            {/* Held by the body: in front of the head but outside its group, so the head tilts and turns behind it */}
            {(face.map > 0) ? (
                <g clipPath={url("view")}>
                    <SmileyMap2D face={face} paint={paint} raisedTop={ROBOT_MAP_RAISED_TOP} />
                </g>
            ) : null}
        </svg>
    );
}


// --------------------------------------------------------------------------------
// Object Helpers
// --------------------------------------------------------------------------------
// Whether an object is a floating heart, or a hand
function isHeart(object: FaceObject): object is HeartObject { return object.kind === "heart"; }
function isHand (object: FaceObject): object is HandObject  { return object.kind === "hand";  }
