from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0006_accessgrant_source"),
    ]

    operations = [
        migrations.AddField(
            model_name="measurement",
            name="facility_id",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="measurement",
            name="record_hash",
            field=models.CharField(blank=True, max_length=66),
        ),
        migrations.AddField(
            model_name="measurement",
            name="tx_hash",
            field=models.CharField(blank=True, max_length=66),
        ),
    ]
