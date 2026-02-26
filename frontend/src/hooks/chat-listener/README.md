
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
