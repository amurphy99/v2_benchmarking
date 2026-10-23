/* Canvas, camera, and light around one of the GLB robot avatars (QT or Buddy).
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/GltfRobotAvatar`

The scene inside (`GltfRobotScene`) loads the model and plays its clips; this
wrapper only sets up the three.js view and passes the avatar handle through.

*/
import      { PerspectiveCamera } from "@react-three/drei";
import      { Canvas            } from "@react-three/fiber";
import type { ReactElement, Ref } from "react";

// From this project
import type { GltfRobotModel           } from "./GltfRobotScene";
import        GltfRobotScene             from "./GltfRobotScene";
import type { AvatarHandle, AvatarZoom } from "./avatarRegistry";


// ================================================================================
// GLB Robot Avatar
// ================================================================================
// Draw one robot model in its own canvas
export default function GltfRobotAvatar({model, zoom, ref}: {
    model : GltfRobotModel;      // Which robot's model file to load
    zoom  : AvatarZoom;          // Head or full-body framing
    ref?  : Ref<AvatarHandle>;   // Handed to the scene, which implements it
}): ReactElement {
    return (
        <Canvas>
            <PerspectiveCamera makeDefault position={[0,  0, 10]} fov={50} />
            <directionalLight              position={[0, 10, 10]} intensity={5} />
            <GltfRobotScene model={model} zoom={zoom} ref={ref} />
        </Canvas>
    );
}
