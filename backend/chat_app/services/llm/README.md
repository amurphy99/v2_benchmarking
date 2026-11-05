# Speech System // LLM Services <br> `backend/chat_app/services/llm/..`

Various LLM wrapper classes as well as utilities.

```diff
llm/
 ├── chat_utilities.py          # Methods for formatting live-chat turns and getting responses
 ├── dummy_LLM.py               # Dummy LLM class for offline testing
 ├── endpoint.py                # Help handle API keys and query locations
 ├── llama_api.py               # Legacy LLM wrapper for prompt-formatted live chats
 ├── structured_api.py          # Retrying structured-output client the chat types' LLM calls share
 │
+└── non_chat/                  # Utilities for non-chat LLM calls
     ├── instruct_wrapper.py    # Structure generation wrapper class 
     ├── utils.py               # Misc. utilities
     └── post_chat_analysis.py  # Use the instruct wrapper to generate post-chat analysis 
         ├── chat_summary.py    # Generate a chat summary & get the topics
         ├── chat_sentiment.py  # Get emotion and sentiment labels for a chat
         └── chat_risks.py      # Assess if there were any caregiver-relevant risk signals during a chat
```

Most chat types' own LLM code (their prompts, response models, and API clients) lives with
their harnesses in `websocket/harnesses/` (see that README). The activity's
planner and responder live in `websocket/agents/`, with orchestration and state
validation in `websocket/harnesses/activity/`. `chat_utilities.get_LLM_response`
is the single-stage reply the `unguided` chat type uses, through the client `config.py`
creates: `CognibotAPI` (`websocket/harnesses/unguided/cognibot_api.py`), or `DummyLLM`
when `USE_LLM=false`.

`structured_api.StructuredAPI` sends one instructor request (JSON_SCHEMA mode) and retries it
a set number of times before raising its subclass's own error type. A request can also ask the
endpoint to skip the model's thinking (`thinking=False`). The `active_listening` and `map_task`
API clients subclass it.

The activity agent classes each own an editable prompt and accept an injected
client/model. They currently use the existing Instructor and plain clients from
`config.py`, with six- and twelve-second outer request deadlines respectively.
Those deadlines and token limits are provisional testing settings. These agents
do not currently subclass `StructuredAPI`; they retain the existing client's
Instructor mode. The pipeline awaits the planner's structured result before
calling the responder. `PlannerMemory` describes the session working memory in
`ResponsePlan.updated_memory`; accepted turns store it under `planner_memory`.
