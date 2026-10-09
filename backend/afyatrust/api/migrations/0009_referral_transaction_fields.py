from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0008_accessgrant_reason"),
    ]

    operations = [
        migrations.AddField(
            model_name="referral",
            name="tx_hash",
            field=models.CharField(blank=True, max_length=66),
        ),
        migrations.AddField(
            model_name="referral",
            name="on_chain_referral_tx",
            field=models.TextField(blank=True, default=""),
        ),
    ]
