import { useAuth } from "@/context/AuthProvider";

export default function GoalProgress ( {current, target} : {current: number, target: number}) {
    const { account } = useAuth();

    const percent = Math.min(Math.round((current / target) * 100), 100);

    return (
        <div className={`${account.role}-text`}>
            <div className="h-[2rem] rounded-full w-full bg-white border-gray-500 border-2 border-solid">
                <div className={`${account.role}-bg h-full rounded-full`} style={{width: `${percent}%`}}>
                </div>
            </div>
            <h2 className="text-black w-full text-center">{current} / {target} </h2>
        </div>
    )
}
