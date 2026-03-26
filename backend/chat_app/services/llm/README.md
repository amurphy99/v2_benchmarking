# Speech System // LLM Services <br> `backend/chat_app/services/llm/..`

Various LLM wrapper classes as well as utilities.

```diff
llm/
 ├── chat_utilities.py          # Methods for formatting live-chat turns and getting responses
 ├── endpoint.py                # Help handle API keys and query locations
 │
+├── live_chat/                 # Wrapper classes for responding during live chats
 │    ├── cognibot_api.py       # Structured generation response class
 │    ├── llama_api.py          # LLM wrapper class for live chatting
 │    └── dummy_LLM.py          # Dummy LLM class for offline testing
 │
+└── non_chat/                  # Utilities for non-chat LLM calls
     ├── instruct_wrapper.py    # Structure generation wrapper class 
     ├── utils.py               # Misc. utilities
     └── post_chat_analysis.py  # Use the instruct wrapper to generate post-chat analysis 
         ├── chat_summary.py    # Generate a chat summary & get the topics
         ├── chat_sentiment.py  # Get emotion and sentiment labels for a chat
         └── chat_risks.py      # Assess if there were any caregiver-relevant risk signals during a chat
```
