"""
Seed chats from a real, pre-recorded transcript.
--------------------------------------------------------------------------------
`backend.chat_app.management.seed_data.transcript`

Imports a real CSV transcript (with word-level timestamps), links a WAV audio
file via Django media, and loads pre-computed biomarker scores from one CSV
per biomarker type. Used for the TranscriptPlayback demo.

Required files in `seed_data/transcript_data/test_transcripts/<test_dir>/`:
  - transcript_config.json : speaker_map, trans_filename, audio_filename, chat_datetime, date_offset_days (only used as a backup)
  - audio.wav              : the corresponding audio recording
  - transcript.csv         : speaker_id, word, start_time, end_time, confidence, uttID (utterance ID), full_text (full utterance with punctuation)

Optional (one per biomarker type, auto-discovered):
  - biomarker_<type>.csv   : start_time, end_time, score

NOTE: For `transcript.csv` only `speaker_id`, `word`, and `uttID` are strictly
required. `start_time`, `end_time`, `confidence`, and `full_text` may be missing
on individual rows -- missing word timestamps are interpolated, and `full_text` 
falls back to the joined words.  

"""
import csv, hashlib, json as json_lib, shutil, tempfile, wave, zoneinfo, asyncio, logging
logger = logging.getLogger(__name__)

from collections import OrderedDict
from datetime    import timedelta, datetime
from pathlib     import Path

from django.conf  import settings
from django.utils import timezone

# From this project
from chat_app.models                         import ChatSession, SessionAudio, ChatMessage, ChatBiomarkerScore
from chat_app.services.db_services           import ChatService
from chat_app.services.session_audio_storage import build_recording_object_key, store_recording
from ...services.logging_utils               import RESET, SEED_DATA, SD_H, SD_R
from .csv_processing                         import to_float, fill_utterance_bounds, interpolate_word_times

# For the post-chat analysis fields
from chat_app.services.llm.non_chat.post_chat_analysis import post_chat_analysis

# Valid biomarker keys (matches ChatBiomarkerScore.BIOMARKER_CHOICES)
VALID_BIOMARKER_TYPES = {k for k, _ in ChatBiomarkerScore.BIOMARKER_CHOICES}


# Hash a potentially large seeded WAV without loading the whole recording into RAM
def _file_sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as recording:
        for block in iter(lambda: recording.read(1_048_576), b""):
            digest.update(block)
    return digest.hexdigest()


