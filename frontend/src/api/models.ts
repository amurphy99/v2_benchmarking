/* TypeScript copies of what the REST serializers return.
--------------------------------------------------------------------------------
`@frontend/src/api/models`

Field names match the DRF serializers exactly: most are snake_case, and a few
models pass camelCase field names straight through (`UserSettings.modelChoice`).
Nothing checks these against the backend, so a serializer change updates this
file in the same change.

*/
// =======================================================================
// Misc. Models
// =======================================================================
export interface UserSettings {
  patientViewOverall: boolean;
  patientCanSchedule: boolean;
  taskType          : string;
  taskSubtype       : string;
  modelChoice       : string;
}

// Avatars a participant can be shown in the web app, in picker order (`UserSettings.MODEL_CHOICES` in `backend/chat_app/models.py`)
// Pickers list only the ones with an entry in `avatarRegistry.tsx` (`talkinghead` and `temp1`-`temp3` are reserved)
export const AVATAR_MODEL_CHOICES = ["smiley", "qt", "buddy", "talkinghead", "temp1", "temp2", "temp3"] as const;
export type  AvatarModelChoice    = (typeof AVATAR_MODEL_CHOICES)[number];

// Chat languages as BCP-47 tags (`Profile.LANGUAGE_CHOICES` in `backend/chat_app/models.py`)
export const LANGUAGE_CHOICES = [
    "en-US", "en-GB", "de-DE", "el-GR", "es-ES", "es-MX", "fr-FR", "it-IT", "nl-NL", "pl-PL",
    "pt-PT", "pt-BR", "tr-TR", "ru-RU", "ar-SA", "hi-IN", "ja-JP", "ko-KR", "zh-CN", "zh-TW",
] as const;
export type LanguageChoice = (typeof LANGUAGE_CHOICES)[number];

export interface Reminder {
  id         : number;
  title      : string;
  notes      : string | null;
  start      : string; 
  end        : string | null;
  startTime  : string; 
  endTime    : string; 
  daysOfWeek : number[]; // Sunday = 0 ... Saturday = 6 
}

export interface Goal {
  id         : number;
  target     : number;
  auto_renew : boolean;
  period     : "N" | "W" | "M";
  start_date : string;
  start_dow  : number; // Sunday = 0 ... Saturday = 6 
  current    : number;
  remaining  : number;
}
// =======================================================================
// RAG/Activity Instructions
// =======================================================================

export interface RAGInstructions {
    id               : number;
    name             : string;
    instructions     : string;
    description      : string;
    activity         : number; // PK of Activity
    instruction_order: number;
}

export interface CreateRAGInstructionsPayload {
    name             : string;
    instructions     : string;
    description      : string;
    instruction_order?: number;
}

export interface UpdateRAGInstructionsPayload {
    name?            : string;
    instructions     : string;
    description      : string;
    instruction_order?: number;
}

// =======================================================================
// Users & Profiles
// =======================================================================
export interface User {
  id         : number;
  username   : string;
  first_name : string;
  last_name  : string;
  is_staff   : boolean;
}

export type AccountRole = "patient" | "caregiver" | "family" | "physician" | "other";
export interface Account {
    id      : number;
    user    : User;
    role    : AccountRole;
}

export interface Profile {
  id                    : number;
  account               : Account;
  zipcode               : string;
  birthDate             : string;
  locationStatus        : string;
  save_audio_by_default : boolean;
  settings              : UserSettings;
  goal                  : Goal;
}

// One participant on the admin settings page (`AdminProfileSerializer`)
export interface AdminProfile {
    id                    : number;
    user                  : User;
    save_audio_by_default : boolean;             // Whether each new chat starts with its audio set to be saved
    run_biomarkers        : boolean;             // Whether their chats are scored for biomarkers (read as each chat starts)
    placeholder_flag      : boolean;             // Spare switch that nothing reads yet
    language              : LanguageChoice;      // Language their chats will use (not read by the backend yet)
    modelChoice           : AvatarModelChoice;   // Avatar their web chat page shows
    chat_count            : number;              // Chats so far (demo sessions left out)
    last_chat_at          : string | null;       // Start of the latest of those chats (null before the first)
    password_from_env     : boolean;             // Startup resets their password from the server's .env (staff can't change it here)
}

// Settings staff and caregivers can change for one participant (any of them may be sent alone; a password only by staff)
export type UpdateAdminProfilePayload = Partial<Pick<AdminProfile, "save_audio_by_default" | "run_biomarkers" | "placeholder_flag" | "language" | "modelChoice">> & {password?: string};

// --------------------------------------------------------------------------------
// Admin Accounts
// --------------------------------------------------------------------------------
// One participant linked to a caregiver (`LinkedParticipantSerializer`; `id` is the profile ID)
export interface LinkedParticipant {
    id   : number;
    user : User;
}

// One caregiver on the admin accounts page (`AdminCaregiverSerializer`)
export interface AdminCaregiver {
    id           : number;                // Account ID
    user         : User;
    participants : LinkedParticipant[];   // Oldest link first (the first is what the caregiver pages show)
}

// A caregiver's whole new set of linked participants (profile IDs), and a new password when one was typed
export type UpdateCaregiverPayload = {participant_ids: number[]; password?: string};

// Kinds of login staff can create
export type NewAccountRole = "patient" | "caregiver";

// A new login created by staff (`AdminCreateAccountSerializer`)
export interface CreateAccountPayload {
    username   : string;
    password   : string;
    first_name : string;
    last_name  : string;
    role       : NewAccountRole;
}

export interface Access {
    id      : number;
    account : Account;
    profile : Profile;
}

