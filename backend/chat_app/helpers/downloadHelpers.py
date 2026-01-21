from django.forms.models import model_to_dict

from ..models import Profile, Goal, UserSettings, Reminder, ChatSession, ChatMessage, ChatBiomarkerScore


def get_download_data(profile: Profile):
    user = profile.plwd
    goal = Goal.objects.get(user=profile)
    settings = UserSettings.objects.get(user=profile)
    reminders = Reminder.objects.filter(user=profile)
    chat_sessions = ChatSession.objects.filter(user=user).order_by("-date")

    data_str = f"""{user.first_name} {user.last_name}'s data
    
    {format_profile(profile)}
    
    {format_goal(goal)}
    
    {format_settings(settings)}
    
    {format_reminders(reminders)}
    
    {format_sessions(chat_sessions)}"""
    return data_str

def format_profile(profile: Profile):
    user = profile.plwd
    caregiver = profile.caregiver
    profile_str = f"""
    =========================================================
                        Profile Information
    =========================================================
    Patient: {user.first_name} {user.last_name}
    Primary Caregiver: {caregiver.first_name} {caregiver.last_name}
    Other Linked Users:
    """
    return profile_str

def format_goal(goal: Goal):
    goal_str = f"""
    =========================================================
                            User Goal   
    =========================================================
    Current: {goal.current}
    Target: {goal.target} 
    Period: {goal.period} 
    Start date: {goal.start_date} 
    Auto Renews?: {goal.auto_renew}
    """
    return goal_str
    
def format_settings(settings: UserSettings):
    settings_str = f"""
    =========================================================
                         User Settings   
    =========================================================
    """
    settings_dict = model_to_dict(settings)
    for field in settings_dict:
        if field == 'id' or field == 'user':
            pass
        else:
            settings_str += f"""{field}: {settings_dict[field]}
        """
    return settings_str

def format_reminders(reminders):
    days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    reminders_str = """
    =========================================================
                            Reminders                       
    =========================================================
    """
    for reminder in reminders:
        reminders_str += f"""Title: {reminder.title}"
        Start: {reminder.start}T{reminder.startTime}
        End: {reminder.end}T{reminder.endTime}
        Repeats every {[days[day] for day in reminder.daysOfWeek]}
        """
    return reminders_str

# ChatSession formatting helpers
def format_messages(messages):
    messages_str = "            Messages:"
    for message in messages:
        messages_str += f"""
        {message.role}: {message.content} ({message.ts})"""
    return messages_str

def format_scores(scores):
    scores_str = "          Scores:"
    for score in scores:
        scores_str += f"""
        {score.score_type}: {score.score} ({score.ts})"""
    return scores_str

def format_session(session: ChatSession):
    messages = ChatMessage.objects.filter(session=session).order_by("ts")
    scores = ChatBiomarkerScore.objects.filter(session=session).order_by("ts")
    
    session_str = f"""
    Chat Session on {session.date} -- {session.end_ts} ({session.duration} seconds)
    Source: {session.source}
    Notes: {session.notes} 
    Topics: {session.topics} 
    Sentiment: {session.sentiment}
    {format_messages(messages)}
    {format_scores(scores)}
    """
    return session_str

def format_sessions(sessions):
    sessions_str = """
    =========================================================
                         Chat Sessions  
    =========================================================
    """
    for session in sessions:
        sessions_str += format_session(session)
    return sessions_str