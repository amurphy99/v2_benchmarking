# Speech System // Database Models <br> `backend/chat_app/models/..`

The `chat_app` app's Django models: accounts and their settings, every chat and what it
records, the memory activity's instructions, and how each task chat was run. They live on
the `default` Postgres database. The vector store's models are a separate app
(`backend/rag_vectorstore/`), on the `vector` database through `backend/backend/db_routers.py`.

Import every model from the package, never from a module inside it:

```python
from chat_app.models import ChatSession, ChatRun   # Another app, a test, or a management command
from ..models        import ChatSession            # Inside chat_app (relative, like the rest of the app)
```

`__init__.py` imports every model class because Django only finds an app's models through
its `models` module. It is the one re-export the project allows; anything that isn't a
model (a constant, a helper) is imported from the module that defines it.

For the models that record how a task chat was run (`ChatRun` and `TaskSnapshot`), see
[`runs/README.md`](runs/README.md).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Files                                                                            -->
<!-- -------------------------------------------------------------------------------- -->
## Files

```diff
backend/chat_app/models/
 ├── README.md          # This file
+├── __init__.py        # Imports every model class, so callers import from `chat_app.models`
 ├── field_args.py      # `init_args` (null=True, blank=True): the optional-field arguments every module uses
 │
+├── accounts.py        # Account, Profile, Access, Reminder, Goal, UserSettings
+├── chat.py            # ChatSession, and what a chat records: ChatMessage, ChatWord,
 │                      #   ChatBiomarkerScore, SessionAudio, ReplyNowEvent, AlbumImage
+├── activities.py      # Activity, RAGInstructions, LLMTurnLog (the memory activity chat)
 │
+└── runs/              # How each task chat was run: ChatRun and TaskSnapshot (see runs/README.md)
     ├── README.md
     ├── __init__.py    # Empty (the package's own `__init__.py` imports the run models)
     └── run.py
```

Each module imports only from the ones before it in this order, so there are no import
cycles: `field_args`, `accounts`, `chat`, then `activities` and `runs/run`. A model that
needs one defined in a later module reaches it through a reverse relation (`Goal.current`
counts `self.profile.chat_sessions` instead of importing `ChatSession`), or names it in
type hints under `TYPE_CHECKING` (`ChatSession.run_or_none` returns a `ChatRun`).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- How the Models Relate                                                            -->
<!-- -------------------------------------------------------------------------------- -->
## How the models relate

```text
User (django.contrib.auth)
 └─ Account                         1:1    role: patient, caregiver, family, physician, or other
     ├─ Access                      many   as a caregiver: one row per participant this account sees
     └─ Profile                     1:1    a participant: switches read as each chat connects, and language
         ├─ UserSettings            1:1    their avatar (`modelChoice`), task type, what they may see
         ├─ Goal                    1:1    chats per period (`current` and `remaining` are counted live)
         ├─ Reminder                many
         ├─ Access                  many   the caregivers linked to this participant
         └─ ChatSession             many   one chat; at most one active per profile
             ├─ ChatRun             1:1    task chats only: the condition and variant (runs/)
             │   └─ TaskSnapshot    1:1    the task's private materials and last committed state
             ├─ ChatMessage         many   one utterance or reply (a reply keeps its stage `timing`)
             │   └─ ChatWord        many   the utterance's word-level STT timestamps
             ├─ ChatBiomarkerScore  many   optionally tied to the ChatMessage it was scored from
             ├─ SessionAudio        1:1    the kept recording's storage metadata (none when discarded)
             ├─ ReplyNowEvent       many   one per `reply_now` command received
             ├─ LLMTurnLog          many   the memory activity's per-turn LLM metadata
             └─ AlbumImage          FK     the main topic's picture (shared by every chat on that topic)

Activity
 └─ RAGInstructions                 many   the memory activity's instruction steps, in order
```

* **`ChatSession`** holds what every chat has: who and where from (`profile`, `source`), what
  ran (`chat_type`), when (`date`, `end_ts`, and the computed `start_ts` and `duration`),
  whether it is still running (`is_active`), whether it started in debug mode (`debug_mode`),
  and the post-chat analysis that `ChatService.close_session` fills in when it ends
  (`summary`, `topics`, `sentiment`, `emotion`, and the `risk_*` fields).
* **What a chat records** (messages and their words, biomarker scores, the recording) are
  separate tables, so a page can show a chat's summary without loading its transcript.
