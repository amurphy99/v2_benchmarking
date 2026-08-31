# Active-Listening Response Mode

Added `active_listening` mode as an optional response method for standard live chats.
It uses a small structured assessment call before generating the spoken assistant
response. The old "default" mode is now referred to as `single_stage` mode and is still
the default option. **This mode is still experimental**, so leaving deployed versions
in `single_stage` mode.

To select the chat mode, change the `.env` file once during backend startup. So either:
```text
LIVE_CHAT_RESPONSE_MODE=single_stage
LIVE_CHAT_RESPONSE_MODE=active_listening
```
> **NOTE:** This is still a work on progress, not ready to be used for real versions yet. 
> See the dropdown below (under "Experimental Status/Notes") for more information.

<!-- -------------------------------------------------------------------------------- -->
## Response Flow
<!-- -------------------------------------------------------------------------------- -->

This is how the `active_listening` response flow works
```text
finalized user text
    STAGE 1 MODEL
    -> assess user intent, emotion, turn state, transcript clarity, and strategy
    -> publish the selected robot mood while the assessment is still current
    -> optionally wait a short grace period for an incomplete automatic turn

    STAGE 2 MODEL
    -> generate the concise spoken response
    -> return an immutable ResponseOutcome to the WebSocket coordinator
    -> commit the exchange
    -> apply any dialogue-state or listening-state effect
    -> TTS / frontend playback
```

New STT progress cancels either LLM stage through the existing response task. Any staged
user speech that was used for the canceled response remains available so retries include
that text + the user's continuation. Explicit `reply_now` command requests skip the
additional incomplete-turn grace period because the caller has directly requested an LLM
response.

**No modifications to the consumer are required by this chat mode.** Pause and end-chat
decisions are proposed by `ResponseOutcome` (object containing a combination of outputs
from both models). This prevents a canceled generation attempt from leaving the chat
paused or waiting for an end-chat confirmation that was never delivered.

<!-- -------------------------------------------------------------------------------- -->
## End-Chat Confirmation
<!-- -------------------------------------------------------------------------------- -->

If the user's message is assessed with the intent to end the chat initial `end_chat`
assessment (`UserIntent` field of the stage 1 model output), instead of responding
with the stage 2 model like usual, it returns a fixed confirmation question (e.g., 
"Are you sure?") and enters the `awaiting_end_confirmation` dialogue state -- only
when that exchange commits (was not canceled by new user speech). The next user is
then routed to a separate response schema which handles confirmation:

- `confirm`: generate a brief closing message and close after delivery.
- `cancel`: generate a short transition back into the recent topic.
- `unclear`: ask again and keep the connection open.

Failed confirmation calls are always treated as `unclear`; model or network errors should
never close a chat.

<!-- -------------------------------------------------------------------------------- -->
## Files
<!-- -------------------------------------------------------------------------------- -->

- `response_models.py`: structured stage models, dialogue values, and `ResponseOutcome`.
- `prompts.py`: system prompts and message construction for each stage.
- `active_listening_api.py`: shared structured-generation client and bounded retry logic.
- `response_engine.py`: routing, grace-period behavior, fallbacks, and process-wide engine.

> **NOTE:** The first-stage assessment is internal context. **It is not added to the chat history.**


<br>
<hr>


<!-- -------------------------------------------------------------------------------- -->
<!-- NOTES ABOUT CURRENT ISSUES, THINGS THAT NEED TO BE TESTED, AND OTHER ISSUES      -->
<!-- -------------------------------------------------------------------------------- -->
<details><summary>Experimental Status/Notes</summary>

<br>

# Experimental Status/Notes

The initial test with the Gemma model had two main problems:

1. Using two model stages back-to-back was a lot slower than the regular `single_stage`
   mode (more than just 2x the runtime; probably because of the complex schemas..?)
2. Plain JSON generation often returned semantically correct fields inside of invalid
   JSON (small stuff like an extra outer pair of braces). Schema validation then had to
   add a bunch of extra retries just to get it right (likely the source of the
   substantial response time increase from `single_stage`).

There was one main immediate thing I wanted to test first, but just haven't had time to yet:

## Model / instructor mode configuration

Before (during the tests I've done so far) the client was configured with `instructor.Mode.JSON`.
I switched it in the current version of the code to `instructor.Mode.JSON_SCHEMA`, and that was
the next planned experiment due to the failures I was getting with the plain `JSON` response
mode. 

The models we use are changing (like we used to use a Llama one, now Gemma), so I think that
might be why there are differences in the JSON response behavior, but not sure (I think it was
something like the correct schema was visible in the Gemma "thinking" output, but the final
response it returned only included one message or the last field or something like that...).

> **NOTE:** Again, I haven't tested it yet with the `JSON_SCHEMA` mode, so I don't know if it
> will work at all yet.

## Other things to test

Suggested follow-up experiments, in order:

1. Test the current Gemma endpoint with `JSON_SCHEMA` and record schema-success rate plus
   end-to-end response latency.
2. Remove the nested retry behavior and allow at most two total attempts per stage.
3. Compare Gemma with model thinking disabled, if the endpoint supports the relevant chat
   template option.
4. Compare a different structured-output-capable model, such as `Qwen3-Coder-Next`.
5. Optionally test `instructor.Mode.TOOLS` if the serving endpoint has the matching tool
   parser and chat template configured. The Instructor mode is named `TOOLS`, not `TOOL_CALLS`.

Automated tests for this mode should use fakes and must not make real LLM requests.

> **NOTE:** There is retry logic in both our local request wrapper and Instructor's internal logic,
> so latency grows pretty fast from that. Part of the next steps needs to be figuring out
> a better way to handle this...

</details>

