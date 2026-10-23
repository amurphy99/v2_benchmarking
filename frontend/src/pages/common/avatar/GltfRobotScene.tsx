/* Play QT and Buddy GLB clips for robot actions, then ease back to a neutral pose.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/GltfRobotScene`

Both models only have pre-baked body clips, so every action becomes one clip: an
emotion goes through the model's mood map (`getAnimationFromEmotion`), and an
animation names its clip directly. A clip plays once and holds its last frame
until its hold time is up, then crossfades back to the neutral pose.

The neutral pose is Buddy's own rest pose. QT's rest pose is a T-pose, but
nearly all of its clips start from the same arms-down pose, so QT holds the
first frame of one of them instead (`GLTF_NEUTRAL_POSE_CLIPS`).

Hold time counts from the start of the action and never cuts a clip short. An
emotion holds for `duration_ms` (forever without one); an animation returns as
soon as its clip ends.

*/
import      { useAnimations, useGLTF                 } from "@react-three/drei";
import type { ReactElement, Ref                      } from "react";
import      { useEffect, useImperativeHandle, useRef } from "react";
import type { AnimationAction, Group, Material, Mesh } from "three";
import      { AnimationClip, LoopOnce                } from "three";

// From this project
import      { getAnimationFromEmotion, getZoom      } from "./AvatarUtils";
import        BuddyModel                              from "./BuddyModel";
import        QTModel                                 from "./QTModel";
import type { AvatarHandle, AvatarZoom, RobotAction } from "./avatarRegistry";

// Model file for each robot
const GLTF_MODEL_URLS = {
    qt    : "/models/qtRobot.glb",
    buddy : "/models/buddyRobot.glb",
} as const;

// Robots that have a GLB model
export type GltfRobotModel = keyof typeof GLTF_MODEL_URLS;

// Clip whose first frame is the robot's neutral pose (null keeps the model's own rest pose)
const GLTF_NEUTRAL_POSE_CLIPS: Record<GltfRobotModel, string | null> = {
    qt    : "Hello",
    buddy : null,
};

// Clip playback speed for both robots (above 1 plays faster, below 1 slower)
const GLTF_CLIP_SPEED = 1;

// Crossfade from the clip playing now into the next one
const GLTF_CLIP_CROSSFADE_SEC = 0.3;

// Fade from a finished clip back to the neutral pose
const GLTF_RETURN_FADE_SEC = 0.6;


// ================================================================================
// GLB Robot Scene
// ================================================================================
// Load one robot model and act out robot actions with its clips
export default function GltfRobotScene({model, zoom, ref}: {
    model : GltfRobotModel;      // Which robot's model file to load
    zoom  : AvatarZoom;          // Head or full-body framing
    ref?  : Ref<AvatarHandle>;   // Handle the page drives the avatar through
}): ReactElement {
    // Model file, its clips, and the actions bound to the model's root group
    const { nodes, materials, animations } = useGLTF(GLTF_MODEL_URLS[model]) as unknown as {
        nodes      : Record<string, Mesh>;
        materials  : Record<string, Material>;
        animations : AnimationClip[];
    };
    const group              = useRef<Group>(null);
    const { actions, mixer } = useAnimations(animations, group);
    const zoomInfo           = getZoom(zoom, model);

    // Clip playing now, the held neutral pose (null when the model's rest pose is used), and the return timer
    const currentRef = useRef<AnimationAction | null>(null);
    const neutralRef = useRef<AnimationAction | null>(null);
    const releaseRef = useRef<number | null>(null);

    // --------------------------------------------------------------------------------
    // Neutral Pose
    // --------------------------------------------------------------------------------
    // Freeze the neutral pose's clip on its first frame at full weight
    const holdNeutral = (neutral: AnimationAction): AnimationAction => {
        neutral.reset().play();
        neutral.paused = true;
        return neutral;
    };

    // Hold the neutral pose from the start (a copy of its clip, so playing that clip as an action never collides with it)
    useEffect(() => {
        const clipName = GLTF_NEUTRAL_POSE_CLIPS[model];
        if (clipName === null) return;

        neutralRef.current = holdNeutral(mixer.clipAction(AnimationClip.findByName(animations, clipName).clone()));
        return () => { neutralRef.current?.stop(); neutralRef.current = null; };
    }, [animations, mixer, model]);

    // --------------------------------------------------------------------------------
    // Clip Playback
    // --------------------------------------------------------------------------------
    // Cancel a pending return to the neutral pose
    const clearRelease = (): void => {
        if (releaseRef.current !== null) window.clearTimeout(releaseRef.current);
        releaseRef.current = null;
    };

    // Crossfade the current clip back to the neutral pose (or fade it out to the model's rest pose)
    const release = (): void => {
        clearRelease();
        const current = currentRef.current;
        currentRef.current = null;
        if (current === null) return;

        if (neutralRef.current === null) current.fadeOut(GLTF_RETURN_FADE_SEC);
        else                             holdNeutral(neutralRef.current).crossFadeFrom(current, GLTF_RETURN_FADE_SEC, false);
    };

    // Play one clip, returning after `holdMs` or at the clip's end, whichever is later (null holds)
    const playClip = (clipName: string, holdMs: number | null): void => {
        // An unknown clip name returns to the neutral pose (CLIENT_PROTOCOL.md §3.1)
        const action = actions[clipName];
        if (!action) { release(); return; }

        // Restart the clip once, holding its last frame when it ends
        clearRelease();
        const previous = currentRef.current ?? neutralRef.current;
        action.reset().setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        action.timeScale         = GLTF_CLIP_SPEED;

        // Fade in from the rest pose, or crossfade from the pose showing now (a repeat just restarts)
        if      (previous === null  ) action.fadeIn(GLTF_CLIP_CROSSFADE_SEC);
        else if (previous !== action) action.crossFadeFrom(previous, GLTF_CLIP_CROSSFADE_SEC, false);
        action.play();
        currentRef.current = action;

        // Schedule the return (an emotion without a duration keeps its last frame)
        if (holdMs === null) return;
        const clipMs = (action.getClip().duration * 1_000) / GLTF_CLIP_SPEED;
        releaseRef.current = window.setTimeout(release, Math.max(clipMs, holdMs));
    };

    // --------------------------------------------------------------------------------
    // Avatar Handle
    // --------------------------------------------------------------------------------
    // Emotions go through the model's mood map; animations name their clip directly
    const performAction = (action: RobotAction): void => {
        if      (action.kind === "emotion"  ) playClip(getAnimationFromEmotion(action.value, model), action.duration_ms ?? null);
        else if (action.kind === "animation") playClip(action.value, 0);
    };
    useImperativeHandle(ref, (): AvatarHandle => ({performAction, reset: release}));

    // Drop a pending return when the avatar unmounts
    useEffect(() => clearRelease, []);

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    if (model === "qt") return <QTModel    nodes={nodes} materials={materials} scale={zoomInfo.scale} position={zoomInfo.position} group={group} />;
    return                     <BuddyModel nodes={nodes} materials={materials} scale={zoomInfo.scale} position={zoomInfo.position} group={group} />;
}
