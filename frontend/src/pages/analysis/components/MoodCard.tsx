import WeeklyMoods from "@/components/graphics/WeeklyMoods";
import { useAuth } from "@/context/AuthProvider";
import { ChatWeek } from "@/utils/functions/getChatWeeks";
import { blockStyle } from "@/utils/styling/sharedStyles";

export default function MoodCard( { week } : { week: ChatWeek}) {
    const {user, profile} = useAuth();
    const role = profile.account.user.id == user.id ? "patient" : "caregiver";

    return (
        <div className={`${blockStyle}`}>
            <h2 className={`${role}-text mb-0`}>Mood Analysis</h2>
            <p className="text-lg mt-[1rem]">Here would be an analysis of { role == "caregiver" ? profile.account.user.first_name + "'s" : "your"} mood along with advice. </p>
            <WeeklyMoods week={week} />
        </div>
    )
}