# Speech System // LLM Services <br> `backend/chat_app/services/llm/..`

Various LLM wrapper classes as well as utilities.

```diff
llm/
 ├── chat_utilities.py          # Methods for formatting live-chat turns and getting responses
 ├── endpoint.py                # Help handle API keys and query locations
 ├── llama_api.py               # Legacy LLM wrapper for prompt-formatted live chats
 │
+├── live_chat/                 # Wrapper classes for responding during live chats
 │    ├── cognibot_api.py       # Structured generation response class
 │    ├── dummy_LLM.py          # Dummy LLM class for offline testing
 │    └── active_listening/     # Optional assessment-then-response mode for standard chats
 │         ├── response_models.py
 │         ├── prompts.py
 │         ├── active_listening_api.py
 │         ├── response_engine.py
 │         └── README.md
 │
+└── non_chat/                  # Utilities for non-chat LLM calls
     ├── instruct_wrapper.py    # Structure generation wrapper class 
     ├── utils.py               # Misc. utilities
     └── post_chat_analysis.py  # Use the instruct wrapper to generate post-chat analysis 
         ├── chat_summary.py    # Generate a chat summary & get the topics
         ├── chat_sentiment.py  # Get emotion and sentiment labels for a chat
         └── chat_risks.py      # Assess if there were any caregiver-relevant risk signals during a chat
```

Standard chats select `single_stage` or `active_listening` once at backend startup with
`LIVE_CHAT_RESPONSE_MODE`. See `live_chat/active_listening/README.md` for the staged
response flow, cancellation behavior, and fallbacks. Activity/RAG chats keep their own
response method and do not use this setting.
