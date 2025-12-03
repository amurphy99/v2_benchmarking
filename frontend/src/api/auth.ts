import { API_URL } from "@/utils/constants";
import { Tokens  } from "./models"

// --------------------------------------------------------------------
// Login (gets access and refresh tokens)
// --------------------------------------------------------------------
export async function login(username: string, password: string): Promise<Tokens> {
    const response = await fetch(`${API_URL}/token/`, {
        method      : "POST",
        headers     : { "Content-Type": "application/json" },
        body        : JSON.stringify({ username, password }),
        credentials : "include",                                // let Django use cookies
    });
    if (!response.ok) throw new Error(response.statusText);
    return response.json();
}

// --------------------------------------------------------------------
// Refresh Access Tokens
// --------------------------------------------------------------------
export async function refreshToken(refresh: string): Promise<Tokens> {
    const response = await fetch(`${API_URL}/token/refresh/`, {
        method      : "POST",
        headers     : { "Content-Type": "application/json" },
        body        : JSON.stringify({ refresh }),
        credentials : "include",
    });
    if (!response.ok) throw new Error("Refresh failed");
    return response.json();
}
