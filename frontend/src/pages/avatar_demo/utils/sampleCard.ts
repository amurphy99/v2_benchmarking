/* The demo's planning card: the avatar's constraints and a line for each item.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/utils/sampleCard`

The card examples (`planExamples`) look at these spots, and the card section
draws them (`SampleCardPicture`). The content is the dinner party scenario's
avatar side (`backend/.../cooperative_planning/scenarios/dinner_party.json`),
and the spots are where the planning harness looks
(`backend/.../cooperative_planning/behaviors.py`): card coordinates as the
avatar reads its card, 0 to 1 across and down from its top-left corner
(`backend/chat_app/websocket/consumers/HARNESS_PROTOCOL.md` §8.2).

*/
import type { PlanPoint } from "@/hooks/live-chat/avatarPlanFrames";

// One item's line on the avatar's card
export type DemoCardLine = {label: string; at: PlanPoint};

// The middle of the avatar's constraints, at the top (`PLANNING_CARD_CONSTRAINTS`)
export const DEMO_CARD_CONSTRAINTS_AT: PlanPoint = [0.50, 0.22];

// Where the avatar's eyes are aimed while it reads the card over (`thinking_plan`)
export const DEMO_CARD_READ_AT: PlanPoint = [0.50, 0.55];

// The avatar's own constraints (the participant never sees these)
export const DEMO_CARD_CONSTRAINTS = [
    "Your oven is broken.",
    "One of the guests doesn't like spicy food.",
    "You'd like a dessert you can make the day before.",
];

// Each item's line, where its choice is written (`item_spot`: lines from 0.56 to 0.86, written at 0.6 across)
export const DEMO_CARD_LINES = {
    starter : {label: "Starter",     at: [0.60, 0.56]},
    main    : {label: "Main course", at: [0.60, 0.71]},
    dessert : {label: "Dessert",     at: [0.60, 0.86]},
} satisfies Record<string, DemoCardLine>;
