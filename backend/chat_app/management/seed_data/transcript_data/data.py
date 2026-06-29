"""
Static data constants for the seed_demo management command.
--------------------------------------------------------------------------------
`backend.chat_app.management.seed_data.transcript_data.data`
"""

USERNAMES = ("demo_patient", "demo_caregiver", "buddy_user", "buddy_care")

BIOMARKERS = ("alteredgrammar", "anomia", "pragmatic", "pronunciation", "prosody", "turntaking")

DEMO_MESSAGES = [
    "Hi, I'm the user.",
    "Hello, how are you today?",
    "I'm doing well, thank you!",
    "Can you tell me about your day?",
    "Sure. This morning I went for a walk.",
    "Did you enjoy your walk?",
    "Yes, I enjoyed my walk.",
]

DEMO_MESSAGES_ALERT = [
    "Hi, I'm the user. I was feeling sad today.",
    "Why were you feeling sad today?",
    "I was feeling lonely and down.",
    "I'm sorry to hear that."
]

DEMO_RAG_NAMES = [
    "start_conversation",
    "end_conversation",
    "initiate_smalltalk",
]

DEMO_RAG_DESCRIPTIONS = [
    "Instructions for starting a conversation with the user.",
    "Instructions for ending a conversation with the user.",
    "Instructions for initiating small talk with the user.",
]

DEMO_RAG_INSTRUCTIONS = [
    '''
    Purpose / Goal:
    Start the chat warmly, introduce yourself as QT Robot, and invite the user to share their name.

    When to use:
    At the very beginning of interaction, when there is no previous chat history with the user.
    ''',
    '''
    Purpose / Goal:
    Close the interaction on a positive emotional note so the user feels valued.

    When to use:
    After reflecting on fun and imaginative scenarios regarding the past and the future, gracefully bring an end to the conversation.
    ''',
    '''
    Purpose / Goal:
    Build rapport and make the user comfortable through short, pleasant conversation.

    When to use:
    •\tOnce the user replies or shares their name, transition naturally into light small talk or a fun, simple question about them.
    •\tAlso, as a follow-up after the initial greetings phase, you will ask questions based on the user's response. The follow-up questions should be open-ended based on the user's response, such that the user can elaborate on the previously mentioned topic.
    ''',
]

DEMO_IMAGES = [
    {
        "topic"            : "Moon Landing",
        "url"              : "https://images.pexels.com/photos/41162/moon-landing-apollo-11-nasa-buzz-aldrin-41162.jpeg",
        "photographer"     : "Pixabay",
        "photographer_url" : "https://www.pexels.com/@pixabay/"
    },
    {
        "topic"            : "Gardening",
        "url"              : "https://images.pexels.com/photos/5905352/pexels-photo-5905352.jpeg",
        "photographer"     : "Vanessa P",
        "photographer_url" : "https://www.pexels.com/@vanessa-p-273294/"
    },
    {
        "topic"            : "Grandchildren",
        "url"              : "https://images.pexels.com/photos/6148876/pexels-photo-6148876.jpeg",
        "photographer"     : "RDNE Stock Project",
        "photographer_url" : "https://www.pexels.com/@rdne/"
    },
    {
        "topic"            : "Walk",
        "url"              : "https://images.pexels.com/photos/631986/pexels-photo-631986.jpeg",
        "photographer"     : "Tobi",
        "photographer_url" : "https://www.pexels.com/@pripicart/"
    },
]
