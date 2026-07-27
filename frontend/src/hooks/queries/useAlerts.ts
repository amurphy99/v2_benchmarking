import { ChatSession } from "@/api";
import { useModelQuery } from "./common";
import { listSessionAlerts } from "@/api/endpoints/alerts";

export const useSessionAlerts = (active: number = 0, demo: number = 2) =>
    useModelQuery<ChatSession[]>({
        queryKey: "chatSessions",
        queryFn : () => listSessionAlerts(active, demo),
        empty   : [],
    });