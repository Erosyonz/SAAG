
from django.urls import path
from . import views

urlpatterns = [
    path('', views.saag_home, name='saag_home'),

    path('routes/create/',
         views.create_route,
         name='create_route'),

    path('routes/<int:route_id>/coordinates/',
         views.save_coordinate,
         name='save_coordinate'),

    path('routes/<int:route_id>/waypoints/',
         views.save_waypoint,
         name='save_waypoint'),

    path('routes/<int:route_id>/finish/',
         views.finish_route,
         name='finish_route'),
         
     path('api/routes/map/', 
          views.route_map_data, 
          name='route_map_data'),
]
