import WeeklyMoods from "@/components/graphics/WeeklyMoods";
import { useAuth } from "@/context/AuthProvider";
import { useProfile } from "@/hooks/queries/useProfile";
import { ChatWeek } from "@/utils/functions/getChatWeeks";
import { blockStyleFull } from "@/utils/styling/sharedStyles";

export default function MoodCard( { week } : { week: ChatWeek}) {
    const role = useAuth().account.role;
    const {data: profile, isLoading} = useProfile();

    if (isLoading) {
        return null;
    }

    return (
        <div className={`${blockStyleFull}`}>
            <h2 className={`${role}-text mb-0`}>Mood Analysis</h2>
            <p className="text-lg mt-[1rem]">Here would be an analysis of { role == "caregiver" ? profile.account.user.first_name + "'s" : "your"} mood along with advice. </p>
            <WeeklyMoods week={week} />
        </div>
    )
}