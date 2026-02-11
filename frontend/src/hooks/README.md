# Frontend // Hooks <br> `frontend/src/hooks/..`
All hooks used in the project.

<br>

# Project Architecture
```diff

 hooks/
 ├── queries/       # For querying the backend API 
 │   └── ...
 │
 ├── style/         # Dynamic style helpers
 │   ├── useElementHeight.ts # Share height with another element on the page
 │   └── ...
 │
 ├── live-chat/     # The main chat page for users 
 │   ├── useLocalChatSessions.tx # Frontend compatible models for chat objects
 │   └── ...
 │
 ├── chat-listener/ # For the admin chat monitor page 
 │   ├── useLocalBiomarkers # Frontend compatible models for biomarkers
 │   └── ...
 │
 └── ...

```

<br><hr>
