# Speech System // Backend
Django based backend. Provides database access via an API and provides the chat function via WebSocket.

<details closed> <summary>To Do:</summary>

* This will be a big task, and needs to be done across a lot of files... Change "plwd" references to just "patient." (database, views, etc.)
    - Don't want patients to be referenced as PLwD

* In `db_services.py` add functionality to calculate topics and analysis and save them when the session is closed. 
    - Also get/create the user's goal and add 1 to it. --- **probably dont need this, just check how many inactive ChatSessions come after the goal start date**

* Biomarker calculations need to be looked over. Specific inputs like time ranges, single words, full conversation, etc.

* Django secret key moved to `.env` file or config. Turn debug mode on and off via environment variables as well.

* Make sure `requirements-web.txt` actually covers everything, no extra unused pacakges.

* When we load a chat, check if X minutes have passed since the last interaction, and if so close it and create a new one.
    - Means we need to add in a "last interaction" timer... Or I guess I can use the same logic as start_ts for end_ts.
    - Probably should be done in ```db_services.py```.

* Also add logic that checks if the source loading the chat is the same as the source that created the current chat.
    - If something is the first message or first biomarker added to the chat, set the source to that (an empty chat could have been made previously).
    - This could be how to have 2 connections to a chat at once. If the chat was created on the robot and you are connecting from the webapp, do:...

<hr>
</details>



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
</details>


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

<details closed> <summary> <b>WebSocket Flow</b> </summary>

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

<details closed> <summary> <b>Default/Demo Data</b> </summary>

| User      | Username          | Password  |
| --------- | ----------------- | --------- |
| User      | `demo_patient`    | `1`    |
| Caregiver | `demo_caregiver`  | `1`    |
<hr>
</details>



## Java Access

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


