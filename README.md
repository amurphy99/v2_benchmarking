# Dementia Speech System

This project aims to create a progressive web app to run a speech system oriented for dementia patients. 
* <b>Sandbox:</b> cognibot.sandbox.org
* <b>Deployment:</b> cognibot.org

## How it works
The app uses 4 different docker containers:
1) Database (postgres)
2) Backend  (websocket server, biomarker logic)
3) Frontend (vite, react) 

Everything is wrapped in docker-compose.yaml and the frontend and backend APIs are the only components accessable outside of the VM as they get served by Nginx. The database and LLM are only accessible from inside the docker network.



## How to Run

<details closed> <summary>Locally</summary>

You will need Docker Desktop and a code editor.

1. Clone the repository
### Frontend
1. `cd` into the `frontend` directory
2. Run `npm install` (only need to do once if you haven't already)
3. Run `npm run dev`

### Backend
1. Acquire and place copies of `new_LSA.csv` and the stanford-parser models file in their correct directories (highlighted green in the Project Architecture section).
2. ***<b>(Local only, don't commit this)</b>*** In `docker-compose.backend.yaml` comment out all `external: true` lines and uncomment all lines under db_vector and db under `services`
3. Open Docker Desktop
4. `cd` into the `backend` directory
5. Run `docker compose -f docker-compose.backend.yaml up --build`
6. Wait until you see the "Listening on TCP ..." message.

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


<br>

# Project Architecture
```diff

SSH:/home/user/
 ├── v2_benchmarking/
 │   ├── backend/
 │   │   ├── Dockerfile-backend
 │   │   ├── backend/             # Django app
 │   │   ├── chat_app/            # Python backend logic
 │   │   │   ├── websocket/biomarkers/biomarker_models/
+│   │   │   │   ├── stanford-parser-full-2020-11-17/stanford-parser-4.2.0-models.jar
+│   │   │   │   ├── new_LSA.csv
 │   │   │   │   └── ...
 │   │   │   └── ...
 │   │   │
+│   │   ├── google-stt-key.json  # Downloaded from GCS during deployment
+│   │   ├── .env                 # Created programmatically during startup script
 │   │   ├── requirements-web.txt
 │   │   └── ...
 │   │
 │   ├── frontend/
 │   │   ├── Dockerfile-frontend  # Builds and serves Vite app
 │   │   ├── src/
 │   │   ├── public/
+│   │   └── .env                 # Created programmatically during startup script
 │   │
 │   ├── nginx/
 │   │   ├── Dockerfile           # Sets up certbot and nginx
 │   │   └── default.conf         # Frontend & Backend API are served
 │   │
+│   ├── .env                     # Created programmatically during startup script
 │   ├── docker-compose.yaml      # Starts up all of the containers
 │   └── ...
 │
 │
 │
 ├── deployment-files/            # Untracked files downloaded from GCS bucket
 │   ├── models/      
+│   │   ├── new_LSA.csv
+│   │   ├── stanford-parser-4.2.0-models.jar
-│   │   └── Phi-3_finetuned.gguf # No longer need to download this when we do the setup...
 │   │
 │   ├── logs/                    # For backend log output
 │   └── ... 
 │
!└── deploy_app.sh                # Script to set everything up

```


<br><hr>