* **How a task chat was run** is on its `ChatRun`, which only task chats have.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Reading Chats Without Loading Everything                                         -->
<!-- -------------------------------------------------------------------------------- -->
## Reading chats without loading everything

1. **Lists carry summaries.** The chat list endpoint (`/api/chatsessions/<active>/<demo>/`,
   `ChatSessionViewSet` in `api/views.py`) serializes `ChatSessionSummarySerializer`: no
   messages, words, biomarker scores, or recording. A `message_count` is annotated with
   `Count("messages", distinct=True)`; it must stay `distinct`, because a non-staff user's
   access filter joins one row per caregiver. Only a single chat
   (`/api/chatsession/<id>/`, `ChatSessionSerializer`) carries its transcript. For scale: in
   November 2026 the old full list was 4.09 MB for 34 chats, and the summary is about 0.06 MB.
2. **Join what you serialize.** `select_related` every foreign key and one-to-one the
   serializer reads (the list joins `profile__account__user`, `profile__settings_user`,
   `profile__goal`, `image`, and `run`). Use `prefetch_related("messages__words",
   "biomarker_scores")` only for one chat in full.
3. **Know which properties query the database.**

   | Property | Queries per call | Note |
   |---|---|---|
   | `ChatSession.start_ts` | 2 aggregates | The earliest message or score timestamp |
   | `ChatSession.duration` | 2 (it calls `start_ts`) | A serializer showing both pays 4 |
   | `ChatSession.average_scores` | 1 grouped query | Prefetched scores don't help |
   | `ChatSession.run_or_none` | 0 after `select_related("run")`, else 1 | `None` for a chat without a run |
   | `Goal.current`, `Goal.remaining` | 1 count each (`remaining` calls `current`) | Both are in every serialized profile |

   These leave about 7 queries per listed chat. Computing them as annotations in the list's
   query is the next step if lists grow long.
4. **Async code can't run queries.** Consumers and harnesses run on the event loop: query
   through `database_sync_to_async` (imported as `db_s2a`), and `select_related` any relation
   the async code reads afterwards. `ChatService.get_session_info` joins the run
   for the admin listener's `session_info` frame for this reason. Touching an unloaded
   relation there raises `SynchronousOnlyOperation`.
5. **Optional one-to-ones are normal.** `ChatSession.run`, `ChatSession.audio`, and
   `ChatRun.task_snapshot` raise `RelatedObjectDoesNotExist` when missing. Where missing is
   expected, check with `hasattr(obj, "<name>")` or `ChatSession.run_or_none`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Writing                                                                          -->
<!-- -------------------------------------------------------------------------------- -->
## Writing

* **`ChatService` (`services/db_services.py`) does the writes** that REST, the WebSocket
  consumers, and the management commands share. A reply's messages are saved together
  (`add_exchange`), in one transaction with the task snapshot when there is one, so a
  cancelled reply never leaves half a turn or an unheard decision behind.
* **`ChatService.get_or_create_active_session` creates every live chat**, and a task chat's
  run with it. The consumer closes any other active session first: the
  `unique_active_session_per_profile` constraint allows one active chat per profile.
* **Datetimes are timezone-aware UTC** (`USE_TZ = True`). Never store a naive one. Word,
  biomarker, and recording timestamps share one time base, anchored on
  `SessionAudio.started_at` for playback (see `management/README.md` for seeded transcripts).
* **Look chats up through the caller's access.** For client-supplied ids, use
  `api/mixins.py`'s `accessible_chat_sessions(user)` (staff see every chat, a participant
  their own, a caregiver their linked participants'), never a bare `.get()`.
* **Startup never changes existing data.** `close_stale_sessions` and `seed_demo` must not
  change or delete existing accounts, chats, or recordings (`management/README.md` §
  Persistence and Reset Rules), and the `backend_db_data` volume is never reset to fix a
  model problem.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Changing a Model                                                                 -->
<!-- -------------------------------------------------------------------------------- -->
## Changing a model

1. **Edit the model in its family's module.** A new family gets a module of its own, and new
   models about a task chat's run go in `runs/`. Add every new model class to `__init__.py`.
