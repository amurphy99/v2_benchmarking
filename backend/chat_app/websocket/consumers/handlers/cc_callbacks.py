"""
Define a set of "callbacks" for the consumer to help manage the chat.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.cc_callbacks`

These methods get implemented by the consumers via simple passthroughs.

TODO: Need to add timestamps to the audio bytes we have so that we know what 
      time point the biomarkers are for and can map those to utterances.

TODO: Room here to alter the audio biomarker calculations if I decide to change
      it so that they are only calculated when we know the user was speaking.

"""
import logging, time, base64
logger = logging.getLogger(__name__)

# Django / Channels 
from channels.db                import database_sync_to_async as db_s2a

# From this project
from ....services import logging_utils as lu 
from ....services.logging_utils import RESET, BOLD, UNBOLD, CC_MAIN, CC_H, CC_R

# Handling messages
from ....services.db_services       import ChatService
from  ...services.chatHelpers       import ChatHandler
from  ...services.bg_helpers        import fire_and_log
from  ...services.audioHelpers      import extract_audio_biomarkers, extract_text_biomarkers

# Config
SECOND_BYTES   = 32_000  # How big a chunk of audio of one second is, in bytes (2 * sample_rate ?)
AUDIO_WINDOW_S = 10      # Seconds of audio needed for audio-based biomarkers


# --------------------------------------------------------------------------------
# Handle "User" & "Robot" messages (saves to DB & broadcasts)
# --------------------------------------------------------------------------------
async def handle_chat_messages(consumer, role, text, ts):
    """ 
    Add messages to the database & update the local context (role must be "user" or "assistant").

    TODO: Concatenate consecutive messages from the user

    TODO: I feel like we shouldn't limit the buffer here, we should do it in the other areas of 
          the chat (e.g. preparing LLM input, biomarker calculations).
    """
    # Fire-and-forget DB write for the message
    fire_and_log(db_s2a(ChatService.add_message)(consumer.session, role, text), name="handle_chat_messages::add_message")

    # Update in memory context (pop one if we are at the limit)
    consumer.context_buffer.append((role, text, ts))
    if len(consumer.context_buffer) > consumer.MAX_CONTEXT: consumer.context_buffer.pop(0)

    # Log update
    logger.info((
        f"{CC_MAIN} New {lu.BRIGHT_GREEN}{role}{lu.GREEN} message processed "
        f"({lu.BRIGHT_GREEN}context size: {len(consumer.context_buffer)}/{consumer.MAX_CONTENT}{lu.GREEN}). {RESET}"
    ))

    # Broadcast updates to any listeners
    await consumer._broadcast_room({"type": "message", "role": role, "text": text, "ts": ts})

    # Return the updated context (if the message was from the user, this will be used for LLM input)
    return consumer.context_buffer

# --------------------------------------------------------------------------------
# Handle "streamed" audio data from the frontend client
# --------------------------------------------------------------------------------
async def handle_audio_data(consumer, data):
    """ 
    Forward streamed audio data from the client to backend STT & get audio-based
    biomarker scores. 
    """
    # Forward audio to the speech to text provider
    consumer.stt_provider.send_audio(data)

    # Generate audio-based biomarkers
    consumer.audio_buffer.extend(base64.b64decode(data["data"]))
    await on_audio_biomarkers(consumer, sample_rate=data.get("sampleRate", 16_000))

    # Update turntaking (12 audio windows for 1 minute of data) 
    # TODO: Should probably just get rid of this... 
    consumer.audio_windows_count += 1
    consumer.overlapped_speech_count = consumer.overlapped_speech_count / (consumer.audio_windows_count / 12)



# --------------------------------------------------------------------------------
# [TEXT-BASED] Handle on-utterance biomarkers (saves to DB & broadcasts)
# --------------------------------------------------------------------------------
async def on_utterance_biomarkers(consumer):
    """
    Because this uses the entire `context_buffer`, it MUST only be called AFTER
    `add_message_CB` has already updated the buffer.

    TODO: Because altered_grammar specifically is so slow, they will actually go 
          to the db out of order. Need to add a manual time setting argument.
    """
    # Get text-based biomarkers 
    text_biomarkers = await extract_text_biomarkers(consumer.context_buffer)

    # Save biomarkers scores to the DB & broadcast them to any listeners
    fire_and_log(db_s2a(ChatService.add_biomarkers_bulk)(consumer.session, text_biomarkers), name="on_utt_bio::add_biomarkers_bulk")
    await consumer._broadcast_monitor({"type": "biomarker_scores", "data": text_biomarkers})

# --------------------------------------------------------------------------------
# [AUDIO-BASED] Handle on-audio biomarkers (saves to DB & broadcasts)
# --------------------------------------------------------------------------------
async def on_audio_biomarkers(consumer, *, sample_rate=16_000):
    """
    TODO: Should use a given sample rate to calculate the size of the window...
          Which I think would be 2 * sample_rate. Not 100% sure though.
          Different sources could have different sample rates from the mic, and
          we need to make sure we have the right duration for the models to work.
    """
    # Guard for the proper audio duration before pulling 
    window_bytes = AUDIO_WINDOW_S * SECOND_BYTES # Bytes of audio data needed for the biomarker
    if len(consumer.audio_buffer) < (window_bytes): return
    
    # Pop the segment of audio from the buffer
    audio_segment = bytes(consumer.audio_buffer[:window_bytes])
    del consumer.audio_buffer[:window_bytes]

    # Get audio-based biomarkers
    # TODO: Add the timestamp from the START of the window
    audio_data = {"data": bytes(consumer.audio_buffer[:window_bytes]), "sampleRate": sample_rate}
    audio_biomarkers = await extract_audio_biomarkers(audio_data, consumer.overlapped_speech_count)

    # Save biomarkers scores to the DB & broadcast them to any listeners
    fire_and_log(db_s2a(ChatService.add_biomarkers_bulk)(consumer.session, audio_biomarkers), name="handle_audio_data::add_biomarkers_bulk")
    await consumer._broadcast_monitor({"type": "biomarker_scores", "data": audio_biomarkers})

