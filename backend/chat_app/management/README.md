# Speech System // Data Seeding <br> `backend/chat_app/management/..`

On startup, Django runs `close_stale_sessions` and then `seed_demo`. The first command marks sessions orphaned by the earlier backend process inactive. The seed command safely ensures configured accounts and three optional categories of demo data exist:

|     | Path           | Source tag    | Used for                                                                  |
|-----|----------------|---------------|---------------------------------------------------------------------------|
| 1   | **transcript** | `transcript`  | A real, pre-recorded chat with audio + word-level timestamps + biomarker scores. Used as the **demo/reference data** for workshops and the Transcript Playback page. |
| 2   | sample         | `demo`        | Random sentences inserted as chats to fill the user-facing UI. Hidden from admin views. |
| 3   | analyzed       | `analyzed`    | Fixed text-only transcripts with post-chat analysis fields filled out. Copied from real test conversations. |

This README focuses on the **transcript** path, since that's the one we actually have to add source data files for. The other two run entirely from tracked data in the repo by default.

<br>

## How to Run

The seed command runs automatically when the backend container starts (via the entrypoint script), and is also runnable manually:

```sh
python manage.py seed_demo
```

Three values in `backend/.env` control which optional fixture datasets are ensured:
```text
SEED_UI_SAMPLE_DATA       = true   # creates missing random UI chats/reminders/RAG fixtures
SEED_ANALYZED_CHAT_DATA   = true   # creates the fixed analyzed chats when absent
SEED_TRANSCRIPT_CHAT_DATA = true   # creates each missing transcript/audio fixture
```

These are create-if-missing settings, not replacement switches. They are safe to leave enabled across restarts: existing profiles, chats, reminders, and recording objects are preserved. Set one to `false` when that environment should not contain the corresponding fixture dataset at all.

`seed_demo` does not provide an automatic deletion or replacement mode. During disposable development, deliberately reset the database if the entire fixture set needs to be rebuilt. Once real data matters, make any fixture replacement a separate, explicitly reviewed maintenance operation.

<br>

## Persistence and Reset Rules

| Data category | What startup may create or refresh | What startup never resets |
|---------------|------------------------------------|---------------------------|
| Primary and secondary admins | Missing Django users, configured names/permissions/passwords, and workshop caregiver access | Accounts, profiles they own or can access, chats, settings, and recordings |
| Workshop demo login | Missing user/account/profile and individually missing transcript fixtures | Existing webapp chats, transcript chats, and recording objects |
| Buddy robot login | Missing user/account/profile and configured credentials | Every chat, setting, and recording linked to Buddy |
| Random UI fixture owners | Missing user/account/profile, complete random-chat set when absent, and individually missing reminders/RAG rows | Existing sessions and later edits to reminders/RAG instructions |
| Analyzed fixture owner | Missing user/account/profile and complete analyzed-chat set when absent | Real `source="webapp"` chats and existing `source="analyzed"` fixtures |

The only automatic startup state transition outside this table is `close_stale_sessions`: it marks `is_active=True` sessions from the previous backend process inactive because their WebSockets no longer exist. It does not delete those sessions or their messages/audio.

To deliberately rebuild everything while the database is still disposable, use the separately reviewed database-reset workflow. Do not add deletion back to `seed_demo`; a fixture flag is intentionally incapable of deleting production data.

<br>

## Code File Layout

```diff

backend/chat_app/management/
 ├── README.md                       # This file
 ├── __init__.py
 │
 ├── commands/
 │   ├── __init__.py
+│   └── seed_demo.py                # The "python manage.py seed_demo" entrypoint
 │
 └── seed_data/
     ├── __init__.py
     │
+    ├── transcript.py               # Loads a real chat (CSV transcript + WAV + biomarker CSVs)
+    ├── analyzed.py                 # Loads fixed text transcripts and runs post-chat analysis
+    ├── sample.py                   # Random demo data (chats, reminders, images, RAG, activities)
     │
     └── transcript_data/
         ├── data.py                 # Constants (USERNAMES, BIOMARKERS, DEMO_MESSAGES, DEMO_IMAGES, etc.)
         ├── examples.json           # Fixed text transcripts consumed by analyzed.py
         │
         └── test_transcripts/
+            └── test_01/            # One folder per pre-recorded chat (see "Reference Data" below)

```

<details closed> <summary> What each file does: </summary>

| File | Responsibility |
|------|----------------|
| `commands/close_stale_sessions.py` | Startup recovery command. Marks sessions from the previous backend process inactive without mixing that behavior into data seeding. |
| `commands/seed_demo.py` | Non-destructive Django management command. Ensures persistent environment accounts, fixture owners, and any enabled create-if-missing datasets. |
| `seed_data/transcript.py` | Reads a folder under `test_transcripts/`, creates one `ChatSession` with messages/words/biomarkers, and persists its WAV through the configured local or GCS recording store. |
| `seed_data/analyzed.py` | Reads `examples.json`, creates one `ChatSession` per entry with messages, dummy biomarker scores, and runs `post_chat_analysis()` to fill summary / sentiment / risk fields. |
| `seed_data/sample.py` | Exports `seed_chats`, `seed_images`, `seed_reminders`, `seed_activities`, `seed_rag_instructions`. Random demo data populated from constants in `data.py`. |
| `seed_data/transcript_data/data.py` | Shared constants. `BIOMARKERS`, `USERNAMES`, `DEMO_MESSAGES`, `DEMO_IMAGES`, `DEMO_RAG_*`. |
| `seed_data/transcript_data/examples.json` | Source data for the `analyzed.py` path. Array of `{date_offset_days, messages: [{role, content}, ...]}`. |

