import { API_URL } from "../utils/constants";

// API acess/authorization token
let access: string | undefined;
export const setAccess = (newToken?: string) => (access = newToken);
export const getAccess = () => { return access; };

// --------------------------------------------------------------------
// Fetch/request wrapper with token auto-refresh
// --------------------------------------------------------------------
export async function request<T> (path: string, opts: RequestInit={}): Promise<T> {
    // Define the fetch call so it can be wrapped with a retry
    const doFetch = (token = access) => 
        fetch(`${API_URL}${path}`, {
            ...opts,
            headers     : {...(opts.headers || {}), "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }),},
            credentials : "include", // send refresh cookie
        });

    // First try
    let response = await doFetch();
    
    // If it fails... (401 => unauthorized access)
    if (response.status === 401) {
        // Try to refresh the access token before trying again
        const r = await fetch(`${API_URL}/token/refresh/`, { method: "POST", credentials: "include", });
        if (r.ok) {const { access: newAccess } = (await r.json()) as { access: string }; setAccess(newAccess);
        response = await doFetch(newAccess); // retry with fresh token
        }
    }

    // It failed again...
    if (!response.ok) throw new Error(response.statusText);

    // Received response; return
    return response.json() as Promise<T>;
}
