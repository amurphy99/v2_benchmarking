import GoalForm from "./components/GoalForm";
import ChatTypeForm from "./components/ChatTypeForm";

export function Settings() {
    // --------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------
    return (
    <div className="m-[1rem]">
        <GoalForm />
        <ChatTypeForm />
    </div>
    );
}