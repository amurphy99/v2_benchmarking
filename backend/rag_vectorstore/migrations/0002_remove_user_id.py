from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("rag_vectorstore", "0001_initial"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="raginstructionchunkembedding",
            name="user_id",
        ),
    ]