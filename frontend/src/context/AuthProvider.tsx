/* Logged-in account state, with login, logout, and the startup token check.
--------------------------------------------------------------------------------
`@frontend/src/context/AuthProvider`

`loading` covers only the startup token check, when the whole app waits behind
a spinner. A login keeps the current page mounted, and the login page shows the
outcome itself.

*/
import { createContext, useContext, useEffect, useState } from "react";

// From this project
import { Spinner    } from "../components/Spinner";
import { Account    } from "@/api"
import { getAccount } from "@/api/endpoints/account";
import * as authApi   from "@/api/auth";

// Create the context (describes what any component will get when it calls useAuth())
interface AuthCtx { 
    account: Account,
    loading: boolean,
    login(username: string, password: string): Promise<void>; 
    logout(): void; 
    authComplete: boolean;
}

const AuthContext = createContext<AuthCtx>(null!);

export const getAccess = () => {
    const tokens = localStorage.getItem("authTokens");
    return tokens ? JSON.parse(tokens).access : null;
};

// ================================================================================
// AuthProvider 
// ================================================================================
// Local state only holds User & Profile data
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [account,      setAccount     ] = useState<Account>({} as Account);
    const [loading,      setLoading     ] = useState(false);
    const [authComplete, setAuthComplete] = useState(false);
    
    // Login (the login page shows the outcome toast, and stays mounted so a failed attempt keeps its inputs)
    const login  = async (username: string, password: string) => {
        // POST to /token/ & get Token/User information (a failure throws to the login page)
        const response = await authApi.login(username, password);  // { access, user }
        localStorage.removeItem('authTokens');
        localStorage.setItem('authTokens', JSON.stringify(response));
        
        // Fetch user account; blocks until the account returns and we have data to populate pages
        await getAccount().then(setAccount).catch(console.error);
    };

    const refreshAccess = async () => {
        const tokens = localStorage.getItem('authTokens');
        if (!tokens) { logout(); return; }

        const authTokens = JSON.parse(tokens);
        try {
            const newAuthTokens = await authApi.refreshToken(authTokens.refresh);
            localStorage.setItem('authTokens', JSON.stringify(newAuthTokens));
            await getAccount().then(setAccount).catch(console.error);
        } catch (err) {
            console.log((err as Error).message);
            logout();
        }
    }

    // Logout (reset the User and Profile to undefined)
    const logout = () => { 
        setAccount({} as Account);
        localStorage.removeItem('authTokens');
    };

    useEffect(() => {
		const initAuth = async () => {
            setLoading(true);
            try {
                if (!getAccess()) { await refreshAccess(); } 
                else              { await getAccount().then(setAccount).catch(console.error); }
            } catch (err) {
                console.log((err as Error).message);
                logout();
            } finally {
                setAuthComplete(true);
                setLoading(false);
            } 
		};

		initAuth();
	}, []);

    // Return AuthContext
    return (
        <AuthContext.Provider value={{ account, loading, login, logout, authComplete }}>
            { loading || account == undefined ? <Spinner/> : children }
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
