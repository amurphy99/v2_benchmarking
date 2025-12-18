from django.contrib import admin
from .models import Profile, Account, ChatSession, Reminder, UserSettings, ChatSession, AlbumImage, Goal

# Register models
admin.site.register(Account     )
admin.site.register(Profile     )
admin.site.register(ChatSession )
admin.site.register(Reminder    )
admin.site.register(UserSettings)
admin.site.register(AlbumImage  )
admin.site.register(Goal        )