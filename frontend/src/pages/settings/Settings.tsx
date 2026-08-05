import GoalForm from "./components/GoalForm";
import ChatTypeForm from "./components/ChatTypeForm";
import RAGForm from "./components/RAGForm";

export function Settings() {
    // --------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------
    return (
    <div className="m-[1rem] pb-[5rem]">
        <GoalForm />
        <ChatTypeForm />
    </div>
    );
}