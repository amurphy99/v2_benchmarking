import { ChatSession, request } from "..";

export const listSessionAlerts = (active: number = 0, demo: number = 2) => request<ChatSession[]>(`/alert-sessions/${active}/${demo}/`);
