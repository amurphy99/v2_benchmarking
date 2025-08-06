import PerformanceTrack from "./components/PerformanceTrack";
import WeeklyChats from "./components/WeeklyChats";

// Dashboard ("Speech Analysis" page)
export function Dashboard() {
    return (
    <div className="d-flex flex-col mx-[1rem] mb-[1rem]">  
        <PerformanceTrack/>
        <WeeklyChats/>
    </div>
    );
}
