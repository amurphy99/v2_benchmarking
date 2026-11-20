/* How a task chat's intro went, as one stat tile.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/task_details/IntroTile`

The intro opens a Map Task or planning chat (`harnesses/features/intro/` in the
backend): the avatar says what the task is, asks whether the participant has
done one before, and explains how it works to anyone new to it. A snapshot saved
before the intro existed has no record, and a chat without the intro has a null
one.

*/
import type { ReactElement } from "react";

// From this project
import type { IntroRecord } from "@/api";
import      { StatTile    } from "../ui/StatTile";

// What the tile explains on hover
const INTRO_TILE_HELP = "What the participant said when the avatar asked whether they had done one before, and how the intro went";


// --------------------------------------------------------------------------------
// Intro Tile
// --------------------------------------------------------------------------------
// Whether they knew the task, then whether they heard how it works and what they asked
export default function IntroTile({intro}: {
    intro : IntroRecord | null | undefined;  // The saved record (null: the chat had no intro; undefined: saved before it existed)
}): ReactElement {
    if (intro === undefined) return <StatTile label="Intro" value="—" sub="not recorded" />;
    if (intro === null)      return <StatTile label="Intro" value="—" sub="no intro this chat" />;

    // What they said about having done one before, and what followed
    const knew  = (intro.knew_task === null) ? "Didn't say" : (intro.knew_task ? "Done it before" : "New to it");
    const parts = [intro.explained ? "heard how it works" : "skipped how it works"];
    if (intro.questions > 0) parts.push((intro.questions === 1) ? "1 question" : `${intro.questions} questions`);
    if (!intro.finished)     parts.push("never reached the task");
    return <StatTile label="Intro" value={knew} sub={parts.join(" · ")} help={INTRO_TILE_HELP} />;
}
