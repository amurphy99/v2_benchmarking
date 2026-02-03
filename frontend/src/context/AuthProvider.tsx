import { createContext, useContext, useEffect, useState } from "react";
import { Spinner } from "../components/Spinner";

import { Account, getProfile, Profile } from "@/api"
import * as authApi  from "@/api/auth";
import { getAccount } from "@/api/endpoints/account";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

// Create the context (describes what any component will get when it calls useAuth())
interface AuthCtx { 
    account?: Account;
    loading: boolean;
    profile?: Profile;
    setProfile?: (profile: Profile) => void;
    login(username: string, password: string): Promise<void>; 
    logout(): void; 
}

const AuthContext = createContext<AuthCtx>(null!);

export const getAccess = () => {
    const tokens = localStorage.getItem("authTokens");
    return tokens ? JSON.parse(tokens).access : null;
};

// ====================================================================
// AuthProvider 
// ====================================================================
// Local state only holds User & Profile data
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [account, setAccount] = useState<Account>();
    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState<Profile>();
    const navigate = useNavigate();
    
    // Login
    const login  = async (username: string, password: string) => {
        try {
            // POST to /token/ & get Token/User information
            setLoading(true);
            const response = await authApi.login(username, password);  // { access, user }
            localStorage.removeItem('authTokens');
            localStorage.setItem('authTokens', JSON.stringify(response));
            
            // Fetch user account; blocks until the account returns and we have data to populate pages
            await getAccount().then(setAccount).catch(console.error);
        } catch (err) { 
            console.log((err as Error).message); 
            throw err; // ToDo: Add toast back here
        } finally { 
            toast("Logged in!");
            setLoading(false); 
        }
    };

    const refreshAccess = async () => {
        const authTokens = JSON.parse(localStorage.getItem('authTokens'));
        if (!authTokens) {
            logout();
            return;
        }
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
        setAccount(undefined);
        localStorage.clear();
        navigate("/");
    };

    useEffect(() => {
		const initAuth = async () => {
            setLoading(true);
            try {
                if (!getAccess()) {
                    await refreshAccess();
                } else {
                    await getAccount().then(setAccount).catch(console.error);
                }
            } catch (err) {
                console.log((err as Error).message);
                logout();
            } finally {
                setLoading(false);
            } 
		};

		initAuth();
	}, []);

    // Return AuthContext
    return (
        <AuthContext.Provider value={{ account, loading, profile, setProfile, login, logout }}>
            { loading || account == undefined ? <Spinner/> : children }
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);