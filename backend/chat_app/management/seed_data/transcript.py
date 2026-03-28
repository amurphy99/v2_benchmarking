"""
Seed chats from a real, pre-recorded transcript.
--------------------------------------------------------------------------------
`backend.chat_app.management.seed_data.transcript`

Imports a real CSV transcript (with word-level timestamps) and links a WAV audio 
file via Django media. Used for developing the TranscriptPlayback page.

Requires the following files in `seed_data/transcript_data/` before running:
  - transcript.csv         : columns => speaker_id, word, start_time, end_time, confidence, uttID (utterance ID), full_text (full utterance with punctuation)
  - audio.wav              : the corresponding audio recording
  - transcript_config.json : speaker_map, trans_filename, audio_filename, chat_datetime, date_offset_days (only used as a backup)

Transcripts that I have prepared so far:
  - me_test_01  (no biomarkers)

TODO: Maybe find a way to add premade biomarkers as well...

"""
import csv, json as json_lib, shutil, zoneinfo, asyncio

from datetime import timedelta, datetime
from pathlib  import Path

from django.conf  import settings as django_settings
from django.utils import timezone

# From this project
from chat_app.models               import ChatSession, ChatMessage
from chat_app.services.db_services import ChatService

# For the post-chat analysis fields
from chat_app.services.llm.non_chat.post_chat_analysis import post_chat_analysis


# ================================================================================
# Seed a chat from a real transcript
# ================================================================================
def seed_transcript_chat(profile, user, test_dir: str = "test_01"):
    # Load in the transcript and config
    data_dir = Path(__file__).parent / "transcript_data" / test_dir
    config   = json_lib.loads((data_dir / "transcript_config.json").read_text())

    # Speaker map for the speaker_id column in the transcript tells us who is the "user"
    speaker_map = config["speaker_map"]

    # Copy audio file into Django media storage
    audio_src  = data_dir / config["audio_filename"]
    audio_rel  = f"audio/demo/{audio_src.name}"
    audio_dest = Path(django_settings.MEDIA_ROOT) / "audio" / "demo"
    audio_dest.mkdir(parents=True, exist_ok=True)
    shutil.copy2(audio_src, audio_dest / audio_src.name)

    # Parse CSV -- group words by uttID (utterance ID)
    trans_src  = data_dir / config["trans_filename"]
    utterances = {}
    with open(trans_src, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            utterances.setdefault(row["uttID"], []).append(row)
    
    # --------------------------------------------------------------------------------
    # Session time reference (actual datetime value, or some arbitrary # of days)
    # --------------------------------------------------------------------------------
    # Use a real string to get the time (e.g., "March 27, 2026 2:56 PM")
    if "chat_datetime" in config: 
        date_str   = config.get("date_offset_days")                    # Get the datetime string from the config 
        tz         = zoneinfo.ZoneInfo("America/Chicago")              # Always assuming these were from Chicago
        naive_dt   = datetime.strptime(date_str, "%B %d, %Y %I:%M %p") # Parse the string into a "naive" datetime object
        started_at = timezone.make_aware(naive_dt, tz)

    # Arbitrary "days ago" session time if no actual date included
    else:
        offset_days = config.get("date_offset_days", 5)
        started_at  = (timezone.now() - timedelta(days=offset_days)).replace(hour=10, minute=0, second=0, microsecond=0)

    # CSV timestamps are seconds-from-start; anchor them to our datetime
    all_rows = [r for rows in utterances.values() for r in rows]
    duration = max(float(r["end_ts"]) for r in all_rows)
    ended_at = started_at + timedelta(seconds=duration)

    # --------------------------------------------------------------------------------
    # Add the transcript to the DB (session, messages, words)
    # --------------------------------------------------------------------------------
    # Create session (source="transcript" tag allows us to filter for this type of demo data)
    session      = ChatSession.objects.create(profile=profile, source="transcript", is_active=False, end_ts=ended_at, audio_file=audio_rel)
    session.date = started_at
    session.save(update_fields=["date"])

    # Create messages and words (utterances is a list of rows for each uttID)
    messages = []
    for uid, rows in utterances.items():
        rows.sort(key=lambda r: float(r["start_time"]))

        # Parse the row for the necessary fields we need
        # Content tries the "full_text" column with punctuation first; otherwise just joins each word by a space
        role     = speaker_map.get(rows[0]["speaker_id"], "user")
        content  = rows[0].get("full_text", " ".join(r["text"] for r in rows)) 
        first_ts = started_at + timedelta(seconds=float(rows[ 0]["start_time"]))
        last_ts  = started_at + timedelta(seconds=float(rows[-1][  "end_time"]))

        # Create the ChatMessage for this row (looping through utterances here)
        msg    = ChatMessage.objects.create(session=session, role=role, content=content, start_ts=first_ts, end_ts=last_ts)
        msg.ts = first_ts; msg.save(update_fields=["ts"])

        # Create the ChatWords objects based on the individual words
        ChatService.add_words_bulk(msg.id, [
            {"word"       : r["text"],
             "start"      : started_at + timedelta(seconds=float(r["start_time"])),
             "end"        : started_at + timedelta(seconds=float(r[  "end_time"])),
             "confidence" : r.get("confidence", None), }
            for r in rows
        ])

        # Track the messages to use later in the post-chat analysis
        messages.append(msg)

    # --------------------------------------------------------------------------------
    # Fill out post-chat analysis fields
    # --------------------------------------------------------------------------------
    # Run post-chat analysis (same as in close_session)
    analysis = asyncio.run(post_chat_analysis(messages))

    # Save all analysis fields via the same helper used by close_session
    ChatService.save_session_fields(
        user, session, messages,
        summary     = analysis.get("summary",     None),
        sentiment   = analysis.get("sentiment",   None),
        emotion     = analysis.get("emotion",     None),
        topics      = analysis.get("topics",      None),
        risk_level  = analysis.get("risk_rating", None),
        risk_reason = analysis.get("risk_reason", None),
        risk_quotes = [q.strip() for q in analysis.get("risk_quotes", []) if q and q.strip()],
    )