</details>

<br>

## Reference Data — Transcript Folder Layout

Each pre-recorded chat lives in its own folder under `seed_data/transcript_data/test_transcripts/`. The seed command auto-discovers files by name within the folder.

```diff

seed_data/transcript_data/test_transcripts/
 └── test_01/                          # <- name of the folder is passed to seed_transcript_chat()
+    ├── transcript_config.json        # Session metadata      (REQUIRED)
+    ├── me_test_01.csv                # Word-level transcript (REQUIRED)
+    ├── me_test_01.wav                # Audio recording       (REQUIRED)
     │
+    ├── biomarker_prosody.csv         # Pre-generated biomarker scores (OPTIONAL, one per type)
+    ├── biomarker_alteredgrammar.csv
+    ├── biomarker_<type>.csv          # ... and any other valid biomarker type
     │
     └── (any extra files in the folder are ignored)

```


### `transcript_config.json` 

<details closed> <summary> Details </summary>

Metadata for the session. Filenames must match the actual files in the folder.
```json
{
  "speaker_map"      : { "Guest-1": "user", "Guest-2": "assistant" },
  "trans_filename"   : "me_test_01.csv",
  "audio_filename"   : "me_test_01.wav",
  "chat_datetime"    : "March 27, 2026 2:56 PM",
  "date_offset_days" : 5,
  "post_chat_analysis": {
    "summary"     : "Summary of the conversation...",
    "topics"      : ["Family", "Gardening"],
    "sentiment"   : "Positive",
    "emotion"     : "Joy",
    "risk_rating" : 1,
    "risk_quotes" : [],
    "risk_reason" : "No concerning statements were identified."
  }
}
```
- `speaker_map` - maps each `speaker_id` value in the transcript CSV to `"user"` or `"assistant"`.
- `chat_datetime` - wall-clock time the chat occurred. Used as the session date and the `SessionAudio.started_at` playback anchor.
- `date_offset_days` - fallback if `chat_datetime` is omitted; places the chat that many days before today.
- `post_chat_analysis` - optional saved output from the post-chat analysis workflow.
  When supplied, all seven fields are required and seeding skips the post-chat LLM
  calls. When omitted, seeding runs the analysis normally so a new transcript can
  still be loaded before its result is copied into the config.

<hr>
</details>



### `<transcript>.csv` (word-level transcript)

<details closed> <summary> Details </summary>

One row per word. Columns:
```
speaker_id, word, start_time, end_time, confidence, uttID, full_text
```
- `start_time` / `end_time` — seconds from the start of the audio.
- `uttID` — utterance ID. Words sharing the same `uttID` are grouped into one `ChatMessage`.
- `full_text` — the full utterance with punctuation (used as `ChatMessage.content`). If absent, the words are joined with spaces.

**Required columns:** `speaker_id`, `word`, `uttID`. Every row must have these.

**Optional columns:** `start_time`, `end_time`, `confidence`, `full_text`. Missing
values are tolerated row-by-row:
- Missing word `start_time` / `end_time` are interpolated evenly between any
  surrounding words that DO have timestamps (utterance start / end are used as
  virtual anchors). If an entire utterance is untimed, it borrows its bounds
  from the previous / next utterance's timestamps.
- Missing `confidence` is stored as `NULL`.
- Missing `full_text` falls back to joining the row's `word` values with spaces.

Word-level click-to-seek still works for interpolated words — the seek time
is approximate, but the audio playback continues correctly from there.

<hr>
</details>



### `<audio>.wav`

<details closed> <summary> Details </summary>

The actual recording. Copied into Django media storage at `media/recordings/<filename>` and protected by the same admin/owner JWT check used for live recordings (see [`backend/media_view.py`](../../backend/media_view.py)).

<hr>
</details>



### `biomarker_<type>.csv` (optional, one per biomarker type)

<details closed> <summary> Details </summary>

Pre-generated biomarker scores from your offline analysis. Auto-discovered - drop in as many `biomarker_*.csv` files as you want.

**Filename convention** — the `<type>` part of the filename must be one of the valid biomarker keys defined in [`chat_app/models.py`](../models.py) `ChatBiomarkerScore.BIOMARKER_CHOICES`:

| Filename                       | `score_type` recorded |
|--------------------------------|----------------------|
| `biomarker_alteredgrammar.csv` | `alteredgrammar`     |
| `biomarker_anomia.csv`         | `anomia`             |
| `biomarker_pragmatic.csv`      | `pragmatic`          |
| `biomarker_pronunciation.csv`  | `pronunciation`      |
| `biomarker_prosody.csv`        | `prosody`            |
| `biomarker_turntaking.csv`     | `turntaking`         |
| `biomarker_perplexity.csv`     | `perplexity`         |