// =======================================================================
// ChatSession Related Models
// =======================================================================
// Messages
export type ChatRole = "user" | "assistant";

export interface ChatWord {
  id         : number;
  word       : string;
  start_ts   : string;
  end_ts     : string;
  index      : number;
  confidence?: number | null;
}

export interface ChatMessage {
  id         : number;
  role       : ChatRole;
  content    : string;
  ts         : string;
  start_ts ? : string | null;
  end_ts   ? : string | null;
  words    ? : ChatWord[];
}

// Biomarkers (string fallback for unknown score types)
export type BiomarkerType =
  | "AlteredGrammar"
  | "Anomia"
  | "Pragmatic"
  | "Pronunciation"
  | "Prosody"
  | "Turntaking"
  | "Perplexity"
  | string;
export interface ChatBiomarkerScore {
  id         : number;
  score_type : BiomarkerType;
  score      : number;
  ts         : string;
  message?   : number | null;
  start_ts?  : string | null;
  end_ts?    : string | null;
}

export interface AlbumImage {
    id              : number;
    topic           : string;
    url             : string;
    photographer    : string;
    photographer_url: string;
}

export interface SessionAudio {
  storage_backend  : "local" | "gcs";
  started_at       : string | null;
  sample_rate      : number | null;
  channels         : number | null;
  bits_per_sample  : number | null;
  duration_seconds : number | null;
  size_bytes       : number | null;
  sha256           : string | null;
  created_at       : string;
}

// ChatSessions
export interface ChatSession {
  id        : number;
  profile   : Profile;
  source    : string;
  date      : string;
  is_active : boolean;

  start_ts       : string;
  end_ts         : string | null;
  duration       : number;         // in seconds
  audio          : SessionAudio | null;

  topics    : string[] | null;
  image     : AlbumImage;
  sentiment : "Very Positive" | "Positive" | "Neutral" | "Negative" | "Very Negative" | "N/A" | string;
  emotion   : string | null;
  notes     : string | null;
  summary   : string | null;

  risk_level    : number;
  risk_quotes   : string[];
  risk_reason   : string;

  taskType      : string;
  taskSubtype   : string | null;

  chat_type     : string;          // Harness that ran ("" on sessions from before chat types were recorded)
  condition     : string;          // Its cue set ("" for none)
  variant       : string;          // Its task content ("" for none)

  messages        : ChatMessage[];
  biomarkers      : ChatBiomarkerScore[];
  average_scores  : Record<string, number>;
}

// =======================================================================
// Map Task maps (`backend/chat_app/websocket/harnesses/map_task/maps.py`:
// `giver_view`, `follower_view`, and `map_file_previews`)
// =======================================================================
// A point on a Map Task map: 0-1 across and down from its top-left, as the avatar reads it
export type MapPoint = [number, number];

// The paper a Map Task map is on: wide, or tall (the HCRC corpus's maps)
export type MapShape = "landscape" | "portrait";

// One landmark as a map draws it
export interface MapTaskLandmark {
    id     : string;     // The same on both maps
    label  : string;     // What this map calls it
    icon   : string;     // Picture name (`components/map_task/mapTaskIcons.ts`)
    at     : MapPoint;   // Its center
    radius : number;     // How far it reaches from its center, in map widths
}

// The participant's map: its paper, its landmarks, and the route from the start to the finish
export interface MapTaskGiverMap {
    shape     : MapShape;
    landmarks : MapTaskLandmark[];
    route     : MapPoint[];   // The first point is the start, the last the finish
}

// The avatar's map: its paper, its landmarks, and where it starts
export interface MapTaskFollowerMap {
    shape     : MapShape;
    landmarks : MapTaskLandmark[];
    start     : MapPoint;
}

// One map file in the staff preview (`error` instead of its maps when it doesn't load)
export interface MapTaskMapFile {
    variant    : string;                      // The file's name, which a client picks it by
    registered : boolean;                     // Listed in `MAP_TASK_VARIANTS`, so clients can pick it
    error      : string | null;               // Why it doesn't load (null when it does)
    giver      : MapTaskGiverMap    | null;
    follower   : MapTaskFollowerMap | null;
}

// =======================================================================
// Auth
// =======================================================================
// User verification token
export type Tokens = { access: string; refresh: string, user: User };

export interface Download {
    fileName            : string;
    fileContents        : string;
}

// Private task history from /api/chatsession/<id>/task-history/ (staff and linked caregivers)
export type MapTaskHistory = {
    kind     : "map_task";
    giver    : MapTaskGiverMap;
    follower : MapTaskFollowerMap;
    path     : MapPoint[] | null;
    position : MapPoint | null;
};

// Planning choices retain pending proposals and refusals, separately from agreements
export type PlanningItemHistory = {
    id    : string;
    label : string;
    state : {
        agreed      : string | null;
        settling    : {choice: string; by: "user" | "avatar"} | null;
        suggestions : {choice: string; by: "user" | "avatar"}[];
        refused     : {choice: string; by: "user" | "avatar"; reason: string}[];
    } | null;
};

// The scenario and both sides' constraints are private task materials
export type PlanningTaskHistory = {
    kind                    : "cooperative_planning";
    title                   : string;
    event                   : string;
    participant_constraints : string[];
    avatar_constraints      : string[];
    stage                   : "planning" | "final_check" | "approved" | null;
    items                   : PlanningItemHistory[];
    user_wants              : string[];
    user_avoids             : string[];
};

// Unsaved older sessions may show current variant materials, without historical outcomes
export type SessionTaskHistory = {recorded: boolean; view: MapTaskHistory | PlanningTaskHistory | null};
