from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0007_measurement_integrity_anchor"),
    ]

    operations = [
        migrations.AddField(
            model_name="accessgrant",
            name="reason",
            field=models.TextField(blank=True, default=""),
        ),
    ]
