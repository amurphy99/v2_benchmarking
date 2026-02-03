import { getAccess, useAuth } from "@/context/AuthProvider";
import { API_URL } from "../utils/constants";

// --------------------------------------------------------------------
// Fetch/request wrapper with token auto-refresh
// --------------------------------------------------------------------
export async function request<T> (path: string, opts: RequestInit={}): Promise<T> {
    // Define the fetch call so it can be wrapped with a retry
    const access = getAccess();
    const profileId = useAuth().profile?.id;
    const doFetch = (token = access) => 
        fetch(`${API_URL}/${profileId}/${path}`, {
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
    if (!response.ok) throw new Error(response.statusText);

    // Received response; return
    return response.json() as Promise<T>;
}