# ================================================================================
# Load pre-calculated biomarker scores from biomarker_<type>.csv files
# ================================================================================
def _process_biomarker_csvs(data_dir: Path, session: ChatSession, started_at: datetime):
    """
    Finds every `biomarker_<type>.csv` in `data_dir`, validates the type against 
    the model's choices, parse the rows (start_time, end_time, score), and 
    bulk-create ChatBiomarkerScore rows anchored at `started_at`.
    """
    # Look for CSV files at the specified location
    csv_paths = sorted(data_dir.glob("biomarker_*.csv"))
    if not csv_paths:
        logger.info(f"{SEED_DATA} No biomarker_*.csv files found in {SD_H}{data_dir}{SD_R}; skipping biomarkers.{RESET}")
        return

    # Process each separate file
    for csv_path in csv_paths:
        # Filename stem -> biomarker type (e.g. "biomarker_anomia.csv" -> "anomia")
        score_type = csv_path.stem.removeprefix("biomarker_").lower()
        if score_type not in VALID_BIOMARKER_TYPES:
            logger.warning(f"{SEED_DATA} Unknown biomarker type {SD_H}{score_type}{SD_R} from {SD_H}{csv_path.name}{SD_R}; skipping.{RESET}")
            continue

        spans = []
        with open(csv_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                # Load values from the csv
                start_sec = float(row["start_time"])
                end_sec   = float(row[  "end_time"])
                score     = float(row[     "score"])
     
                # Add to the list
                spans.append({
                    "score_type" : score_type,
                    "score"      : score,
                    "start_ts"   : started_at + timedelta(seconds=start_sec),
                    "end_ts"     : started_at + timedelta(seconds=  end_sec),
                })

        # All of the seeded biomarker spans are related via time windows, not message IDs (so `message_id=None`)
        # NOTE: I think ALL future biomarkers will be setup this way; that old field is just legacy for now
        ChatService.add_biomarker_spans_bulk(session.id, None, spans)
        logger.info(f"{SEED_DATA} Loaded {SD_H}{len(spans)}{SD_R} {SD_H}{score_type}{SD_R} biomarker scores from {SD_H}{csv_path.name}{SD_R}.{RESET}")


# ================================================================================
# Seed a chat from a real transcript
# ================================================================================
def seed_transcript_chat(profile, user, test_dir: str = "test_01"):
    """
    
    """
    # Load in the transcript and config
    data_dir = Path(__file__).parent / "transcript_data" / "test_transcripts" / test_dir
    config   = json_lib.loads((data_dir / "transcript_config.json").read_text())

    # Speaker map for the speaker_id column in the transcript tells us who is the "user"
    speaker_map = config["speaker_map"]

    # --------------------------------------------------------------------------------
    # Locate the source WAV; persistence happens after the ChatSession has an ID
    # --------------------------------------------------------------------------------
    audio_src = data_dir / config["audio_filename"]

    # --------------------------------------------------------------------------------
    # Parse CSV -- group words by uttID (utterance ID); also preserves CSV order
    # --------------------------------------------------------------------------------
    trans_src  = data_dir / config["trans_filename"]
    utterances = OrderedDict()
    with open(trans_src, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            utterances.setdefault(row["uttID"], []).append(row)

    # --------------------------------------------------------------------------------
    # Handle missing word timestamps 
    # --------------------------------------------------------------------------------
    # Build per-utterance 'metadata' with raw bounds from any rows that have timestamps
    utt_metas = []
    for uid, rows in utterances.items():
        starts = [to_float(r.get("start_time")) for r in rows]
        ends   = [to_float(r.get(  "end_time")) for r in rows]
        starts = [s for s in starts if s is not None]
        ends   = [e for e in ends   if e is not None]
        utt_metas.append({
            "uid"   : uid,
            "rows"  : rows,
            "start" : min(starts) if starts else None,
            "end"   : max(ends  ) if ends   else None,
        })

    # Fill any missing utterance bounds (forward/backward neighbors, then estimate)
    fill_utterance_bounds(utt_metas)

    # Interpolate any missing word-level timestamps within each utterance
    for meta in utt_metas:
        interpolate_word_times(meta["rows"], meta["start"], meta["end"])

    # --------------------------------------------------------------------------------
    # Session time reference (actual datetime value, or some arbitrary # of days)
    # --------------------------------------------------------------------------------
    # Use a real string to get the time (e.g., "March 27, 2026 2:56 PM")
    if "chat_datetime" in config:
        date_str   = config.get("chat_datetime")                       # Get the datetime string from the config
        tz         = zoneinfo.ZoneInfo("America/Chicago")              # Always assuming these were from Chicago
        naive_dt   = datetime.strptime(date_str, "%B %d, %Y %I:%M %p") # Parse the string into a "naive" datetime object
        started_at = timezone.make_aware(naive_dt, tz)

    # Arbitrary "days ago" session time if no actual date included
    else:
        offset_days = config.get("date_offset_days", 5)
        started_at  = (timezone.now() - timedelta(days=offset_days)).replace(hour=10, minute=0, second=0, microsecond=0)

    # Session duration = max utterance end (after filling missing timestamps)
    duration = max(meta["end"] for meta in utt_metas)

    # CSV timestamps are seconds-from-start; anchor them to our datetime
    ended_at = started_at + timedelta(seconds=duration)

    # --------------------------------------------------------------------------------
    # Add the transcript to the DB (session, messages, words)
    # --------------------------------------------------------------------------------
    # Create session (source="transcript" tag allows us to filter for this type of demo data).
    session = ChatSession.objects.create(
        profile   = profile,
        source    = "transcript",
        is_active = False,
        end_ts    = ended_at,
    )
    session.date = started_at
    session.save(update_fields=["date"])

    # Store the source WAV through the same local/GCS adapter used by live recordings
    with wave.open(str(audio_src), "rb") as recording:
        sample_rate      = recording.getframerate()
        channels         = recording.getnchannels()
        bits_per_sample  = recording.getsampwidth() * 8
        duration_seconds = recording.getnframes() / sample_rate
    checksum   = _file_sha256(audio_src)
    object_key = build_recording_object_key(session.id)

    temp_root = Path(settings.SESSION_AUDIO_TEMP_ROOT)
    temp_root.mkdir(parents=True, exist_ok=True)
    temp_file = tempfile.NamedTemporaryFile(
        prefix = f"seed_session_{session.id}_",
        suffix = ".wav",
        dir    = temp_root,
        delete = False,
    )
    temp_path = Path(temp_file.name)
    temp_file.close()
    shutil.copy2(audio_src, temp_path)
    storage_backend = store_recording(temp_path, object_key)

    SessionAudio.objects.create(
        session          = session,
        storage_backend  = storage_backend,
        object_key       = object_key,
        started_at       = started_at,
        sample_rate      = sample_rate,
        channels         = channels,
        bits_per_sample  = bits_per_sample,
        duration_seconds = duration_seconds,
        size_bytes       = audio_src.stat().st_size,
        sha256           = checksum,
    )

    # Create messages and words (utt_metas is in CSV order; each meta carries its rows)
    messages = []
    for meta in utt_metas:
        rows = meta["rows"]
        rows.sort(key=lambda r: r["_start_sec"])

        # Parse the row for the necessary fields we need
        # Try to get the "full_text" column with punctuation first; otherwise join each word by a space
        role     = speaker_map.get(rows[0]["speaker_id"], "user")
        content  = rows[0].get("full_text", " ".join(r["word"] for r in rows))
        first_ts = started_at + timedelta(seconds=meta["start"])
        last_ts  = started_at + timedelta(seconds=meta["end"  ])

        # Create the ChatMessage for this row (looping through utterances here)
        msg    = ChatMessage.objects.create(session=session, role=role, content=content, start_ts=first_ts, end_ts=last_ts)
        msg.ts = first_ts; msg.save(update_fields=["ts"])
        messages.append(msg)  # Track the messages to use later in the post-chat analysis

        # Create the ChatWords objects based on the individual words
        # (`_start_sec` & `_end_sec` get filled by '_interpolate_word_times' so every
        # row now has non-None values, even if the original CSV cell was empty)
        ChatService.add_words_bulk(msg.id, [
            {"word"       : r["word"],
             "start"      : started_at + timedelta(seconds=r["_start_sec"]),
             "end"        : started_at + timedelta(seconds=r[  "_end_sec"]),
             "confidence" : to_float(r.get("confidence")), }
            for r in rows
        ])

    # --------------------------------------------------------------------------------
    # Load in pre-calculated biomarker scores from biomarker_<type>.csv files
    # --------------------------------------------------------------------------------
    _process_biomarker_csvs(data_dir, session, started_at)

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

