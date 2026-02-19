# Speech System // Consumers <br> `backend/chat_app/websocket/consumers/..`

Define multiple consumer types for handling frontend WebSocket connections.
* `ChatConsumer`: Main chat consumer. User's connect here from web app or robots for a chat. 
* `ChatListener`: For admins to monitor and/or control live chat sessions.



## System Architecture

```
================================================================================
Multi-Consumer WebSocket Architecture (Primary + Listener)
================================================================================

   ┌─────────────────────────────── Browser / UI Clients ───────────────────────────────┐
   │                                                                                    │
   │   Primary Client (chat UI)                          Listener Client (admin UI)     │
   │   - streams audio / text                             - monitors messages + scores  │
   │   - receives assistant responses                     - can send control commands   │
   │                                                                                    │
   │   wss://.../ws/chat/                                wss://.../ws/chat/<sid>/listen/│
   └───────────────┬────────────────────────────────────┬───────────────────────────────┘
                   │                                    │                           
                   │   1: WS connect                    │   1: WS connect           
                   v                                    v                           
        ┌───────────────────────────┐    ┌──────────────────────────────┐           
        │ ChatConsumer (PRIMARY)    │    │ ChatListenerConsumer (LISTEN)│           
        │ - STT/LLM/TTS pipeline    │    │ - no audio/STT/LLM/TTS       │           
        │ - writes messages/scores  │    │ - receives broadcasts        │           
        │ - broadcasts updates      │    │ - sends commands             │           
        └──────────┬────────────────┘    └──────────────┬───────────────┘           
                   │                                    │                           
                   │ group_add(room, channel_name)      │ group_add(room, channel)  
                   │ group_add(control, channel_name)   │ group_add(monitor, chan)  
                   │                                    │                           
                   v                                    v                           
     ┌───────────────────────────────────────────────────────────────────────────────┐
     │                           Channels Layer "Groups"                             │
     │                                                                               │
     │  [1] room_group     = "chat_<sid>"                                            │
     │      - Members:     Primary + Lsteners                                        │
     │      - Data:        Chat events (e.g., user/assistant messages)               │
     │                                                                               │
     │  [2] monitor_group  = "chat_<sid>_mon"                                        │
     │      - Members:     Listeners (admins/monitors)                               │
     │      - Data:        Biomarker events (utterance + audio scores)               │
     │                                                                               │
     │  [3] control_group  = "chat_<sid>_ctl"                                        │
     │      - Members:     Primary ONLY                                              │
     │      - Data:        Commands from listeners (pause_auto, stt_stop, etc.)      │
     └───────────────────────────────────────────────────────────────────────────────┘


================================================================================
Event Flow 
================================================================================

A) Primary -> Everyone (messages)
   Primary ChatConsumer
        │
        │  group_send("chat_<sid>", {"type":"ws.broadcast", "payload": {...}})
        v
   room_group ("chat_<sid>")  ───────────────▶  Listener UI(s)
        │
        └──────────────────────────────▶  Primary UI (idk about this....)

B) Primary -> Listeners only (biomarkers)
   Primary ChatConsumer
        │
        │  group_send("chat_<sid>_mon", {"type":"ws.monitor", "payload": {...}})
        v
   monitor_group ("chat_<sid>_mon") ───────▶  Listener UI(s)

C) Listener -> Primary only (commands)
   Listener ChatListenerConsumer
        │
        │  group_send("chat_<sid>_ctl", {"type":"ws.command", "payload": {"cmd":...}})
        v
   control_group ("chat_<sid>_ctl") ───────▶  Primary ChatConsumer (handles ws_command)


Notes
- Each UI (chat or admin) has its own WebSocket connection and consumer class.
- Groups are per-session (using session_id (<sid>) in the name).
```


