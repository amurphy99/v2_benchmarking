"""
The app's database models, one module per model family.
--------------------------------------------------------------------------------
`backend.chat_app.models`

Django finds an app's models through its `models` module, so this package
imports every model class, and callers keep importing them from
`chat_app.models`. Accounts and what belongs to them are in `accounts.py`,
chats and what they record in `chat.py`, and the memory activity's
instructions and turn logs in `activities.py`. A task chat's run (how it was
run, and the task's own record) is in `runs/`, which will also hold post-chat
questionnaires. The field arguments they share are in `field_args.py`.

"""
# From this project
from .accounts   import Access, Account, Goal, Profile, Reminder, UserSettings
from .activities import Activity, LLMTurnLog, RAGInstructions
from .chat       import AlbumImage, ChatBiomarkerScore, ChatMessage, ChatSession, ChatWord, ReplyNowEvent, SessionAudio
from .runs.run   import ChatRun, TaskSnapshot
