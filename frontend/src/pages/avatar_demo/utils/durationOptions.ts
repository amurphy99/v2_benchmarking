/* Hold-time choices the avatar demo page sends with each action.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/utils/durationOptions`

*/
// Hold time a live chat uses when an action has none (backend `DEFAULT_ACTION_DURATION_MS`,
// `backend/chat_app/websocket/consumers/utils/groups.py`)
export const DEMO_DEFAULT_DURATION_MS = 3_000;

// One hold-time choice (null sends no duration, so the avatar holds an emotion)
export type DurationOption = {label: string; ms: number | null};

// Choices in picker order
export const DEMO_DURATION_OPTIONS: DurationOption[] = [
    {label: "Hold",                 ms: null                    },
    {label: "1s",                   ms: 1_000                   },
    {label: "3s (backend default)", ms: DEMO_DEFAULT_DURATION_MS},
    {label: "5s",                   ms: 5_000                   },
    {label: "10s",                  ms: 10_000                  },
];
