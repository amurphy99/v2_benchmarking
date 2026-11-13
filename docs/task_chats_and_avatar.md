# Speech System // Task Chats and the Avatar <br> `docs/..`

The live chat can run different **chat types** (open conversation, the Map Task,
Cooperative Planning, and others). Each chat type is a **harness** on the backend
that decides how the assistant replies, keeps its own task state, and switches
behavioral **cues** on or off by experimental **condition**. Its **variant**
picks the task content, such as which map or scenario. Task harnesses drive the
participant's on-screen avatar with timed **plans**, show the participant a task
card, and send the admin live chat page a monitor view of the task. The chat page
picks the chat type, condition, and variant. The session stores all three, and the
admin pages show and filter them.

The READMEs below cover each part, in a sensible reading order.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Reading Order                                                                    -->
<!-- -------------------------------------------------------------------------------- -->
## Reading order

| # | Document | What it covers |
|---|---|---|
| 1 | [`notes/`](../notes/) | How code here is written and organized: style, file placement, error handling |
| 2 | [`harnesses/README.md`](../backend/chat_app/websocket/harnesses/README.md) | The overview: chat types, conditions and variants, the harness contract, cues, monitoring, adding a chat type |
| 3 | [`CLIENT_PROTOCOL.md`](../backend/chat_app/websocket/consumers/CLIENT_PROTOCOL.md) | Everything a chat client sends and receives, including how it picks the chat type |
| 4 | [`HARNESS_PROTOCOL.md`](../backend/chat_app/websocket/consumers/HARNESS_PROTOCOL.md) | Avatar setups and plans, timing against the reply audio, feedback, and the `task_card` frame |
| 5 | [`map_task/README.md`](../backend/chat_app/websocket/harnesses/map_task/README.md) | The Map Task: map file format, conditions and cues, what the clients get, the HCRC maps |
| 6 | [`active_listening/README.md`](../backend/chat_app/websocket/harnesses/active_listening/README.md) | The active-listening chat type, the reference harness design |
| 7 | [`avatar/README.md`](../frontend/src/pages/common/avatar/README.md) | How the frontend runs plans, the avatar demo page, a file map, and gotchas |
| 8 | [`avatar/smiley/README.md`](../frontend/src/pages/common/avatar/smiley/README.md) | The Smiley avatar's face, movements, and props, and the Robot avatar drawn from the same face |
| 9 | [`consumers/README.md`](../backend/chat_app/websocket/consumers/README.md) | The shared chat pipeline the harnesses plug into |
| 10 | [`chat-listener/README.md`](../frontend/src/hooks/chat-listener/README.md) | The admin listener socket and its frames, including `task_monitor` |
| 11 | [`FRONTEND_CAPABILITIES.md`](../frontend/src/pages/admin/FRONTEND_CAPABILITIES.md) | The admin action buttons and what each client can do with them |

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Not Documented Yet                                                               -->
<!-- -------------------------------------------------------------------------------- -->
## Not documented yet

- **Cooperative Planning** has no README of its own; it is described only in the
  chat types table in `harnesses/README.md` and in its code
  (`backend/chat_app/websocket/harnesses/cooperative_planning/`).
- **The chat page and the admin pages** have no README. That covers the configure-chat
  modal (`frontend/src/pages/chat/chatModes.ts`), the map panel, the
  live page's Task tab (`frontend/src/pages/admin/components/LiveSidePanel.tsx`),
  the session filters, the Map Task Maps page, and the admin header.
