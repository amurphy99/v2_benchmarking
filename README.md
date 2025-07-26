# Dementia Speech System

This project aims to create a progressive web app to run a speech system oriented for dementia patients. 
* <b>Sandbox:</b> cognibot.sandbox.org
* <b>Deployment:</b> cognibot.org

## How it works
The app uses 4 different docker containers:
1) Database (postgres)
2) LLama API
3) Backend  (websocket server, biomarker logic)
4) Frontend (vite, react) 

Everything is wrapped in docker-compose.yml and the frontend is the only component accessable outside of the VM as it gets served by Nginx. The database and backend are only accessible from inside the docker network.



## How to Run

<details closed> <summary>Locally (outdated)</summary>
<br>

``` docker compose up --build ```

<br>

1. Ensure your machine has the requirements installed
2. Clone the repo using this terminal command: git clone https://github.com/softwareJengineer/chat_app_v2
3. Open Docker Desktop

In the backend directory:
4. Build the docker container using this command: docker-compose up --build
5. To start the docker container simply run: docker-compose up
6. To shut down the container simply run: docker-compose down

In the frontend directory:
7. Run the command: npm run dev
8. The web app can be accessed through localhost:5173 in your browser

REQUIREMENTS
1. Node.js
3. Python3
4. Java 22
5. new_LSA.csv
6. stanford-parser models file
7. Phi-3_finetuned.gguf

<br>
</details>

<details closed> <summary>Deployed (Google Cloud)</summary>
<br>

1. SSH into the cloud instance
2. Upload ```deploy_app.sh``` (untracked file)
3. Run ```deploy_app.sh```
    * More info on how this works: https://github.com/amurphy99/chat_app_deployment

<br>
</details>


## To Do:

### General
- [ ] If the first utterance is shorter than our audio buffer chunk size (5 seconds), the audio based scores (prosody, pronunciation) are generated with an error. 
    - Should these be done in another separate async task on reception of audio data? If no audio has been recieved between utterances, the scores will be the same anyways, so there is no reason to re-calculate them.
- [ ] Rename docker-compose.yml extension to .yaml (need to do in the deploy repo too though)
- [ ] Recent chats don't work (not sure if just local difference though)
- [ ] Changing settings doesn't do anything
- [ ] When the robots responses are long and the height of the text box increases, it pushes the avatar down and on top of the finish button making it so users cannot click on it to finish & save a conversation


### llama_api
- [ ] cap-add SYS_RESOURCE (?)


### Other/general issues
- [ ] I've gotten signed out/lost authorization a few times mid conversation and not been able to save. The auth lasts 15 minutes now instead of 5, but I still think that some conversations/sessions might last longer...?




<br><br>


## To start it up:
1. SSH into the instance
2. Upload deploy_app.sh
3. Run deploy_app.sh (```bash deploy_app.sh```)
    * Installs docker & updates other dependencies
    * Downloads required, non-tracked files from cloud storage
    * Clones the repo & copies the non-tracked files (.env, model files) into their proper locations 
    * Builds the Docker containers & starts the app



# Project Architecture
```diff
SSH:/home/user/
 ├── v2_benchmarking/
 │   ├── backend/
 │   │   ├── Dockerfile-backend
 │   │   ├── backend/        # Django app
 │   │   ├── chat_app/       # Python backend logic
 │   │   │   ├── websocket/biomarkers/biomarker_models/
+│   │   │   │   ├── stanford-parser-full-2020-11-17/stanford-parser-4.2.0-models.jar
+│   │   │   │   ├── google-stt-key.json
 │   │   │   │   └── ...
 │   │   │   └── ...
 │   │   │
 │   │   ├── requirements-web.txt
+│   │   ├── new_LSA.csv
 │   │   └── ...
 │   │
 │   ├── frontend/
 │   │   ├── Dockerfile-frontend  # Builds and serves Vite app
 │   │   ├── src/
 │   │   ├── public/
 │   │   └── ...
 │   │
 │   ├── llama_api/
 │   │   ├── Dockerfile           # Not actually used-- we download an image instead
+│   │   ├── Phi-3_finetuned.gguf # LLM model (isn't actually here, accesses via volume)
 │   │   └── server.config        # Reverse proxy + static serving
 │   │
 │   ├── nginx/
 │   │   └── default.conf         # Serves frontend container at the VMs IP address
 │   │
+│   ├── .env                     # Shared .env
+│   ├── .env.deploy              # Environment variables built by deploy_app.sh
 │   ├── docker-compose.yml       # Starts up all of the containers
 │   └── ...
 │
 ├── deployment-files/            # Untracked files downloaded from GCS bucket by deploy_app.sh
+│   ├── .env
 │   ├── models/      
+│   │   ├── new_LSA.csv
+│   │   ├── stanford-parser-4.2.0-models.jar
+│   │   └── Phi-3_finetuned.gguf
 │   │
 │   ├── logs/        # For backend log output
 │   └── ... 
 │
 └── deploy_app.sh    # Script to set everything up
```


<br><hr>

# Misc. Notes
* The docker extends stuff documentation (later might want to do include or something)
    - https://docs.docker.com/compose/how-tos/multiple-compose-files/extends/ 
    - https://docs.docker.com/compose/how-tos/multiple-compose-files/include/ 





