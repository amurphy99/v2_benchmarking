# Speech System // Backend
Django based backend. Provides database access via an API and provides the chat function via WebSocket.


<!-- ================================================================================ -->
<!-- To do list (probably super outdated...)                                          -->
<!-- ================================================================================ -->
<details closed> <summary>To Do:</summary>

* This will be a big task, and needs to be done across a lot of files... Change "plwd" references to just "patient." (database, views, etc.)
    - Don't want patients to be referenced as PLwD

* Make sure `requirements-web.txt` actually covers everything, no extra unused pacakges.

* When we load a chat, check if X minutes have passed since the last interaction, and if so close it and create a new one.
    - Means we need to add in a "last interaction" timer... Or I guess I can use the same logic as start_ts for end_ts.
    - Probably should be done in ```db_services.py```.

* Also add logic that checks if the source loading the chat is the same as the source that created the current chat.
    - If something is the first message or first biomarker added to the chat, set the source to that (an empty chat could have been made previously).
    - This could be how to have 2 connections to a chat at once. If the chat was created on the robot and you are connecting from the webapp, do:...

<hr>
</details>


<!-- ================================================================================ -->
<!-- Running the project (locally and/or on the cloud)                                -->
<!-- ================================================================================ -->
### To run the project locally:
1. `cd` into the `backend` directory
2. ***<b>(Local only, don't commit this)</b>*** In `docker-compose.backend.yaml` comment out both `external: true` lines
3. `docker compose -f docker-compose.backend.yaml up --build`

<details closed> <summary>Local version of `docker-compose.backend.yaml` to change to locally</summary>

```yaml
# Backend Services (Postgres database & Django server)
services:
  # -------------------------------------------------------------------------------- 
  # 1) Postgres Databases
  # --------------------------------------------------------------------------------
  db_vector:
    image: ankane/pgvector:latest
    container_name: db_vector
    env_file: [.env]
    environment:
      POSTGRES_DB: ${VECTOR_DB_NAME}
      POSTGRES_USER: ${VECTOR_DB_USER}
      POSTGRES_PASSWORD: ${VECTOR_DB_PASSWORD}
    networks: [appnet]
    ports: ["5434:5434"]
    volumes: [vector_db_data:/var/lib/postgresql/data]

  db:
    image: postgres:17 #ankane/pgvector:latest
    container_name: db
    env_file: [.env]
    networks: [appnet]
    ports: ["5433:5432"]   # expose main DB on localhost:5433 (for local testing)
    volumes: [db_data:/var/lib/postgresql/data]

  # -------------------------------------------------------------------------------- 
  # 2) Django Backend Server
  # --------------------------------------------------------------------------------
  # Database is only accessable through the backend Django server
  backend:
    build:
      context: .
      dockerfile: Dockerfile-backend
    container_name: backend
    command: |
      sh -c "
        python manage.py makemigrations --noinput &&
        python manage.py migrate --database=default --noinput &&
        python manage.py migrate --database=vector  --noinput &&
        python manage.py seed_demo &&
        daphne -b 0.0.0.0 -p 8000 backend.asgi:application
      "
    env_file: [.env]
    volumes: [.:/app ]               # general project mount
    #depends_on: [db, db_vector]
    networks: [appnet]
    ports: ["8000:8000"] # expose 8000 to host for Vite

# --------------------------------------------------------------------------------
# Declared, not created. Root file will create these.
# --------------------------------------------------------------------------------
# Docker will also create them automatically if this file is run individually.
volumes:
  db_data:
    #external: true
  vector_db_data:
    #external: true
networks:
  appnet:
    #external: true
```

Entire file idk

```yaml
# ================================================================================
# Backend Services (Postgres database & Django server)
# ================================================================================
services:
  # -------------------------------------------------------------------- 
  # 1) Postgres Database
  # --------------------------------------------------------------------
  # Database is only accessable through the backend Django server 
  # (Not needed anymore because because of separate VM for the databases)
  # Uncomment to run the database container locally during development
  # --------------------------------------------------------------------
  db_vector:
    image: ankane/pgvector:latest
    container_name: db_vector
    env_file: [.env]
    environment:
      POSTGRES_DB: ${VECTOR_DB_NAME}
      POSTGRES_USER: ${VECTOR_DB_USER}
      POSTGRES_PASSWORD: ${VECTOR_DB_PASSWORD}
    networks: [appnet]
    ports:
      - "5434:5434"
    volumes:
      - vector_db_data:/var/lib/postgresql/data

  db:
    image: postgres:17 #ankane/pgvector:latest
    container_name: db
    env_file: [.env]
    networks: [appnet]
    ports:
      - "5433:5432"   # expose main DB on localhost:5433 (for local testing)
    volumes:
      - db_data:/var/lib/postgresql/data


    
  # -------------------------------------------------------------------- 
  # 2) Django Backend Server
  # --------------------------------------------------------------------
  # Database is only accessable through the backend Django server
  backend:
    build:
      context: .
      dockerfile: Dockerfile-backend
    container_name: backend
    command: |
      sh -c "
        python manage.py makemigrations --noinput &&
        python manage.py migrate --database=default --noinput &&
        python manage.py migrate --database=vector  --noinput &&
        python manage.py seed_demo &&
        daphne -b 0.0.0.0 -p 8000 backend.asgi:application
      "
    env_file: [.env]
    volumes:
      - .:/app                # general project mount
    #depends_on: [db, db_vector]
    networks: [appnet]
    ports:                    # expose 8000 to host for Vite
      - "8000:8000"

# --------------------------------------------------------------------
# Declared, not created. Root file will create these.
# --------------------------------------------------------------------
# Docker will also create them automatically if this file is run individually.
volumes:
  db_data:
    #external: true
  vector_db_data:
    #external: true
networks:
  appnet:
    #external: true
```

</details>



<!-- -------------------------------------------------------------------------------- -->
<!-- Running it on the cloud ("deployed")                                             -->
<!-- -------------------------------------------------------------------------------- -->
<details closed> <summary>Deployed (original) version of `docker-compose.backend.yaml` to switch back to for merging:</summary>

```yaml
# Backend Services (Postgres database & Django server)
services:
  # -------------------------------------------------------------------------------- 
  # 1) Postgres Databases
  # --------------------------------------------------------------------------------
  # Database is only accessable through the backend Django server 
  #db_vector:
  #db:

  # -------------------------------------------------------------------------------- 
  # 2) Django Backend Server
  # --------------------------------------------------------------------------------
  backend:
    build:
      context: .
      dockerfile: Dockerfile-backend
    container_name: backend
    command: |
      sh -c "
        python manage.py makemigrations --noinput &&
        python manage.py migrate --database=default --noinput &&
        python manage.py migrate --database=vector  --noinput &&
        python manage.py seed_demo &&
        daphne -b 0.0.0.0 -p 8000 backend.asgi:application
      "
    env_file: [.env]
    volumes: [.:/app ]            # general project mount
    depends_on: [db, db_vector]
    networks: [appnet]
    ports: ["8000:8000"]          # expose 8000 to host for Vite

# --------------------------------------------------------------------------------
# Declared, not created. Root file will create these.
# --------------------------------------------------------------------------------
# Docker will also create them automatically if this file is run individually.
volumes:
  db_data:
    external: true
  vector_db_data:
    external: true
networks:
  appnet:
    external: true
```
</details>


<br>



<!-- ================================================================================ -->
<!-- Backend Architecture                                                             -->
<!-- ================================================================================ -->
# Backend System Architecture

<details closed> <summary> <b>Database Models Overview</b> </summary>

| Model                  | Purpose                                  | Key fields / constraints                              |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------- |
| **User (`auth_user`)** | Login credentials                        | Django default class                                  |
| **Profile**            | One patient linked 1-to-1 to a caregiver | `Unique(plwd)` & `Unique(caregiver)`                  |
| **ChatSession**        | One conversation (active or archived)    | `is_active`, `source`, `Unique(user, is_active=True)` |
| **ChatMessage**        | Single utterance                         | FK(`ChatSession`), `role = user/assistant`            |
| **ChatBiomarkerScore** | Biomarkers calculated during chats       |  FK(`ChatSession`), `score_type`, `score`, `ts`       |
| **Goal**               | Track number of user conversations       | `Unique(user)`                                        |
| **UserSettings**       | View / scheduling toggles                | `Unique(user)`                                        |
| **Reminder**           | Calendar entry                           | FK(`Profile`), `daysOfWeek` Array                     |
<hr>
</details>


<!-- -------------------------------------------------------------------------------- -->
<!-- Session audio storage                                                            -->
<!-- -------------------------------------------------------------------------------- -->
<details closed> <summary> <b>Chat Session Audio Storage</b> </summary>

## Session audio storage

Live chats always write accepted incoming user PCM to an incremental temporary
mono WAV file. The user's `Profile.save_audio_by_default` value initializes the
save state (default setting for either saving or discarding audio at the end of
a chat), and an admin listener may still change that state during the chat. At
disconnect, the complete temporary WAV is persisted only when the final state
for saving the audio is set to `True`.

Assistant TTS is not included in the WAV. In previous iterations, it was saved
for frontends that used TTS sourced from the backend -- we would combine the raw
TTS output with the audio bytes that we received from the user. However, this
added a lot of complexity and unreliability, so it was removed (for now...).

`SessionAudio` stores metadata and an opaque object key separately from
`ChatSession`; audio bytes are kept outside PostgreSQL. Local development uses:

```env
SESSION_AUDIO_STORAGE       = local
SESSION_AUDIO_LOCAL_ROOT    = /app/media
SESSION_AUDIO_TEMP_ROOT     = /tmp/cognibot_recordings
SESSION_AUDIO_OBJECT_PREFIX = recordings
```

The deployed backend can use a private GCS bucket instead:

```env
SESSION_AUDIO_STORAGE              = gcs
SESSION_AUDIO_GCS_BUCKET           = private-bucket-name
SESSION_AUDIO_OBJECT_PREFIX        = recordings
SESSION_AUDIO_PLAYBACK_URL_TTL_SEC = 3600
DJANGO_DEBUG                       = false
DJANGO_SECRET_KEY                  = long-random-secret-key
```

GCS mode will not start while the local fallback signing key is active. Keep the
production key out of the repository; changing it also invalidates existing JWTs and
local playback URLs.

Authorized staff, the patient owner, and accounts linked to the patient through
`Access` can request a short-lived playback URL from
`GET /api/chatsession/<session_id>/audio-playback/`. Durable object keys are not
returned by the session serializer.

<hr>
</details>




<!-- -------------------------------------------------------------------------------- -->
<!-- WebSocket flow                                                                   -->
<!-- -------------------------------------------------------------------------------- -->
<details closed> <summary> <b>WebSocket Flow (maybe outdated -- check `consumers/README.md`)</b> </summary>

1. **Client connects:** 
    * ```wss://<host>/ws/chat/?token=<JWT_ACCESS>&source=robot```
    * `QueryAuthMiddleware`
        - Extracts `token`, verifies it, and sets `scope["user"]`
        - Passes `source` string into `scope`
            * ```webapp``` | ```mobile``` | ```qtrobot``` | ```buddyrobot```

2. **`ChatConsumer.connect()`**
    * Calls `ChatService.get_or_create_active_session(user, source)`, which fetches or creates `ChatSession(is_active=True)`
    * Builds `context_buffer` from the last 10 messages between the user and LLM

3. **Receive JSON messages during chat:**
    - `"overlapped_speech"` => Simple notification that there was overlapped speech between the user and system
        * ***ToDo: Send the timestamp this occured instead. Also add it as a property of ChatSessions. Makes "interruptions over the last X seconds" simple.***
    - `"audio_data"` => Expects 5 second audio chunks to be used for calculating openSMILE features
        * ***ToDo: Create a second audio data endpoint that receives chunks of ~100ms. This would be used for backend ASR.***
    - `"transcription"` => Assumes this to be the users utterance (ASR was done on the frontend), and replies with the LLM
        * ***ToDo: Send utterance start/end timestamps along with the text.*** 
    - `"end_chat"` => Set the current ```ChatSession``` as inactive, and creates a new one
        * ***ToDo: Update ```Goal``` with +1 completed chats and add topics/sentiment data to the ```ChatSession``` object now that it is completed.*** 
        * ***ToDo: Actually, should just change the ```current``` property of ```Goal``` to a method. Query the associated user, check how many non-```is_active``` chats the have that come after the goals ```startDay``` field.***
<hr>
</details>




<!-- ================================================================================ -->
<!-- Accessing the WebSocket-based chat from other coding languages                   -->
<!-- ================================================================================ -->
## Java Access (connecting to the chat WebSocket)

<details closed> <summary> Send username and password to get an access token </summary>

```java
// Build JSON payload
String body = """{"username": "robot_user01", "password": "password"}""";

// POST to /api/token/
HttpClient  client   = HttpClient.newHttpClient();
HttpRequest loginReq = HttpRequest.newBuilder()
        .uri(URI.create("https://cognibot.org/api/token/"))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(body))
        .build();

HttpResponse<String> loginRes = client.send(loginReq, HttpResponse.BodyHandlers.ofString());

// Parse {"access":"...", "refresh":"...", "user":"..."}
String accessToken  = Json.parse(loginRes.body()).at("/access" ).asText();
String refreshToken = Json.parse(loginRes.body()).at("/refresh").asText();
```
</details>

<details closed> <summary> Call any API endpoint </summary>

```java
HttpRequest profileReq = HttpRequest.newBuilder()
        .uri(URI.create("https://cognibot.org/api/profile/"))
        .header("Authorization", "Bearer " + accessToken)
        .GET()
        .build();

HttpResponse<String> profileRes = client.send(profileReq, HttpResponse.BodyHandlers.ofString());
```
</details>

<details closed> <summary>  Open the WebSocket chat </summary>

```java
String wsURL = "wss://cognibot.org/ws/chat/"
             + "?token=" + accessToken        // authorization
             + "&source=buddyrobot";          // device (webapp, buddyrobot)

WebSocket webSocket = client.newWebSocketBuilder()
        .buildAsync(URI.create(wsURL), new ChatListener())
        .join();
```
</details>
<br>

