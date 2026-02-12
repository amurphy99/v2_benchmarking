# rag_vectorstore/management/commands/sync_data.py
from django.core.management.base import BaseCommand
from rag_vectorstore.scheduler.google_fetcher import run_google_sync_logic

class Command(BaseCommand):
    help = "Trigger the specialized Google Data Scheduler"

    def handle(self, *args, **options):
        self.stdout.write("Starting Scheduler...")
        run_google_sync_logic()
        self.stdout.write(self.style.SUCCESS("Sync Complete!"))