Unknown types are skipped with a warning in the logs.

**Columns:**
```
start_time, end_time, score
```
- `start_time` / `end_time` — seconds from the start of the audio (same time axis as the transcript CSV).
- `score` — float in `[0.0, 1.0]`, where **0.0 = worst (most severe)** and **1.0 = best (least severe)**.

Example:
```csv
start_time,end_time,score
0.50,1.80,0.42
3.20,4.10,0.71
8.10,9.50,0.18
```

<hr>
</details>



<br>

## Environment Variables

The seed command provisions four persistent, environment-controlled users from `.env` (in [`backend/.env`](../../.env)):

```
ADMIN_USERNAME_0=...   # primary staff admin; can view all transcripts including the demo
ADMIN_PASSWORD_0=...

ADMIN_USERNAME_1=...   # secondary staff admin with the same workshop access
ADMIN_PASSWORD_1=...

DEMO_USERNAME_0=...    # owns the seeded transcript chat (workshop participant)
DEMO_PASSWORD_0=...

BUDDY_USERNAME=...     # owns an independent profile without seeded chat data
BUDDY_PASSWORD=...
```

The seeded transcript chat is attached to the **DEMO_USERNAME_0** user's profile. Both configured admin users get `Access` to that profile through caregiver links. The Buddy user gets a separate patient profile and no seeded chat sessions. Re-running `seed_demo` can refresh the configured identity fields and environment-managed passwords, but it never deletes data linked to any of these accounts.

The hardcoded `demo_patient` / `demo_caregiver` and `sample_user` / `sample_care` pairs own repository fixture data. Their fixture passwords are only assigned when the users are first created. Seeding does not reset their profiles or any conversations they later accumulate.

Audio file access (see [`backend/media_view.py`](../../backend/media_view.py)) is restricted to:
- Admins (`is_staff = True`), or
- The user who owns the `ChatSession`, or
- A caregiver linked to that profile through `Access`.

Any other authenticated user requesting `/media/recordings/<file>.wav?token=...` gets a `403`.

<br>

## What Happens Under the Hood

When the backend container starts, the management commands execute the following steps in order:

1. **`close_stale_sessions`** — marks any `is_active=True` sessions left by the earlier backend process inactive. A restarted process cannot retain the WebSockets that owned them.

2. **Reference images** — `seed_demo` uses `update_or_create()` for only the known fixture topics. Unrelated `AlbumImage` rows are untouched.

3. **`setup_environment_accounts()`** —
    - Creates or refreshes the two admins, workshop demo user, and Buddy user from `.env` without deleting linked records.
    - Links both admins to the workshop profile and gives Buddy a separate empty profile.
    - If `SEED_TRANSCRIPT_CHAT_DATA`, calls `seed_transcript_chat()` for every configured source folder. Each importer hashes its WAV and skips that individual fixture when the same recording is already attached to the workshop profile.
    - `seed_transcript_chat` in turn:
      1. Reads `transcript_config.json` and parses the CSV into utterances grouped by `uttID`.
      2. Persists the audio through the configured local/GCS recording store.
      3. Creates the `ChatSession` and a separate `SessionAudio` metadata row for the copied WAV.
      4. Creates one `ChatMessage` per utterance + bulk-inserts `ChatWord` rows (word-level timestamps).
      5. Auto-discovers `biomarker_*.csv` files, parses each, and bulk-inserts `ChatBiomarkerScore` rows anchored at `started_at`.
      6. Loads `post_chat_analysis` from `transcript_config.json` when present;
         otherwise runs `post_chat_analysis()` normally. It then saves the summary,
         sentiment, topics, and risk fields through the standard session helper.

4. **`setup_ui_sample_data()`** — ensures `demo_patient` + `demo_caregiver` and their profile. If `SEED_UI_SAMPLE_DATA`, it creates random `source="demo"` chats only when none exist, adds individually missing named reminders, ensures the shared activity, and creates missing RAG instructions without overwriting later edits.

5. **`setup_analyzed_data()`** — ensures `sample_user` + `sample_care` and their profile. If `SEED_ANALYZED_CHAT_DATA`, it creates the complete `source="analyzed"` fixture set only when that set is absent. Real `source="webapp"` sessions are never selected or deleted.

No user, Account, Profile, Access, ChatSession, SessionAudio, recording object, or unrelated image is deleted by this workflow.

<br>

## Adding a New Pre-recorded Chat

1. Create a new folder under `seed_data/transcript_data/test_transcripts/` (e.g. `test_02/`).
2. Drop in the four required files (config JSON, transcript CSV, audio WAV) and any `biomarker_<type>.csv` files you have.
3. In [`commands/seed_demo.py`](commands/seed_demo.py), add the folder name to `TRANSCRIPT_FIXTURE_DIRS`. `seed_transcript_chat` receives each folder through its `test_dir` argument.
4. Set `SEED_TRANSCRIPT_CHAT_DATA=true` in `backend/.env` and restart the backend. It is safe to leave enabled: previously imported recordings are recognized by checksum and skipped.
