# Speech System // Data Seeding <br> `backend/chat_app/management/..`

On startup, Django runs the `seed_demo` management command to set up the database with three different categories of demo data:

|     | Path           | Source tag    | Used for                                                                  |
|-----|----------------|---------------|---------------------------------------------------------------------------|
| 1   | **transcript** | `transcript`  | A real, pre-recorded chat with audio + word-level timestamps + biomarker scores. Used as the **demo/reference data** for workshops and the Transcript Playback page. |
| 2   | sample         | `demo`        | Random sentences inserted as chats to fill the user-facing UI. Hidden from admin views. |
| 3   | analyzed       | `webapp`      | Fixed text-only transcripts with post-chat analysis fields filled out. Copied from real test conversations. |

This README focuses on the **transcript** path, since that's the one we actually have to add source data files for. The other two run entirely from tracked data in the repo by default.

<br>

## How to Run

The seed command runs automatically when the backend container starts (via the entrypoint script), and is also runnable manually:

```sh
python manage.py seed_demo
```

Three values in `backend/.env` control which paths re-seed on each run:
```text
REMAKE_SAMPLE_DATA     = true   # wipes & recreates the random sample chats
REMAKE_ANALYZED_DATA   = true   # wipes & recreates the analyzed text transcripts
REMAKE_TRANSCRIPT_DATA = true   # wipes & recreates the demo transcript + audio + biomarkers
```

Set a flag back to `false` once you have the data you want and don't need it regenerated on every restart.

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
| `commands/seed_demo.py` | Django management command. Sets up users (`set_environment_users`, `setup_dummy_chats`, `setup_analyzed_data`), calls into the three `seed_data/` modules based on the REMAKE flags. |
| `seed_data/transcript.py` | Reads a folder under `test_transcripts/` and creates one `ChatSession` with attached `ChatMessage`s, `ChatWord`s, `ChatBiomarkerScore`s, and a copy of the audio file under `media/recordings/`. |
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

The seed command provisions four environment-controlled users from `.env` (in [`backend/.env`](../../.env)):

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

The seeded transcript chat is attached to the **DEMO_USERNAME_0** user's profile. Both configured admin users get `Access` to that profile through caregiver links. The Buddy user gets a separate patient profile and no seeded chat sessions.

Audio file access (see [`backend/media_view.py`](../../backend/media_view.py)) is restricted to:
- Admins (`is_staff = True`), or
- The user who owns the `ChatSession` the audio file belongs to.

Any other authenticated user requesting `/media/recordings/<file>.wav?token=...` gets a `403`.

<br>

## What Happens Under the Hood

When `python manage.py seed_demo` runs (or the container starts), the `Command.handle()` method executes the following steps in order:

1. **Reference dates** — computes `two_days_ago`, `seven_days_ago`, `thirty_days_ago` for the `Goal.start_date` fields and demo chat ages.

2. **Album images** — if `REMAKE_SAMPLE_DATA`, wipes and re-seeds the `AlbumImage` rows that conversation topics get matched against.

3. **`set_environment_users()`** —
    - Creates / refreshes the two admins, workshop demo user, and Buddy user from `.env`.
    - Links both admins to the workshop profile and gives Buddy a separate empty profile.
    - If `REMAKE_TRANSCRIPT_DATA`, deletes any existing `source="transcript"` sessions for the demo profile and calls `seed_transcript_chat(profile, care_account)`.
    - `seed_transcript_chat` in turn:
      1. Reads `transcript_config.json` and parses the CSV into utterances grouped by `uttID`.
      2. Persists the audio through the configured local/GCS recording store.
      3. Creates the `ChatSession` and a separate `SessionAudio` metadata row for the copied WAV.
      4. Creates one `ChatMessage` per utterance + bulk-inserts `ChatWord` rows (word-level timestamps).
      5. Auto-discovers `biomarker_*.csv` files, parses each, and bulk-inserts `ChatBiomarkerScore` rows anchored at `started_at`.
      6. Loads `post_chat_analysis` from `transcript_config.json` when present;
         otherwise runs `post_chat_analysis()` normally. It then saves the summary,
         sentiment, topics, and risk fields through the standard session helper.

4. **`setup_dummy_chats()`** — creates `demo_patient` + `demo_caregiver` users with their profile; if `REMAKE_SAMPLE_DATA`, calls `seed_chats()` and `seed_reminders()` to fill the user-facing UI with random data.

5. **`setup_analyzed_data()`** — creates `sample_user` + `sample_care` users; if `REMAKE_ANALYZED_DATA`, deletes prior `source="webapp"` sessions and calls `seed_analyzed_chats()` to load fixed transcripts from `examples.json` and run post-chat analysis on them.

6. **Stale-session cleanup** — closes any `ChatSession` rows left `is_active=True` by a crashed previous run.

7. **Legacy admin grant** — promotes the `AdnanSadi2` user to `is_staff` / `is_superuser` if it exists (kept in parallel with the env-driven admin during the migration period).

<br>

## Adding a New Pre-recorded Chat

1. Create a new folder under `seed_data/transcript_data/test_transcripts/` (e.g. `test_02/`).
2. Drop in the four required files (config JSON, transcript CSV, audio WAV) and any `biomarker_<type>.csv` files you have.
3. In [`seed_data/transcript.py`](seed_data/transcript.py), `seed_transcript_chat` takes a `test_dir` argument — if you want to load multiple folders, call it once per folder from `setup_dummy_chats` / `set_environment_users`.
4. Set `REMAKE_TRANSCRIPT_DATA=true` in `backend/.env`, restart the backend, then set it back to `false` once the data is in place.
