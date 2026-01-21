from django.contrib import admin
from .models import Profile, ChatSession, Reminder, UserSettings

# Register models
admin.site.register(Profile     )
admin.site.register(ChatSession )
admin.site.register(Reminder    )
admin.site.register(UserSettings)
