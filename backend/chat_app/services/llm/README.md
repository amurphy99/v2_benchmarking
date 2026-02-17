# Speech System // LLM Services <br> `backend/chat_app/services/llm/..`

Various LLM wrapper classes as well as utilities. Utilities should support (1) help coordinating user-system chats and (2) helping use the hosted LLM models for other functions such as chat summaries, etc. 

* `dummy_LLM.py` serves as a wrapper for local development that returns simple string responses. 

```diff

llm/
 ├── chat_utilities.py          # Methods for formatting live-chat turns and getting responses
 ├── dummy_llm.py               # Dummy LLM class for offline testing
 ├── llama_api.py               # LLM wrapper class for live chatting
+└── non_chat/                  # Utilities for non-chat LLM calls
     ├── instruct_wrapper.py    # Structure generation wrapper class
     ├── post_chat_analysis.py  # Use the instruct wrapper to generate post-chat analysis 
     ├── chat_summary.py        # Methods for generating chat summary & topics
     ├── chat_sentiment.py      # Methods for generating chat sentiment & emotion
     └── utils.py               # Misc. utilities
```
