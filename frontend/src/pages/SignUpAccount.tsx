import { useState    } from "react";
import { useNavigate } from "react-router-dom";
import   toast         from "react-hot-toast";

import { SignupPayload, signUpAccount } from "@/api";
import { h3                    } from "@/utils/styling/sharedStyles";
import { useAuth } from "@/context/AuthProvider";


// ====================================================================
// Signup
// ====================================================================
// Doesn't login automatically -- we don't know if we are the caregiver or patient.
export default function SignUpPatient() {
    const navigate = useNavigate();
    const {login} = useAuth();
    const [loading, setLoading] = useState(false);
    
    // Local form state
    const [formData, setFormData] = useState<SignupPayload>({
        username: "",      password: "",      firstName: "",      lastName: "",
    });
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => { setFormData({ ...formData, [e.target.name]: e.target.value }); }

    // Form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await signUpAccount(formData);
            toast.success("Account created successfully!");
            login(formData.username, formData.password);
            navigate("/profile");
        } catch (err) { toast.error((err as Error).message);
        } finally     { setLoading(false); }
    };

    // Style
    const inputStyle = "p-2 border-b-1 border-gray-400 ";
    const nameStyle  = `${inputStyle} input input-bordered w-1/2`; 
    const infoStyle  = `${inputStyle} input input-bordered w-full mt-2`;

    // --------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------
    return (
    <div className="flex flex-col h-[100vh] justify-center items-center">
        <h1 className="font-mono text-lg"> CogniBot Sign Up </h1>
        <form onSubmit={handleSubmit} className="flex flex-col border-1 border-gray-400 rounded-lg p-[2rem] gap-[2rem] md:w-1/2" id="signup">

            {/* Account fields */}
            <div className="flex flex-col gap-1">
                <div className="flex gap-2">
                    <input required name="firstName" placeholder="First name" value={formData.firstName} 
                        onChange={handleChange} className={nameStyle}/>
                    <input required name="lastName"  placeholder="Last name"  value={formData.lastName } 
                        onChange={handleChange} className={nameStyle}/>
                </div>

                <input required                 name="username" placeholder="Username" value={formData.username} 
                    onChange={handleChange} className={infoStyle}/>
                <input required type="password" name="password" placeholder="Password" value={formData.password} 
                    onChange={handleChange} className={infoStyle}/>

            </div>

            {/* Submit Form */}
            <button type="submit" disabled={loading} className="btn btn-primary caregiver-button"> {loading ? "Creating..." : "Sign Up"} </button>

        </form>
        
        <p>Already have an account? <a className="hover:cursor-pointer caregiver-text" onClick={() => navigate("/login")}> Log In </a></p>

    </div>
  );
}
