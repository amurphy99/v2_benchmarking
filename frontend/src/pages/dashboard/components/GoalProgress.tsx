import   ProgressBar   from "react-bootstrap/ProgressBar";
import { useAuth     } from "@/context/AuthProvider";
import { useGoal } from "@/hooks/queries/useGoal";
import { Spinner } from "react-bootstrap";

// Patient Goal Progress Bar
export default function GoalProgressBar () {
    const { data: goal, isLoading } = useGoal();
    if (isLoading) {
        return <Spinner />
    }
    const current = goal.current;
    const target  = goal.target

    const percent = Math.round((current / target) * 100);

    return (
        <div className="d-flex flex-col mb-[0.5rem] gap-[0.25rem]">
            <div className="d-flex">
                <span className="fw-semibold">Weekly Chat Goal</span>
                <span className="ml-auto">{`${current} / ${target}`}</span>
            </div>

            <ProgressBar striped variant="info" now={percent}/>
        </div>
    );  
}
