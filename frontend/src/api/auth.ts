/* Login and token refresh calls to the JWT endpoints.
--------------------------------------------------------------------------------
`@frontend/src/api/auth`

`login` throws an `Error` whose message the login page shows as-is, so each kind
of failure gets its own wording.

*/
import { API_URL } from "@/utils/constants";
import { Tokens  } from "./models"

// --------------------------------------------------------------------
// Login (gets access and refresh tokens)
// --------------------------------------------------------------------
export async function login(username: string, password: string): Promise<Tokens> {
    // A network failure never reaches the server, so it has no status to report
    let response: Response;
    try {
        response = await fetch(`${API_URL}/token/`, {
            method      : "POST",
            headers     : { "Content-Type": "application/json" },
            body        : JSON.stringify({ username, password }),
            credentials : "include",                                // let Django use cookies
        });
    } catch {
        throw new Error("Could not reach the server.");
    }

    // 401 is the token endpoint's answer for a wrong username or password
    if (response.status === 401) throw new Error("Incorrect username or password.");
    if (!response.ok)            throw new Error(`Login failed (${response.statusText}).`);
    return response.json() as Promise<Tokens>;
}

// --------------------------------------------------------------------
// Refresh Access Tokens
// --------------------------------------------------------------------
export async function refreshToken(refresh: string): Promise<Tokens> {
    try {
        const response = await fetch(`${API_URL}/token/refresh/`, {
            method      : "POST",
            headers     : { "Content-Type": "application/json" },
            body        : JSON.stringify({ refresh }),
            credentials : "include",
        });
        if (!response.ok) throw new Error("Refresh failed");
        return response.json();
    } catch (error) {
        throw new Error("Token refresh failed.");
    }
}
