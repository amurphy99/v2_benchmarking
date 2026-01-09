import { NavLink } from "react-router-dom";

export default function Home() {
    const btnStyle = "btn btn-primary w-full p-[1rem] text-xl font-bold"
    return (
        <div className="p-[3rem]">
            <h1>Welcome</h1>
            <div className="flex justify-center mt-[5rem]">
                <div className="flex flex-row">
                    <div className="w-0 md:w-1/3">
                        <img src="/images/robot_face.png"></img>
                    </div>
                    <div className="flex flex-col gap-4 w-full md:w-2/3 mb-[2rem]">
                        <h1 className="place-self-center text-center">Choose your profile</h1>
                        <NavLink className="place-self-center w-full" to="/signup">
                            <button className={`${btnStyle} caregiver-button`}>I am A Caretaker</button>
                        </NavLink>
                        <NavLink className="place-self-center w-full" to="/signup-patient">
                            <button className={`${btnStyle} patient-button`}>I am a Person Living with Dementia</button>
                        </NavLink>
                        <NavLink className="place-self-center w-full" to="/login">
                            <button className={`${btnStyle}`}>I Already Have An Account</button>
                        </NavLink>
                    </div>
                </div>
                
            </div>
        </div>
    );
}