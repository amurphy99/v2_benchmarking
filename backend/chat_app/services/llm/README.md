# Speech System // LLM Services <br> `backend/chat_app/services/llm/..`

Various LLM wrapper classes as well as utilities.

```diff
llm/
 ├── chat_utilities.py          # Methods for formatting live-chat turns and getting responses
 ├── dummy_LLM.py               # Dummy LLM class for offline testing
 ├── endpoint.py                # Help handle API keys and query locations
 ├── llama_api.py               # Legacy LLM wrapper for prompt-formatted live chats
 │
+└── non_chat/                  # Utilities for non-chat LLM calls
     ├── instruct_wrapper.py    # Structure generation wrapper class 
     ├── utils.py               # Misc. utilities
     └── post_chat_analysis.py  # Use the instruct wrapper to generate post-chat analysis 
         ├── chat_summary.py    # Generate a chat summary & get the topics
         ├── chat_sentiment.py  # Get emotion and sentiment labels for a chat
         └── chat_risks.py      # Assess if there were any caregiver-relevant risk signals during a chat
```

Each chat type's own LLM code (its prompts, response models, and API clients) lives with
its harness in `websocket/harnesses/` (see that README). `chat_utilities.get_LLM_response`
is the single-stage reply the `unguided` chat type uses, through the client `config.py`
creates: `CognibotAPI` (`websocket/harnesses/unguided/cognibot_api.py`), or `DummyLLM`
when `USE_LLM=false`.
