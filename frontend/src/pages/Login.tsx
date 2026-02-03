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
            toast.success("Logged in!"); 
            navigate("/profile-select");
        } catch (err) { 
            toast.error((err as Error).message); 
            console.log((err as Error).message);
        } finally     { 
            setLoading(false); 
        }
    };

    const loginStyle = "p-2 border-1 border-gray-400 rounded-sm";
    
    // Return UI Component
    return (
    <div className="mt-[1rem] md:mt-[3rem] ml-[1rem] md:ml-[3rem]">
        <h1>Cognibot</h1>
        <div className="flex justify-center mt-[5rem]">
            <div className="flex flex-row w-full">
                <div className="w-0 sm:w-1/3">
                    <img src="/images/robot_face.png"></img>
                </div>
                <div className="flex flex-col w-full sm:w-2/3 mb-[2rem] text-center">
                    <form onSubmit={handleSubmit}>
                        <div className="flex flex-col mt-[5em] justify-center items-center">
                            <h1>Welcome Back!</h1>
                            <h2>Log In</h2>
                            <div className="flex flex-col gap-2 p-4 w-3/4">
                                <input required autoComplete="username" placeholder="Username" name="username" value={form.username} onChange={handleChange} className={loginStyle}/>
                                <input required autoComplete="current-password" placeholder="Password" type="password"  name="password" value={form.password} onChange={handleChange} className={loginStyle}/>
                                <button type="submit" className="btn btn-primary"> Log In </button>
                            </div>
                            <p>Don't have an account? <a className="hover:cursor-pointer" onClick={() => navigate("/")}>Sign Up</a></p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
    );
}
