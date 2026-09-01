"""
Create idempotent fixed chat fixtures with post-chat analysis.
--------------------------------------------------------------------------------
`backend.chat_app.management.seed_data.analyzed`

Creates ChatSessions from the fixed transcripts in examples.json, then runs the
same post_chat_analysis() process as close_session() to fill out the summary,
sentiment, topics, and risk fields. The dedicated `source="analyzed"` value
keeps these fixtures distinguishable from real webapp conversations.

"""
import asyncio, json as json_lib

from django.contrib.auth.base_user import AbstractBaseUser
from django.utils                  import timezone
from datetime                      import timedelta
from pathlib                       import Path
from random                        import random

# From this project
from chat_app.models                                   import ChatBiomarkerScore, ChatMessage, ChatSession, Profile
from chat_app.services.llm.non_chat.post_chat_analysis import post_chat_analysis
from chat_app.services.db_services                     import ChatService

# Constant with list of biomarker names
from .transcript_data.data import BIOMARKERS

ANALYZED_SOURCE = "analyzed"  # Source tag reserved for fixed analyzed chat fixtures


# ================================================================================
# Seed chats with post-chat analysis results
# ================================================================================
def seed_analyzed_chats(profile: Profile, user: AbstractBaseUser) -> int:
    """
    Create the complete fixed fixture set only when this profile has no analyzed
    sessions. This keeps repeated startup commands from duplicating the dataset.
    """
    if ChatSession.objects.filter(profile=profile, source=ANALYZED_SOURCE).exists(): return 0

    # Load the real examples from JSON and pick an arbitrary time
    examples = json_lib.loads((Path(__file__).parent / "transcript_data" / "examples.json").read_text())
    now_utc  = timezone.now()

    for example in examples:
        started_at = (now_utc - timedelta(days=example["date_offset_days"])).replace(hour=10, minute=0, second=0, microsecond=0)
        ended_at   =  started_at + timedelta(minutes=8)

        # 1) Create a ChatSession
        session      = ChatSession.objects.create(profile=profile, source=ANALYZED_SOURCE, is_active=False, end_ts=ended_at)
        session.date = started_at
        session.save(update_fields=["date"])

        # 2) Messages from transcript
        messages = []
        for idx, msg in enumerate(example["messages"]):
            ts = started_at + timedelta(seconds=30 * idx)
            m  = ChatMessage.objects.create(session=session, role=msg["role"], content=msg["content"], start_ts=ts, end_ts=ts + timedelta(seconds=30))
            m.ts = ts; m.save(update_fields=["ts"])
            messages.append(m)

        # 3) Dummy biomarkers
        for j in range(3):
            ts = started_at + timedelta(seconds=40 * j + 20)
            for score_type in BIOMARKERS:
                s    = ChatBiomarkerScore.objects.create(session=session, score_type=score_type, score=round(random(), 3))
                s.ts = ts; s.save(update_fields=["ts"])

        # 4) Run post-chat analysis (same as in close_session)
        analysis = asyncio.run(post_chat_analysis(messages))

        # 5) Save all analysis fields via the same helper used by close_session
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

    return len(examples)
