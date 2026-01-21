import { useState    } from "react";
import { useNavigate } from "react-router-dom";
import   toast         from "react-hot-toast";

import { SignupPayload, signUp } from "@/api";
import { h3                    } from "@/utils/styling/sharedStyles";


// ====================================================================
// Signup
// ====================================================================
// Doesn't login automatically -- we don't know if we are the caregiver or patient.
export default function SignUp() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    
    // Local form state
    const [formData, setFormData] = useState<SignupPayload>({
             plwdUsername: "",      plwdPassword: "",      plwdFirstName: "",      plwdLastName: "",
        caregiverUsername: "", caregiverPassword: "", caregiverFirstName: "", caregiverLastName: "",
    });
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => { setFormData({ ...formData, [e.target.name]: e.target.value }); }

    // Form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await signUp(formData);
            toast.success("Account created - you can now log in.");
            navigate("/login");
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
        <h1 className="font-mono text-lg"> AI Assistant Chat </h1>
        <form onSubmit={handleSubmit} className="flex flex-col border-1 border-gray-400 rounded-lg p-[2rem] gap-[2rem] md:w-1/2" id="signup">

            {/* Caregiver Fields */}
            <div className="flex flex-col gap-1">
                <span className={h3}> Caregiver </span>

                <div className="flex gap-2">
                    <input required name="caregiverFirstName" placeholder="First name" value={formData.caregiverFirstName} onChange={handleChange} className={nameStyle}/>
                    <input required name="caregiverLastName"  placeholder="Last name"  value={formData.caregiverLastName } onChange={handleChange} className={nameStyle}/>
                </div>

                <input required                 name="caregiverUsername" placeholder="Username" value={formData.caregiverUsername} onChange={handleChange} className={infoStyle}/>
                <input required type="password" name="caregiverPassword" placeholder="Password" value={formData.caregiverPassword} onChange={handleChange} className={infoStyle}/>

            </div>
        
            {/* Patient Fields */}
            <div className="flex flex-col gap-1">
                <span className={h3}> Patient </span>

                <div className="flex gap-2">
                    <input required name="plwdFirstName" placeholder="First name" value={formData.plwdFirstName} onChange={handleChange} className={nameStyle}/>
                    <input required name="plwdLastName"  placeholder="Last name"  value={formData.plwdLastName } onChange={handleChange} className={nameStyle}/>
                </div>

                <input required                 name="plwdUsername" placeholder="Username" value={formData.plwdUsername} onChange={handleChange} className={infoStyle}/>
                <input required type="password" name="plwdPassword" placeholder="Password" value={formData.plwdPassword} onChange={handleChange} className={infoStyle}/>

            </div>

            {/* Submit Form */}
            <button type="submit" disabled={loading} className="btn btn-primary"> {loading ? "Creating..." : "Sign Up"} </button>

        </form>
        
        <p>Already have an account? <a className="hover:cursor-pointer" onClick={() => navigate("/login")}> Log In </a></p>

    </div>
  );
}
