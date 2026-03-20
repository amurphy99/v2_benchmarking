import { useState    } from "react";
import { useNavigate } from "react-router-dom";
import   toast         from "react-hot-toast";

import { AccountRole, SignupPayload, signUpAccount } from "@/api";
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
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [role, setRole] = useState("");

    // Form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await signUpAccount({
                username: username,
                password: password,
                firstName: firstName,
                lastName: lastName,
                role: role
            });
            toast.success("Account created successfully!");
            login(username, password);
            navigate("/profile");
        } catch (err) { toast.error("Error creating account. Perhaps that username is already taken?");
        } finally     { setLoading(false); }
    };

    // Style
    const inputStyle = "p-2 border-1 border-gray-400 rounded-sm";
    const nameStyle  = `${inputStyle} input input-bordered w-1/2`; 
    const infoStyle  = `${inputStyle} input input-bordered w-full mt-2`;

    // --------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------
    return (
    <div className="mt-[1rem] md:mt-[3rem] ml-[1rem] md:ml-[3rem]">
        <h1>Cognibot</h1>
        <div className="flex justify-center">
            <div className="flex flex-row">
                <div className="w-0 md:w-1/3 mt-[3rem]">
                    <img src="/images/robot_face.png"></img>
                </div>
                <div className="flex flex-col w-full md:w-2/3 mb-[2rem] text-center">
                    <h1 className="mb-0">Great!</h1>
                    <h1 className="mb-0">Let's Get Started.</h1>
                    <h2 className="my-2">Sign Up</h2>
                    <form onSubmit={handleSubmit} className="flex flex-col px-[2rem]" id="signup">

                    <div className="flex flex-col gap-1">
                        <div className="flex gap-2">
                            <input required name="firstName" placeholder="First name" value={firstName} 
                                onChange={(e) => setFirstName(e.target.value)} className={nameStyle}/>
                            <input required name="lastName"  placeholder="Last name"  value={lastName} 
                                onChange={(e) => setLastName(e.target.value)} className={nameStyle}/>
                        </div>

                        <input required name="username" placeholder="Username" value={username} 
                            onChange={(e) => setUsername(e.target.value)} className={infoStyle}/>
                        <input required type="password" name="password" placeholder="Password" value={password} 
                            onChange={(e) => setPassword(e.target.value)} className={infoStyle}/>
                        <select required name="role" value={role} onChange={(e) => setRole(e.target.value)} className={`${infoStyle} mt-2`}>
                            <option value="" disabled>Select your role</option>
                            <option value="caregiver">Caregiver</option>
                            <option value="family">Family Member</option>
                            <option value="physician">Physician</option>
                            <option value="other">Other</option>
                        </select>

                    </div>

                    {/* Submit Form */}
                    <button type="submit" disabled={loading} className="btn btn-primary caregiver-button my-[1rem]"> {loading ? "Creating..." : "Sign Up"} </button>

                </form>
                <p>Already have an account? <a className="hover:cursor-pointer caregiver-text" onClick={() => navigate("/login")}> Log In </a></p>

                </div>
            </div>
        </div>
    </div>
  );
}
