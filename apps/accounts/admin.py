from django.contrib import admin
from .models import Account, Route, UserCompletedRoute, RouteCoordinates, RouteWaypoint

admin.site.register(Account)
admin.site.register(Route)
admin.site.register(UserCompletedRoute)
admin.site.register(RouteCoordinates)
admin.site.register(RouteWaypoint)