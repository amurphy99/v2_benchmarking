import { useState } from "react";
import { useAuth  } from "@/context/AuthProvider";
import { h3       } from "@/utils/styling/sharedStyles";

import ScoreTrackGraph from "./ScoreTrackGraph";
// ToDo: Biomarker graph

import GoalProgress from "./GoalProgress";

// ====================================================================
// Performance Track Panel (shown on Dashboard)
// ====================================================================
export default function PerformanceTrack() {
    const { profile         } = useAuth();
    const [active, setActive] = useState<"Overall" | "Biomarkers">("Overall");

    // Return the UI component
    const outerStyle = "my-[1rem] gap-[1rem] rounded-lg border-1 border-gray-300 p-[1rem] grid md:grid-cols-2 grid-cols-1 gap-4 md:min-h-[40vh]";
    return (
    <div className={outerStyle}>
        <div>
            {/* Title & Chart Selection Buttons */}
            <span className="flex gap-4">
                <span className={h3}> Performance Track: </span>
                <button onClick={() => setActive("Overall")}    className={linkCls(active === "Overall"   )}>Overall   </button>
                <button onClick={() => setActive("Biomarkers")} className={linkCls(active === "Biomarkers")}>Biomarkers</button>
            </span>

            {/* Text Section */}
            <div className="d-flex flex-col mt-[1rem] gap-[0.5rem] fs-6">
                <GoalProgress/>
                <p className="fst-italic"><b>ToDo:</b> "Biomarkers chart" with individual selection; automatic performance evaluation in the paragraphs below.</p>
                <p>Good days: A list of days with higher biomarker scores.</p>
                <p>Bad days: A list of days with lower biomarker scores.</p>
            </div>
        </div>

        {/* Chart Section */}
        <div className="h-[40vh]">
            {active === "Overall"    && <ScoreTrackGraph/>}
            {active === "Biomarkers" && <ScoreTrackGraph />}
        </div>
    </div>
    );
}

// Helper for link styling
function linkCls(active: boolean) {
    return active
        ? "text-xl text-violet-600 underline hover:text-purple-900"
        : "text-xl text-gray-400 hover:text-gray-600 hover:underline";
}
