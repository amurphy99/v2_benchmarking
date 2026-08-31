from django.contrib  import admin

import json
from django.http import HttpResponse

from .models import Account, Profile, Reminder, UserSettings, Goal, AlbumImage, ChatSession, ChatMessage, RAGInstructions, Activity, LLMTurnLog

# TODO: Maybe we should add custom admin view and export logic for other models (such as biomarkers) as well to easily export data after collection. 

# Register models
admin.site.register(Account     )
admin.site.register(Profile     )
admin.site.register(Reminder    )
admin.site.register(UserSettings)
admin.site.register(AlbumImage  )
admin.site.register(Goal        )


# ChatSession and ChatMessage
class ChatMessageInline(admin.TabularInline):
    model           = ChatMessage
    extra           = 0
    readonly_fields = ("ts", "role", "content")
    can_delete      = False
    max_num         = 0

    def has_add_permission(self, request, obj=None):
        return False

@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display    = ("id", "profile", "source", "taskType", "is_active", "date", "end_ts")
    list_filter     = ("is_active", "source", "taskType") # filtering based on speific fields
    search_fields   = ("profile__account__user__username",)
    readonly_fields = ("date", "end_ts", "start_ts", "duration")
    inlines         = [ChatMessageInline]
    actions         = ["export_sessions_as_json"]

    @admin.action(description="Export selected sessions as JSON (transcript + metadata)")
    def export_sessions_as_json(self, request, queryset):
        data = []
        for session in queryset.select_related("profile__account__user").prefetch_related("messages"):
            data.append({
                "session_id"  : session.id,
                "username"    : session.profile.account.user.username,
                "source"      : session.source,
                "taskType"    : session.taskType,
                "taskSubtype" : session.taskSubtype,
                "date"        : session.date.isoformat(),
                "end_ts"      : session.end_ts.isoformat() if session.end_ts else None,
                "summary"     : session.summary,
                "topics"      : session.topics,
                "sentiment"   : session.sentiment,
                "emotion"     : session.emotion,
                "risk_level"  : session.risk_level,
                "risk_reason" : session.risk_reason,
                "risk_quotes" : session.risk_quotes,
                "notes"       : session.notes,
                "messages": [
                    {
                        "role"    : msg.role,
                        "content" : msg.content,
                        "ts"      : msg.ts.isoformat(),
                    }
                    for msg in session.messages.all()
                ],
            })
        response = HttpResponse(
            json.dumps(data, indent=2),
            content_type="application/json",
        )
        response["Content-Disposition"] = f'attachment; filename="chat_session_{session.id}.json"'
        return response


# RAG Instructions
class RAGInstructionsInline(admin.TabularInline):
    model   = RAGInstructions
    extra   = 1
    fields  = ("instruction_order", "name", "description", "instructions")
    ordering = ("instruction_order", "name")

@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("name", "instruction_count")
    search_fields = ("name",)
    inlines      = [RAGInstructionsInline]

    @admin.display(description="# Instructions")
    def instruction_count(self, obj):
        return obj.rag_instructions.count()

@admin.register(RAGInstructions)
class RAGInstructionsAdmin(admin.ModelAdmin):
    list_display  = ("activity", "instruction_order", "name", "description_short")
    list_filter   = ("activity",) # filtering based on specific fields
    search_fields = ("name", "activity__name")
    ordering      = ("activity", "instruction_order")

    # Shorten the description for display in the admin list view
    @admin.display(description="Description")
    def description_short(self, obj):
        return (obj.description or "")[:80]

# LLMTurnLogs
@admin.register(LLMTurnLog)
class LLMTurnLogAdmin(admin.ModelAdmin):
    list_display    = ("id", "session", "user", "activity_name", "turn_index", "state_before", "state_after", "total_latency_ms", "forced_state_transition", "created_at")
    list_filter = ("activity_name", "forced_state_transition", "session") # filtering based on speific fields
    search_fields   = ("user__username", "session__id", "state_before", "state_after")
    readonly_fields = ("created_at",)
    actions         = ["export_llm_logs_as_json"]

    @admin.action(description="Export selected LLM turn logs as JSON")
    def export_llm_logs_as_json(self, request, queryset):
        data = []
        for log in queryset.select_related("session", "user"):
            data.append({
                "id"                      : log.id,
                "session_id"              : log.session_id,
                "username"                : log.user.username if log.user else None,
                "activity_name"           : log.activity_name,
                "turn_index"              : log.turn_index,
                "user_text_length"        : log.user_text_length,
                "state_before"            : log.state_before,
                "state_after"             : log.state_after,
                "same_state_turn_count"   : log.same_state_turn_count,
                "forced_state_transition" : log.forced_state_transition,
                "total_latency_ms"        : log.total_latency_ms,
                "agents_data"             : log.agents_data,
                "created_at"              : log.created_at.isoformat(),
            })
        response = HttpResponse(
            json.dumps(data, indent=2),
            content_type="application/json",
        )
        response["Content-Disposition"] = 'attachment; filename="llm_turn_logs.json"'
        return response