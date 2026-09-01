# CogniBot -- An Interactive Conversational Companion for Speech Analysis

Our speech system, "CogniBot", hosts an AI/LLM-based conversational companion for older adults living with dementia, providing engaging interactions while passively analyzing speech and language patterns. Using machine learning and speech analytics, a range of cognitive biomarkers are extracted from conversations and shared with users, caregivers, and clinicians through a web-based monitoring interface. This feedback, alongside detailed conversation history, can help support memory, communication, and care planning. The system is accessible through both a progressive web app and two different physical robotic companions. All user interactions, conversation histories, and biomarker data are synchronized for a seamless experience regardless of which platform is used.

Find CogniBot on our web interface: [CogniBot.org](https://www.cognibot.org).

<details closed> <summary>More details about alternate/development versions of CogniBot</summary>

* [Current deployed version](https://www.cognibot.org) (only official updates)
* [Sandbox #1](https://sandbox.cognibot.org) 
* [Sandbox #2](https://sandbox2.cognibot.org) (current most recent testing version)
* [Sandbox #3](https://sandbox3.cognibot.org)

</details>

<br>

## How it works

The app uses 4 Docker containers:

|           | Container  | Technology             | Responsibilities                                    |
|-----------|------------|------------------------|-----------------------------------------------------|
| Database  | `db`       | PostgreSQL + Vector DB | Relational data storage and RAG vector search       |
| Backend   | `backend`  | Django + Channels      | WebSockets, LLM integration, and biomarker analysis |
| Frontend  | `frontend` | Vite + React           | Progressive Web App (PWA) user interface            |
| Web Proxy | `nginx`    | Nginx + Certbot        | Traffic routing and SSL certificate management      |


The containers are orchestrated via `docker-compose.yaml` and the frontend and backend APIs are the only components accessible outside of the VM as they get served by Nginx. The database and LLM are only accessible from inside the docker network.




<br>

# Project Architecture
```diff

SSH:/home/user/
 ├── v2_benchmarking/
 │   ├── docker-compose.yaml          # Orchestrates all 4 containers
+│   ├── .env                         # Created programmatically during startup script
 │   │
 │   ├── backend/
 │   │   ├── Dockerfile-backend
+│   │   ├── google-stt-key.json      # Downloaded from GCS during deployment
+│   │   ├── .env                     # Created programmatically during startup script
 │   │   ├── backend/                 # Django app
 │   │   ├── chat_app/                # Core Python backend logic
 │   │   │   ├── websocket/
 │   │   │   │   ├── routing.py       # Routes to different chat modes
 │   │   │   │   ├── biomarkers/      # Cognitive biomarker extraction
 │   │   │   │   ├── consumers/       # WebSocket consumer classes
 │   │   │   │   │   ├── consumers.py # Main chat consumer class
 │   │   │   │   │   └── handlers/    # Channels utilities for consumers
 │   │   │   │   │
 │   │   │   │   └── services/        # Chat, audio, RAG utilities
 │   │   │   │       └── speech/      # Speech-to-text (STT) & text-to-speech (TTS)
 │   │   │   │
 │   │   │   └── services/llm/        # LLM provider integrations
 │   │   │       ├── non_chat/        # Post-chat analysis via structured generation
 │   │   │       ├── dummy_LLM.py     # Dummy class for offline testing
 │   │   │       └── llama_api.py     # Correspondence with our separately hosted LLM
 │   │   │
 │   │   └── rag_vectorstore/         # Vector DB Django app
 │   │       ├── models.py            # VectorStore models
 │   │       ├── services/
 │   │       │   └── vdb_services.py  # Vector DB services
 │   │       └── models/
 │   │           └── MiniLM-L6-v2/    # Downloaded programmatically during deployment
 │   │
 │   │
 │   ├── frontend/
 │   │   ├── Dockerfile-frontend      # Builds and serves Vite app
+│   │   ├── .env                     # Created programmatically during startup script
 │   │   ├── src/
 │   │   └── public/
 │   │
 │   └── nginx/
 │       ├── Dockerfile               # Sets up certbot and nginx
 │       └── default.conf             # Frontend & Backend API are served
 │
 │
 ├── deployment-files/                # Untracked files downloaded from GCS bucket
 │   └── models/      
+│       ├── new_LSA.csv
+│       └── stanford-parser-4.2.0-models.jar
 │
!└── deploy.sh                        # Script to set everything up

```

<br>


## How to Run

<details closed> <summary>Locally</summary>

### Frontend
1. `cd` into the `frontend` directory
2. `npm install` (only need to do once if you haven't already)
3. `npm run dev`

### Backend
1. Need to have copies of `new_LSA.csv` and the stanford-parser models file placed in their correct directories.
2. Open Docker Desktop
3. `cd` into the `backend` directory
4. ***<b>(Local only, don't commit this)</b>*** In `docker-compose.backend.yaml` comment out both `external: true` lines. Also, Uncomment the database related services, since this branch uses external database connection during deployment.
5. Run: `docker compose -f docker-compose.backend.yaml up --build`

The `rag_vectorstore` migration enables the PostgreSQL `vector` extension
automatically when a new vector database is migrated.


The web app can be accessed through localhost:5173 in your browser.

<hr>
</details>

<details closed> <summary>Deployed (Google Cloud)</summary>
<br>

1. SSH into the cloud instance
2. Upload `deploy_app.sh` (untracked file)
3. Run `bash deploy_app.sh`
    * More info on how this works: https://github.com/amurphy99/chat_app_deployment
    * Installs docker & updates other dependencies
    * Downloads required, non-tracked files from cloud storage
    * Clones the repo & copies the non-tracked files (model files) into their proper locations 
    * Builds the Docker containers & starts the app

Useful commands:
* `sudo docker logs backend` (also used with the other containers)
* More in `chat_app_deployment`

<hr>
</details>

