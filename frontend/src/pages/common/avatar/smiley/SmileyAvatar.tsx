/* Smiley avatar: a code-drawn face that implements the full avatar handle.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyAvatar`

`useFaceController` owns all behavior and `SmileyFace2D` only draws, so a 3D
version only needs a different renderer here.

*/
import type { ReactElement, Ref   } from "react";
import      { useImperativeHandle } from "react";

// From this project
import type { AvatarHandle, AvatarZoom } from "../avatarRegistry";
import        SmileyFace2D               from "./SmileyFace2D";
import      { useFaceController        } from "./useFaceController";


// ================================================================================
// Smiley Avatar
// ================================================================================
// Expose the face controller as the avatar handle and draw its latest face
export default function SmileyAvatar({ref, browsAlways = false}: {
    ref?         : Ref<AvatarHandle>;   // Handle the page drives the avatar through
    zoom         : AvatarZoom;          // Not used (the face always fills its box)
    browsAlways? : boolean;             // Keep the eyebrows showing on every expression
}): ReactElement {
    const {face, handle} = useFaceController(browsAlways);
    useImperativeHandle(ref, (): AvatarHandle => handle, [handle]);

    return (
        <div className="flex h-full w-full items-center justify-center">
            <SmileyFace2D face={face} />
        </div>
    );
}
