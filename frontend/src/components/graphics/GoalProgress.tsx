import { useAuth } from "@/context/AuthProvider";

export default function GoalProgress ( {current, target} : {current: number, target: number}) {
    const { account } = useAuth();

    const percent = Math.min(Math.round((current / target) * 100), 100);

    return (
        <div className={`${account.role}-text h-[2rem] flex flex-row items-center justify-between pb-2`}>
            <div className="h-full w-[95%] rounded-full bg-white border-gray-500 border-2 border-solid">
                <div className={`${account.role}-bg h-full rounded-full`} style={{width: `${percent}%`}}>
                </div>
            </div>
            <p className="h-full text-black font-bold text-xl align-middle mb-0">{current} / {target} </p>
        </div>
    )
}
