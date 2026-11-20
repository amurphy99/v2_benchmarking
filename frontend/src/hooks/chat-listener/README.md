
### Messages from the backend should come in the following forms...

Chat Message History:
```JSON
{
    "type": "message_history",
    "data": [
        { "type": "message", "role": "user", "content": "hi", "ts": "2026-02-10T..." },
        { "type": "message", "role": "assistant", "content": "hello", "ts": "2026-02-10T..." }
    ]
}
```

Biomarker Score History:
```JSON
{
    "type": "biomarker_history",
    "data": [
        ...
    ]
}
```

Live Chat Messages:
```JSON 
{ "type": "message", "role": "user", "content": "…", "ts": "…" }
```

Live Biomarker Scores:
```JSON
{ "type": "biomarker_scores", "data": { "prosody": 0.71, "grammar": 0.42 } }
```

Session Info (sent first; `run_biomarkers` off hides the Biomarkers tab; `debug_mode` marks a
session started in debug mode, whose features may be switched partway through):
```JSON
{ "type": "session_info", "data": { "sessionId": 12, "username": "…", "source": "webapp", "chat_type": "map_task", "condition": "cues", "variant": "demo", "run_biomarkers": false, "debug_mode": false, "…": "…" } }
```

Task View (chat types with one, as the listener joins and after each saved change; the Map Task's
is both maps, the avatar's path, and each saved reply, shown in the live chat page's Map tab).
The path includes every waypoint within a saved move, including bends and loops;
its segment count is not a count of conversation turns:
```JSON
{
    "type": "task_monitor",
    "data": {
        "kind"     : "map_task",
        "giver"    : { "shape": "landscape", "landmarks": [ { "id": "castle", "label": "castle", "icon": "castle", "at": [0.40, 0.16], "radius": 0.04 } ], "route": [[0.30, 0.66], [0.14, 0.22]] },
        "follower" : { "shape": "landscape", "landmarks": [ { "id": "lake", "label": "lake", "icon": "lake", "at": [0.84, 0.16], "radius": 0.07 } ], "start": [0.30, 0.66] },
        "position" : [0.66, 0.66],
        "path"     : [[0.30, 0.66], [0.66, 0.66]],
        "replies"  : [ { "route": "instruction", "act": "acknowledge", "waypoints": 1 } ]
    }
}
```

Reply Timing (how long each reply took, stage by stage: sent when the reply is saved, and again
once the participant's page reports its audio started, which replaces the first; the fields are
in `backend/chat_app/websocket/consumers/CLIENT_PROTOCOL.md` §3.9). The live chat page shows
them in its Timing tab, and the latest delay as a header pill:
```JSON
{ "type": "reply_timing", "data": { "response_id": 4471, "stt_ms": 640, "generate_ms": 1980, "calls": [ { "label": "reply", "at_ms": 3, "ms": 1340 } ], "hold_ms": null, "tts_ms": 420, "delay_ms": 3100, "features": { "backchannels": true, "turn_end": true, "misheard": true } } }
```

The control state in `command_ack` and `control_state` frames also carries `features`: the chat
type's shared features by name, each on or off (`{}` for none). A `set_feature` command switches
one (`{"feature": "backchannels", "on": false}`); the live chat page's Shared Features group sends it.
