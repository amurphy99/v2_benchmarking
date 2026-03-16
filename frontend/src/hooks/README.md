# Frontend // Hooks <br> `frontend/src/hooks/..`
All hooks used in the project.

TODO: 
* Restructure `live-chat` similar to `chat-listener`
* Can also probably share some utilities...

<br>

# Project Architecture
```diff

 hooks/
 ├── queries/       # For querying the backend API 
 │   └── ...
 │
 ├── style/                  # Dynamic style helpers
 │   ├── useElementHeight.ts # Share height with another element on the page
 │   └── ...
 │
 ├── live-chat/                  # The main chat page for users
 │   ├── useLocalChatSessions.tx # Frontend compatible models for chat objects
 │   └── useChatSocket.ts        # Hook for connecting to backend ChatConsumer
 │   └── ...
 │
 ├── chat-listener/          # The admin chat monitor page 
 │   ├── chat-controls/      # Sending commands to the frontend
 │   ├── ws/                 # General WebSocket management
 │   ├── data_utils/         # Data types & samples
+│   └── useChatListener.ts  # Hook for connecting to backend ChatListenerConsumer
 │
 └── ...

```

<br><hr>
