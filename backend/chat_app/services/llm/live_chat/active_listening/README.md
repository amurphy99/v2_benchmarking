# Active-Listening Response Mode

`active_listening` is an optional response pipeline for standard live chats. It uses a
small structured assessment call before generating the spoken assistant response. The
existing `single_stage` mode remains the default and activity/RAG chats remain on their
specialized response method.

Select the mode once during backend startup:

```text
LIVE_CHAT_RESPONSE_MODE=single_stage
LIVE_CHAT_RESPONSE_MODE=active_listening
```

## Response Flow

```text
finalized user text
    -> assess user intent, emotion, turn state, transcript clarity, and strategy
    -> publish the selected robot mood while the assessment is still current
    -> optionally wait a short grace period for an incomplete automatic turn
    -> generate the concise spoken response
    -> return an immutable ResponseOutcome to the WebSocket coordinator
    -> commit the exchange
    -> apply any dialogue-state or listening-state effect
    -> TTS / frontend playback
```

New STT progress cancels either LLM stage through the existing response task. The staged
text remains available so a retry includes the user's continuation. An explicit
`reply_now` request skips the additional incomplete-turn grace period because the caller
has directly requested a response.

Pause and end-chat decisions are proposed by `ResponseOutcome`; the engine does not
mutate a consumer itself. This prevents a canceled generation attempt from leaving the
chat paused or waiting for an end confirmation that was never delivered.

## End-Chat Confirmation

An initial `end_chat` assessment returns a fixed confirmation question and enters the
`awaiting_end_confirmation` dialogue state only when that exchange commits. The next
user turn goes to the narrow confirmation schema:

- `confirm`: generate a brief closing message and close after delivery.
- `cancel`: generate a short transition back into the recent topic.
- `unclear`: ask again and keep the connection open.

A failed confirmation call is always treated as unclear; model or transport errors must
never close a chat.

## Files

- `response_models.py`: structured stage models, dialogue values, and `ResponseOutcome`.
- `prompts.py`: system prompts and message construction for each stage.
- `active_listening_api.py`: shared structured-generation client and bounded retry logic.
- `response_engine.py`: routing, grace-period behavior, fallbacks, and process-wide engine.

The first-stage assessment is internal context. It is not added to the chat history or
stored as a visible `ChatMessage`.

## Failure Behavior

- Assessment failure falls back to the existing single-stage response generator.
- Spoken-response failure uses a short strategy-specific scripted response.
- End-confirmation failure remains unresolved and keeps the chat open.
- Imports and engine construction do not make LLM requests; requests occur only while an
  active response stage is awaited.
