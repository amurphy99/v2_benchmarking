import { useAuth } from "@/context/AuthProvider";

export default function GoalProgress () {
    const { profile } = useAuth();
    const role = profile.role.toLowerCase();
    const current = profile.goal.current;
    const target  = profile.goal.target

    const percent = Math.round((current / target) * 100);

    return (
        <div className={`${role}-text`}>
            <div className="h-[2rem] rounded-full w-full bg-white border-gray-500 border-2 border-solid">
                <div className={`${role}-bg h-full rounded-full`} style={{width: `${percent}%`}}>
                </div>
            </div>
            <h2 className="text-black w-full text-center">{current} / {target} </h2>
        </div>
    )
}
