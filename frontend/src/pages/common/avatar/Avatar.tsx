/* Show the avatar registered under a model choice.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/Avatar`

Pages render `<Avatar model zoom ref />` and drive it through the `AvatarHandle`
contract in `avatarRegistry`. The entry registered under `model` decides which
avatar component that is.

*/
import type { ReactElement, Ref } from "react";

// From this project
import type { AvatarHandle, AvatarZoom } from "./avatarRegistry";
import      { getAvatarEntry           } from "./avatarRegistry";


// ================================================================================
// Avatar
// ================================================================================
// Render the avatar registered under `model` (unknown models show Buddy)
export function Avatar({model, zoom, ref}: {
    model : string;              // `UserSettings.modelChoice`, or any id in `AVATARS`
    zoom  : AvatarZoom;          // Framing the page asks for
    ref?  : Ref<AvatarHandle>;   // Handle the page drives the avatar through
}): ReactElement {
    // Keyed by avatar so a model change unmounts the old one (and its timers and canvas)
    const entry = getAvatarEntry(model);
    return <div key={entry.id} className="h-full w-full">{entry.render({ref, zoom})}</div>;
}