2. **Generate its migration and commit it with the change.** Generate it in a one-off
   container (`backend/README.md` § Database Migrations), read it, and never edit a migration
   that has been committed. A change that moves existing data needs more:
   [Moving data between models](#moving-data-between-models), below.
3. **Update what reads it**: `api/serializers.py` (the summary serializer only gets the small
   fields that lists show), `admin.py`, and `services/db_services.py`.
4. **Mirror it on the frontend in the same change.** Serializer fields have a copy in
   `frontend/src/api/models.ts`, and so do these choices:

   | Backend | Its copy |
   |---|---|
   | `UserSettings.MODEL_CHOICES` | `AVATAR_MODEL_CHOICES` in `frontend/src/api/models.ts` |
   | `Profile.LANGUAGE_CHOICES` | `LANGUAGE_CHOICES` in `frontend/src/api/models.ts` |
   | `ChatBiomarkerScore.BIOMARKER_CHOICES` | `BiomarkerType` in `frontend/src/api/models.ts`, and `frontend/src/pages/admin/components/biomarkers/biomarkerInfo.ts` |
   | `ChatSession.SOURCE_CHOICES` (the live ones) | `ALLOWED_SOURCES` in `services/middleware.py`, and `websocket/consumers/CLIENT_PROTOCOL.md` |

5. **Test it**: REST and database tests in `chat_app/tests/`, consumer and harness tests in
   `chat_app/websocket/tests/`. Run both labels together
   (`python manage.py test chat_app.tests chat_app.websocket.tests`).
6. **Update this README** (and `runs/README.md`) when a model, a relation, or a rule here
   changes.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Moving Data Between Models                                                       -->
<!-- -------------------------------------------------------------------------------- -->
## Moving data between models

When a change moves existing data, such as a field moving to another model, `makemigrations`
writes the schema operations but not the copy. `migrations/0006_chat_run.py` is the worked
example:

1. Generate the migration, then reorder its operations so the new model (and its link to
   the old one) exists before the old columns are removed.
2. Add `migrations.RunPython(copy, reverse)` between them. Use the historical models
   (`apps.get_model("chat_app", "...")`), never the classes in this package. Write the
   reverse too, so `migrate chat_app <previous migration>` puts the old columns back.
3. Note the hand edit in a comment under the generated header.
4. Check it against a copy of a real database before any startup applies it:

```bash
# From backend/, with nothing connected to the dev database (stop the `backend` container)
docker compose -f docker-compose.backend.yaml up -d db
docker compose -f docker-compose.backend.yaml exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE migration_check TEMPLATE \"$POSTGRES_DB\""'

# Record what must survive with raw SQL (the models already describe the new schema),
# as hashes rather than participants' data: md5(column::text)
docker compose -f docker-compose.backend.yaml exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d migration_check -tAF"|" -c "SELECT id, ... FROM ... ORDER BY id"' > before.txt

# Migrate the copy forward and compare, then back and compare (POSTGRES_DB points the one-off container at the copy)
docker compose -f docker-compose.backend.yaml run --rm -T -e POSTGRES_DB=migration_check backend python manage.py migrate chat_app
docker compose -f docker-compose.backend.yaml run --rm -T -e POSTGRES_DB=migration_check backend python manage.py migrate chat_app <previous migration>

# Drop the copy, and stop the databases if they weren't running before
docker compose -f docker-compose.backend.yaml exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE migration_check"'
```

Then confirm the dev database itself is still at its previous migration:

```sql
SELECT name FROM django_migrations WHERE app = 'chat_app' ORDER BY id DESC LIMIT 1;
```

Before deploying a migration that removes or changes a column holding study data, back up
the deployed database (`backend/README.md` § Database Migrations).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Gotchas                                                                          -->
<!-- -------------------------------------------------------------------------------- -->
## Gotchas

* **Django is 3.2.** The admin's `list_display` can't follow a relation with `__` (use an
  `@admin.display` method; `list_filter` can follow one). `select_for_update()` on a query
  that left-joins a relation which may be missing needs `of=("self",)`, since Postgres
  can't lock the missing side.
* **`accounts.py`'s `get_account` and `get_profile` are unused.** The API and services use
  `api/mixins.py`'s versions.
* **Some `ChatSession` fields aren't what they seem.** `llmVersion` is a placeholder that
  always holds its default. `taskType` and `taskSubtype` are filled in from the
  participant's settings when the chat ends.
* **`ChatSession.source` has seeded values too.** Its choices include `demo`, `analyzed`, and
  `transcript`, which only seeding uses; a live connection can only use `ALLOWED_SOURCES`.
  `demo` chats are left out of the admin chat lists (`.../<active>/0/`).
