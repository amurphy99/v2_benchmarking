// All TypeScript interfaces
// Types mirror Django DB models/what the serializers return for them.

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

export interface RAGInstructions {
    id          : number;
    name        : string;
    instructions: string;
    description : string;
    user        : number; // PK of user
    activity    : number; // PK of Activity
}

export interface CreateRAGInstructionsPayload {
    name        : string;
    instructions: string;
    description : string;
}

export interface UpdateRAGInstructionsPayload {
    name?: string;
    instructions: string;
    description : string;
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
  id        : number;
  account   : Account;
  zipcode   : string;
  birthDate : string;
  locationStatus : string;
  settings  : UserSettings;
  goal      : Goal;
}

export interface Access {
    id      : number;
    account : Account;
    profile : Profile;
}

export interface CreateAccessPayload {
    profileId   : number;
    accountId   : number;
    permissions : string;
}

// =======================================================================
// ChatSession Related Models
// =======================================================================
// Messages
export type ChatRole = "user" | "assistant";
export interface ChatMessage {
  id        : number;
  role      : ChatRole;
  content   : string;
  ts        : string; 
  start_ts? : string | null;
  end_ts?   : string | null;
}

// Biomarkers (string fallback for unknown score types)
export type BiomarkerType =
  | "AlteredGrammar"
  | "Anomia"
  | "Pragmatic"
  | "Pronunciation"
  | "Prosody"
  | "Turntaking"
  | string; 
export interface ChatBiomarkerScore {
  id         : number;
  score_type : BiomarkerType;
  score      : number;
  ts         : string;
}

export interface AlbumImage {
    id              : number;
    topic           : string;
    url             : string;
    photographer    : string;
    photographer_url: string;
}

// ChatSessions
export interface ChatSession {
  id        : number;
  user      : number; // ForeignKey id
  source    : string;
  date      : string;
  is_active : boolean;

  start_ts  : string;
  end_ts    : string | null;
  duration? : number;          // in seconds

  topics    : string;        // stored as an unparsed list string
  image     : AlbumImage;
  sentiment : "Positive" | "Negative" | "Neutral" | "N/A" | null;
  notes     : string | null;

  taskType  : string;
  taskSubtype: string | null;

  messages        : ChatMessage[];
  biomarkers      : ChatBiomarkerScore[];
  average_scores? : Record<string, number>;
}

// =======================================================================
// Signup Types -- ToDo: Not sure if these are ncessary?
// =======================================================================

export interface SignupPayload {
  username      : string;
  password      : string;
  firstName     : string;
  lastName      : string;
  role          : string;
}

export interface SignupResponse {
  success       : true;
  username      : string;
  name          : string;
}

// User verification token
export type Tokens = { access: string; refresh: string, user: User };

export interface Download {
    fileName            : string;
    fileContents        : string;
}