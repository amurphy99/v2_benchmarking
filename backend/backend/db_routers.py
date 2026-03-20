# documentation for Multiple Database Routing: https://docs.djangoproject.com/en/5.2/topics/db/multi-db/#automatic-database-routing
class VectorDBRouter:
    """
    Route models in the rag_vectorstore app to the 'vector' database.
    Other apps go to the 'default' database.
    """

    app_label = 'rag_vectorstore'
    db_name   = 'vector' # the database name as defined in settings.py

    def db_for_read(self, model, **hints):
        # If this model belongs to rag_vectorstore, read from 'vector'
        if model._meta.app_label == self.app_label:
            return self.db_name
        # Otherwise, fallback to default DB
        return None

    def db_for_write(self, model, **hints):
        if model._meta.app_label == self.app_label:
            return self.db_name
        return None

    def allow_relation(self, obj1, obj2, **hints):
        # Relations between two vector models are fine
        if (
            obj1._meta.app_label == self.app_label and
            obj2._meta.app_label == self.app_label
        ):
            return True
        
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # Only run rag_vectorstore migrations on the 'vector' DB
        if app_label == self.app_label:
            return db == self.db_name

        # Prevent other apps from creating tables in the 'vector' DB by accident
        if db == self.db_name and app_label != self.app_label:
            return False
            
        return None