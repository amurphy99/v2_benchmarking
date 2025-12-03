import { useState, ChangeEvent, FormEvent } from "react";
import   toast         from "react-hot-toast";  
import { useNavigate } from "react-router-dom";
import { useAuth     } from "@/context/AuthProvider";

interface FormState {username: string; password: string;}

export default function Login() {
    const { login } = useAuth();
    const navigate  = useNavigate();

    const [form,    setForm   ] = useState<FormState>({ username: "", password: "" });
    const [loading, setLoading] = useState(false); // ToDo: I think I need to implement this somehow

    const handleChange = (e: ChangeEvent<HTMLInputElement>) =>
        setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            await login(form.username, form.password);
            toast.success("Logged in!"); navigate("/dashboard");
        } catch (err) { toast.error((err as Error).message); console.log((err as Error).message);
        } finally     { setLoading(false); }
    };

    const loginStyle = "p-2 border-b-1 border-gray-400";
    
    // Return UI Component
    return (
    <form onSubmit={handleSubmit}>
        <div className="flex flex-col h-[100vh] justify-center items-center  ">
       
            <h1 className="font-mono text-lg">AI Assistant Chat</h1>

            <div className="flex flex-col gap-2 border-1 border-gray-400 rounded-lg p-4 md:w-1/2">
                <label>Username</label><input required autoComplete="username"                          name="username" value={form.username} onChange={handleChange} className={loginStyle}/>
                <label>Password</label><input required autoComplete="current-password" type="password"  name="password" value={form.password} onChange={handleChange} className={loginStyle}/>

                <button type="submit" className="btn btn-primary"> Log In </button>
            </div>

            <p>Don't have an account? <a className="hover:cursor-pointer" onClick={() => navigate("/signup")}>Sign Up</a></p>

        </div>
    </form>
    );
}
