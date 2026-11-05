/* The demo's made-up Map Task map: its landmarks, start, and what it lacks.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/utils/sampleMap`

The Map Task examples (`planExamples`) look at these spots, and the Map Task
section draws them (`SampleMapPicture`). Spots are map coordinates as the avatar
reads its map: 0 to 1 across and down from its top-left corner
(`pages/common/avatar/AVATAR_PLANS.md` §8.2). The map is made up for the demo;
nothing on it comes from the HCRC Map Task corpus.

*/
import type { PlanPoint } from "@/hooks/live-chat/avatarPlanFrames";

// One landmark on the avatar's map
export type DemoLandmark = {name: string; emoji: string; at: PlanPoint};

// Where the avatar is on its map at the start of every example
export const DEMO_MAP_START: PlanPoint = [0.30, 0.66];

// Every landmark on the avatar's map
export const DEMO_MAP_LANDMARKS = {
    bridge : {name: "Bridge", emoji: "🌉", at: [0.14, 0.14]},
    lake   : {name: "Lake",   emoji: "🌊", at: [0.84, 0.16]},
    rock   : {name: "Rock",   emoji: "🪨", at: [0.60, 0.36]},
    bus    : {name: "Bus",    emoji: "🚌", at: [0.74, 0.66]},
    tree   : {name: "Tree",   emoji: "🌳", at: [0.48, 0.88]},
} satisfies Record<string, DemoLandmark>;

// A landmark the user's map has and the avatar's lacks (the task's maps differ like this)
export const DEMO_MAP_MISSING = {name: "Castle", emoji: "🏰"};
