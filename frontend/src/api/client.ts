/* Fetch wrapper for every REST call, with the JWT attached.
--------------------------------------------------------------------------------
`@frontend/src/api/client`

A failed request throws an `Error` whose message is DRF's own explanation when
the backend sent one (such as "username: Username already exists."), so the
toasts that show it tell the user what to fix.

*/
import { getAccess } from "@/context/AuthProvider";
import { API_URL } from "../utils/constants";
import { refreshToken } from "./auth";

// --------------------------------------------------------------------------------
// Fetch/request wrapper with token auto-refresh
// --------------------------------------------------------------------------------
export async function request<T> (path: string, opts: RequestInit={}): Promise<T> {
    // Define the fetch call so it can be wrapped with a retry
    const access = getAccess();
    const doFetch = (token = access) => 
        fetch(`${API_URL}${path}`, {
            ...opts,
            headers     : {...(opts.headers || {}), "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }),},
            credentials : "include", // send refresh cookie
        });

    // First try
    let response = await doFetch();
    
    // If it fails... (401 => unauthorized access)
    // if (response.status === 401) {
    //     // Try to refresh the access token before trying again
    //     try {
    //         const r = await refreshToken(access);
	// 		setAccess(r.access);
	// 		response = await doFetch(r.access); // retry with fresh token
    //     } catch (err: Error | unknown) {
    //         console.error("Token refresh failed: ", err);
    //         setAccess(undefined);
    //     }
    // }

    // 204 No Content => just return undefined (added for delete operations)
    if (response.status === 204) {
        return undefined as T;
    }

    // It failed again...
    if (!response.ok) throw new Error(await errorMessage(response));

    // Received response; return
    return response.json() as Promise<T>;
}

// --------------------------------------------------------------------------------
// Message for a failed request: DRF's error body when it sent JSON, else the HTTP status text
// --------------------------------------------------------------------------------
async function errorMessage(response: Response): Promise<string> {
    // Django's own error pages (a 500) are HTML, not JSON
    const isJson = (response.headers.get("Content-Type") ?? "").includes("application/json");
    if (!isJson) return response.statusText;

    // `{"detail": "..."}` for most errors; `{"field": ["..."]}` for validation errors
    const body = await response.json() as Record<string, unknown>;
    if (typeof body.detail === "string") return body.detail;
    return Object.entries(body).map(([field, errors]: [string, unknown]) => `${field}: ${[errors].flat().join(" ")}`).join("; ");
}
