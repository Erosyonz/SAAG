from django.contrib.auth.models import AbstractUser
from django.db import models

class Account(AbstractUser):
    # AbstractUser already gives us: username, email, password,
    # first_name, last_name, is_active, date_joined, etc.

    # Placeholder for future MaAgi-an features (Profile screen, etc.)
    # bio = models.TextField(blank=True, null=True)
    # profile_photo = models.ImageField(upload_to='profile_photos/', blank=True, null=True)

    def __str__(self):
        return self.username