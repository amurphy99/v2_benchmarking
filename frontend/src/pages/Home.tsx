import { NavLink } from "react-router-dom";

export default function Home() {
    return (
        <div className="p-[1rem]">
            <h1>Welcome to CogniBot!</h1>
            <div className="flex justify-center mt-[3rem]">
                <div className="grid grid-cols-1 gap-2 w-1/2">
                    <h1 className="place-self-center">Choose your profile</h1>
                    <NavLink className="place-self-center w-full" to="/signup">
                        <button className="btn btn-primary w-full caregiver-button">I am A Caretaker</button>
                    </NavLink>
                    <NavLink className="place-self-center w-full" to="/signup-patient">
                        <button className="btn btn-primary w-full patient-button">I am a Person Living with Dementia</button>
                    </NavLink>
                    <NavLink className="place-self-center w-full" to="/login">
                        <button className="btn btn-primary w-full">I Already Have An Account</button>
                    </NavLink>
                </div>
            </div>
        </div>
    );
}