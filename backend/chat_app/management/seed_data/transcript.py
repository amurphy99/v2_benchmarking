"""
Seed chats from a real, pre-recorded transcript.
--------------------------------------------------------------------------------
`backend.chat_app.management.seed_data.transcript`

Imports a real CSV transcript (with word-level timestamps), links a WAV audio
file via Django media, and loads pre-computed biomarker scores from one CSV
per biomarker type. Used for the TranscriptPlayback demo.

Required files in `seed_data/transcript_data/test_transcripts/<test_dir>/`:
  - transcript.csv         : speaker_id, word, start_time, end_time, confidence, uttID (utterance ID), full_text (full utterance with punctuation)
  - audio.wav              : the corresponding audio recording
  - transcript_config.json : speaker_map, trans_filename, audio_filename, chat_datetime, date_offset_days (only used as a backup)

Optional (one per biomarker type, auto-discovered):
  - biomarker_<type>.csv   : start_time, end_time, score

"""
import csv, json as json_lib, shutil, zoneinfo, asyncio, logging
logger = logging.getLogger(__name__)

from datetime import timedelta, datetime
from pathlib  import Path

from django.conf  import settings as django_settings
from django.utils import timezone

# From this project
from chat_app.models               import ChatSession, ChatMessage, ChatBiomarkerScore
from chat_app.services.db_services import ChatService
from ...services.logging_utils     import RESET, SEED_DATA, SD_H, SD_R

# For the post-chat analysis fields
from chat_app.services.llm.non_chat.post_chat_analysis import post_chat_analysis

# Valid biomarker keys (matches ChatBiomarkerScore.BIOMARKER_CHOICES)
VALID_BIOMARKER_TYPES = {k for k, _ in ChatBiomarkerScore.BIOMARKER_CHOICES}


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
    # Load in the transcript and config
    data_dir = Path(__file__).parent / "transcript_data" / "test_transcripts" / test_dir
    config   = json_lib.loads((data_dir / "transcript_config.json").read_text())

    # Speaker map for the speaker_id column in the transcript tells us who is the "user"
    speaker_map = config["speaker_map"]

    # --------------------------------------------------------------------------------
    # Copy audio file into Django media storage 
    # --------------------------------------------------------------------------------
    # (`recordings/` gives the admin/owner-only access protection like live recordings)
    audio_src  = data_dir / config["audio_filename"]
    audio_rel  = f"recordings/{audio_src.name}"
    audio_dest = Path(django_settings.MEDIA_ROOT) / "recordings"
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
        date_str   = config.get("chat_datetime")                       # Get the datetime string from the config
        tz         = zoneinfo.ZoneInfo("America/Chicago")              # Always assuming these were from Chicago
        naive_dt   = datetime.strptime(date_str, "%B %d, %Y %I:%M %p") # Parse the string into a "naive" datetime object
        started_at = timezone.make_aware(naive_dt, tz)

    # Arbitrary "days ago" session time if no actual date included
    else:
        offset_days = config.get("date_offset_days", 5)
        started_at  = (timezone.now() - timedelta(days=offset_days)).replace(hour=10, minute=0, second=0, microsecond=0)

    # CSV timestamps are seconds-from-start; anchor them to our datetime
    all_rows = [r for rows in utterances.values() for r in rows]
    duration = max(float(r["end_time"]) for r in all_rows)
    ended_at = started_at + timedelta(seconds=duration)

    # --------------------------------------------------------------------------------
    # Add the transcript to the DB (session, messages, words)
    # --------------------------------------------------------------------------------
    # Create session (source="transcript" tag allows us to filter for this type of demo data).
    # `audio_start_ts` is the wall-clock anchor the frontend uses to calculate audio
    # file offsets; for seeded data it equals the session start.
    session = ChatSession.objects.create(
        profile        = profile,
        source         = "transcript",
        is_active      = False,
        end_ts         = ended_at,
        audio_file     = audio_rel,
        audio_start_ts = started_at,
    )
    session.date = started_at
    session.save(update_fields=["date"])

    # Create messages and words (utterances is a list of rows for each uttID)
    messages = []
    for uid, rows in utterances.items():
        rows.sort(key=lambda r: float(r["start_time"]))

        # Parse the row for the necessary fields we need
        # Content tries the "full_text" column with punctuation first; otherwise just joins each word by a space
        role     = speaker_map.get(rows[0]["speaker_id"], "user")
        content  = rows[0].get("full_text", " ".join(r["word"] for r in rows))
        first_ts = started_at + timedelta(seconds=float(rows[ 0]["start_time"]))
        last_ts  = started_at + timedelta(seconds=float(rows[-1][  "end_time"]))

        # Create the ChatMessage for this row (looping through utterances here)
        msg    = ChatMessage.objects.create(session=session, role=role, content=content, start_ts=first_ts, end_ts=last_ts)
        msg.ts = first_ts; msg.save(update_fields=["ts"])
        messages.append(msg)  # Track the messages to use later in the post-chat analysis

        # Create the ChatWords objects based on the individual words
        ChatService.add_words_bulk(msg.id, [
            {"word"       : r["word"],
             "start"      : started_at + timedelta(seconds=float(r["start_time"])),
             "end"        : started_at + timedelta(seconds=float(r[  "end_time"])),
             "confidence" : r.get("confidence", None), }
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

