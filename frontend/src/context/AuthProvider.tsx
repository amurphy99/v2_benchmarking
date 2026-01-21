import { createContext, useContext, useEffect, useState } from "react";
import { Spinner } from "../components/Spinner";

import { getAccess, setAccess, User, Profile, getProfile, Account } from "@/api"
import * as authApi  from "@/api/auth";
import { getAccount } from "@/api/endpoints/account";

// Create the context (describes what any component will get when it calls useAuth())
interface AuthCtx { 
    user?: User; 
    account?: Account,
    role: string,
    login(username: string, password: string): Promise<void>; 
    logout(): void; 
}

const AuthContext = createContext<AuthCtx>(null!);

// ====================================================================
// AuthProvider 
// ====================================================================
// Local state only holds User & Profile data
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user,    setUser   ] = useState<User   >();
    const [account, setAccount] = useState<Account>();
    const [role, setRole      ] = useState<string >("");
    const [error,   setError  ] = useState<string >(); 
    const [loading, setLoading] = useState(false);
    
    // Login
    const login  = async (username: string, password: string) => {
        try {
            // POST to /token/ & get Token/User information
            setLoading(true);
            const response = await authApi.login(username, password);  // { access, user }
            setAccess(response.access);
            setUser  (response.user  ); 
            localStorage.clear();
            localStorage.setItem('authTokens', JSON.stringify(response));
            
            // Fetch user account; blocks until the account returns and we have data to populate pages
            await getAccount().then((acc) => {
                setAccount(acc);
                if (acc.role.toLowerCase() == "patient") {
                    setRole("patient");
                } else {
                    setRole("caregiver");
                }
            }).catch(console.error);
        } catch (err) { 
            setError((err as Error).message); 
            console.log((err as Error).message); 
            throw err; // ToDo: Add toast back here
        } finally     { setLoading(false); }
    };

    const refreshAccess = async () => {
        const authTokens = JSON.parse(localStorage.getItem('authTokens'));
        if (!authTokens) {
            logout();
            return;
        }
        try {
            setLoading(true);
            const newAuthTokens = await authApi.refreshToken(authTokens.refresh);
            setUser(newAuthTokens.user);
            setAccess(newAuthTokens.access);
            localStorage.setItem('authTokens', JSON.stringify(newAuthTokens));
        } catch (err) {
            setError((err as Error).message); 
            console.log((err as Error).message);
            logout();
        } finally     { 
            try {
                await getAccount().then((acc) => {
                    setAccount(acc);
                    if (acc.role.toLowerCase() == "patient") {
                        setRole("patient");
                    } else {
                        setRole("caregiver");
                    }
                }).catch(console.error);
            } catch (err) {
                console.error("Error getting profile: ", err);
            } finally {
                setLoading(false); 
            }
        }
    }

    // Logout (reset the User and Profile to undefined)
    const logout = () => { 
        setAccess(undefined); 
        setUser(undefined); 
        setRole("");
        setAccount(undefined);
        localStorage.clear();
    };

    useEffect(() => {
		const initAuth = async () => {
            if (!getAccess()) {
				await refreshAccess();
			} else {
                await getAccount().then((acc) => {
                    setAccount(acc);
                    if (acc.role.toLowerCase() == "patient") {
                        setRole("patient");
                    } else {
                        setRole("caregiver");
                    }
                }).catch(console.error);
            }
			setLoading(false);
		};

		initAuth();
	}, []);

    // Return AuthContext
    return (
        <AuthContext.Provider value={{ user, account, role, login, logout }}>
            { loading ? <Spinner/> : children }
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
