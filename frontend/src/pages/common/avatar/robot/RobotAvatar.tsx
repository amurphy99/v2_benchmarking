/* Robot avatar: the smiley's face controller, drawn as a silver robot.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/RobotAvatar`

`useFaceController` (the smiley's) owns all behavior and `RobotFace2D` only
draws, so the robot takes every action, plan, and page input the smiley does.
It plays the smiley's expressions by name, some of them reshaped for its screen
(`robotExpressions.ts`).

*/
import type { ReactElement, Ref   } from "react";
import      { useImperativeHandle } from "react";

// From this project
import type { AvatarHandle, AvatarZoom } from "@/pages/common/avatar/avatarRegistry";
import      { useFaceController        } from "@/pages/common/avatar/smiley/useFaceController";
import        RobotFace2D                from "./render_2d/RobotFace2D";
import      { ROBOT_FACE_VARIANTS      } from "./robotExpressions";


// ================================================================================
// Robot Avatar
// ================================================================================
// Expose the face controller as the avatar handle and draw its latest face
export default function RobotAvatar({ref}: {
    ref? : Ref<AvatarHandle>;   // Handle the page drives the avatar through
    zoom : AvatarZoom;          // Not used (the robot always fills its box)
}): ReactElement {
    const {face, handle} = useFaceController(false, ROBOT_FACE_VARIANTS);
    useImperativeHandle(ref, (): AvatarHandle => handle, [handle]);

    return (
        <div className="flex h-full w-full items-center justify-center">
            <RobotFace2D face={face} />
        </div>
    );
}
