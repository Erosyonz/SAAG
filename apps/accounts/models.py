from django.db import models
from django.contrib.auth.models import AbstractUser

class Account(AbstractUser):
    """
    Represents the Account/User entity in the ERD.
    Inherits standard Django auth fields (username, password, email) 
    and adds custom fields from the ERD.
    """
    account_id = models.AutoField(primary_key=True, db_column='UserID')
    first_name = models.CharField(max_length=50, db_column='First Name')
    last_name = models.CharField(max_length=50, db_column='Last Name')
    profile = models.CharField(max_length=255, db_column='Profile', blank=True, null=True)
    bio = models.CharField(max_length=255, db_column='Bio', blank=True, null=True)

    class Meta:
        db_table = 'User'

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class Route(models.Model):
    route_id = models.AutoField(primary_key=True, db_column='RouteID')
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='routes', db_column='UserID')
    route_name = models.CharField(max_length=50, db_column='RouteName')
    description = models.TextField(blank=True, null=True, db_column='Description')
    total_distance = models.DecimalField(max_digits=5, decimal_places=2, db_column='TotalDistance')
    elevation = models.DecimalField(max_digits=6, decimal_places=2, db_column='Elevation')
    estimated_time = models.IntegerField(db_column='Estimated Time:')
    created_at = models.DateTimeField(auto_now_add=True, db_column='CreatedAt')

    class Meta:
        db_table = 'Route'

    def __str__(self):
        return self.route_name


class UserCompletedRoute(models.Model):
    user_cr_id = models.AutoField(primary_key=True, db_column='UserCR ID')
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='completed_routes', db_column='UserID')
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='user_completions', db_column='RouteID')
    status = models.CharField(max_length=50, db_column='Status')
    rating = models.IntegerField(db_column='Rating', blank=True, null=True)
    completed_at = models.DateTimeField(auto_now_add=True, db_column='CompletedAt')

    class Meta:
        db_table = 'UserCompleted Routes'

    def __str__(self):
        return f"Account {self.account_id} - Route {self.route_id} ({self.status})"


class RouteCoordinates(models.Model):
    route_cd_id = models.AutoField(primary_key=True, db_column='RouteCD ID')
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='coordinates', db_column='RouteID')
    latitude = models.DecimalField(max_digits=10, decimal_places=8, db_column='Latitude')
    longitude = models.DecimalField(max_digits=11, decimal_places=8, db_column='Longtitude')
    elevation = models.IntegerField(db_column='Elevation')
    point_order = models.IntegerField(db_column='PointOrder')

    class Meta:
        db_table = 'RouteCoordinates'


class RouteWaypoint(models.Model):
    route_wp_id = models.AutoField(primary_key=True, db_column='RouteWP ID')
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='waypoints', db_column='RouteID')
    location_spot_name = models.CharField(max_length=50, db_column='Location SpotName')
    spot_description = models.TextField(blank=True, null=True, db_column='SpotDescription')
    spot_image = models.CharField(max_length=255, blank=True, null=True, db_column='SpotImage')
    latitude = models.DecimalField(max_digits=10, decimal_places=8, db_column='Latitude')
    longitude = models.DecimalField(max_digits=11, decimal_places=8, db_column='Longtitude')

    class Meta:
        db_table = 'RouteWaypoints'

    def __str__(self):
        return f"{self.location_spot_name} (Route {self.route_id})"