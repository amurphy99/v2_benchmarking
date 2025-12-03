// All TypeScript interfaces
// Types mirror Django DB models/what the serializers return for them.

// =======================================================================
// Misc. Models
// =======================================================================
export interface UserSettings {
  patientViewOverall: boolean;
  patientCanSchedule: boolean;
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

export interface Profile {
  id        : number;
  plwd      : User;
  caregiver : User;
  role?     : "Patient" | "Caregiver";
  settings  : UserSettings;
  goal      : Goal;
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

  topics    : string[];        // stored as JSONField
  sentiment : number | null;
  notes     : string | null;

  messages        : ChatMessage[];
  biomarkers      : ChatBiomarkerScore[];
  average_scores? : Record<string, number>;
}

// =======================================================================
// Signup Types -- ToDo: Not sure if these are ncessary?
// =======================================================================
export interface SignupPayload {
  plwdUsername  : string;
  plwdPassword  : string;
  plwdFirstName : string;
  plwdLastName  : string;

  caregiverUsername  : string;
  caregiverPassword  : string;
  caregiverFirstName : string;
  caregiverLastName  : string;
}

export interface SignupResponse {
  success           : true;
  plwdUsername      : string;
  caregiverUsername : string;
}

// User verification token
export type Tokens = { access: string; refresh: string, user: User };
