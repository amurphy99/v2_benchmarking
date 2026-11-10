
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

Session Info (sent first; `run_biomarkers` off hides the Biomarkers tab):
```JSON
{ "type": "session_info", "data": { "sessionId": 12, "username": "…", "source": "webapp", "chat_type": "map_task", "condition": "cues", "variant": "demo", "run_biomarkers": false, "…": "…" } }
```

Task View (chat types with one, as the listener joins and after each saved change; the Map Task's
is both maps and the avatar's path, shown in the live chat page's Map tab).
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
        "path"     : [[0.30, 0.66], [0.66, 0.66]]
    }
}
```
