import   ProgressBar   from "react-bootstrap/ProgressBar";
import { useAuth     } from "@/context/AuthProvider";
import { PATIENT_HEX } from "@/utils/styling/colors";

// Patient Goal Progress Bar
export default function GoalProgress () {
    const { profile } = useAuth();
    const current = profile.goal.current;
    const target  = profile.goal.target

    const percent = Math.round((current / target) * 100);
    const label   = `${current} / ${target}`;
    const bgColor = `background-color=${PATIENT_HEX}`;

    return  <ProgressBar variant={bgColor} now={percent} label={label} />;
}
