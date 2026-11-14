
import json
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import ensure_csrf_cookie
from django.db import transaction
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from apps.accounts.models import Route



from apps.accounts.models import (
    Account,
    Route,
    RouteCoordinates,
    RouteWaypoint
)


# ==========================================
# DISPLAY SAAG HOME
# ==========================================

@ensure_csrf_cookie
def saag_home(request):
    accounts = Account.objects.all()

    return render(request, 'home/home.html', {
        'accounts': accounts,
    })


# ==========================================
# CREATE ROUTE
# ==========================================

@login_required
@require_POST
def create_route(request):
    try:
        data = json.loads(request.body)

        route_name = data.get('name', '').strip()
        description = data.get('description', '')

        latitude = Decimal(str(data['latitude']))
        longitude = Decimal(str(data['longitude']))

        if not route_name or len(route_name) > 50:
            return JsonResponse({
                'success': False,
                'message': 'Route name is required and must not exceed 50 characters.'
            }, status=400)

        if not (-90 <= latitude <= 90):
            raise ValueError('Invalid latitude.')

        if not (-180 <= longitude <= 180):
            raise ValueError('Invalid longitude.')

        with transaction.atomic():

            route = Route.objects.create(
                account=request.user,
                route_name=route_name,
                description=description,
                total_distance=Decimal('0.00'),
                elevation=Decimal('0.00'),
                estimated_time=0
            )

            RouteCoordinates.objects.create(
                route=route,
                latitude=latitude,
                longitude=longitude,
                elevation=0,
                point_order=1
            )

        return JsonResponse({
            'success': True,
            'message': 'Route created successfully.',
            'route_id': route.route_id
        }, status=201)

    except (ValueError, KeyError, TypeError,
            InvalidOperation, json.JSONDecodeError) as error:

        return JsonResponse({
            'success': False,
            'message': str(error)
        }, status=400)


# ==========================================
# SAVE GPS COORDINATE
# ==========================================

@login_required
@require_POST
def save_coordinate(request, route_id):
    try:
        data = json.loads(request.body)

        latitude = Decimal(str(data['latitude']))
        longitude = Decimal(str(data['longitude']))
        elevation = int(data.get('elevation') or 0)

        if not (-90 <= latitude <= 90):
            raise ValueError('Invalid latitude.')

        if not (-180 <= longitude <= 180):
            raise ValueError('Invalid longitude.')

        with transaction.atomic():

            route = get_object_or_404(
                Route.objects.select_for_update(),
                route_id=route_id,
                account=request.user
            )

            last_point = route.coordinates.order_by(
                '-point_order'
            ).first()

            next_order = (
                last_point.point_order + 1
                if last_point else 1
            )

            coordinate = RouteCoordinates.objects.create(
                route=route,
                latitude=latitude,
                longitude=longitude,
                elevation=elevation,
                point_order=next_order
            )

        return JsonResponse({
            'success': True,
            'coordinate_id': coordinate.route_cd_id,
            'point_order': next_order
        }, status=201)

    except (ValueError, KeyError, TypeError,
            InvalidOperation, json.JSONDecodeError) as error:

        return JsonResponse({
            'success': False,
            'message': str(error)
        }, status=400)


# ==========================================
# SAVE WAYPOINT
# ==========================================

@login_required
@require_POST
def save_waypoint(request, route_id):
    try:
        name = request.POST.get('name', '').strip()
        description = request.POST.get('description', '')

        latitude = Decimal(request.POST['latitude'])
        longitude = Decimal(request.POST['longitude'])

        photo = request.FILES.get('photo')

        if not name or len(name) > 50:
            return JsonResponse({
                'success': False,
                'message': 'Waypoint name is required and must not exceed 50 characters.'
            }, status=400)

        if not (-90 <= latitude <= 90):
            raise ValueError('Invalid latitude.')

        if not (-180 <= longitude <= 180):
            raise ValueError('Invalid longitude.')

        if photo:
            if photo.content_type not in ('image/jpeg', 'image/png'):
                return JsonResponse({
                    'success': False,
                    'message': 'Only JPG and PNG images are allowed.'
                }, status=400)

            if photo.size > 5 * 1024 * 1024:
                return JsonResponse({
                    'success': False,
                    'message': 'Image must not exceed 5 MB.'
                }, status=400)

        route = get_object_or_404(
            Route,
            route_id=route_id,
            account=request.user
        )

        image_path = None

        if photo:
            extension = photo.name.rsplit('.', 1)[-1].lower()

            image_path = default_storage.save(
                f'waypoints/{uuid4().hex}.{extension}',
                photo
            )

        waypoint = RouteWaypoint.objects.create(
            route=route,
            location_spot_name=name,
            spot_description=description,
            spot_image=image_path,
            latitude=latitude,
            longitude=longitude
        )

        return JsonResponse({
            'success': True,
            'waypoint_id': waypoint.route_wp_id,
            'image_url': (
                default_storage.url(image_path)
                if image_path else None
            )
        }, status=201)

    except (ValueError, KeyError, TypeError,
            InvalidOperation) as error:

        return JsonResponse({
            'success': False,
            'message': str(error)
        }, status=400)


# ==========================================
# FINISH ROUTE
# ==========================================

@login_required
@require_POST
def finish_route(request, route_id):
    try:
        data = json.loads(request.body)

        distance = Decimal(str(data['total_distance']))
        elevation = Decimal(str(data.get('elevation', 0)))
        estimated_time = int(data['estimated_time'])

        if distance < 0 or elevation < 0 or estimated_time < 0:
            raise ValueError('Route summary values cannot be negative.')

        if distance > Decimal('999.99'):
            raise ValueError('Route distance exceeds the database field limit.')

        route = get_object_or_404(
            Route,
            route_id=route_id,
            account=request.user
        )

        route.total_distance = distance.quantize(Decimal('0.01'))
        route.elevation = elevation.quantize(Decimal('0.01'))
        route.estimated_time = estimated_time

        route.save(update_fields=[
            'total_distance',
            'elevation',
            'estimated_time'
        ])

        return JsonResponse({
            'success': True,
            'message': 'Route summary updated successfully.'
        })

    except (ValueError, KeyError, TypeError,
            InvalidOperation, json.JSONDecodeError) as error:

        return JsonResponse({
            'success': False,
            'message': str(error)
        }, status=400)


# MAP PIN LOCATION DATA

@login_required
def route_map_data(request):
    routes = (
        Route.objects
        .filter(account=request.user)
        .prefetch_related('coordinates', 'waypoints')
    )

    route_data = []

    for route in routes:
        coordinates = route.coordinates.order_by('point_order')
        waypoints = route.waypoints.all()

        route_data.append({
            'route_id': route.route_id,
            'name': route.route_name,
            'description': route.description,
            'total_distance': float(route.total_distance),
            'estimated_time': route.estimated_time,

            'coordinates': [
                {
                    'latitude': float(point.latitude),
                    'longitude': float(point.longitude),
                    'elevation': point.elevation,
                    'point_order': point.point_order
                }
                for point in coordinates
            ],

            'waypoints': [
                {
                    'name': waypoint.location_spot_name,
                    'description': waypoint.spot_description,
                    'image': waypoint.spot_image,
                    'latitude': float(waypoint.latitude),
                    'longitude': float(waypoint.longitude)
                }
                for waypoint in waypoints
            ]
        })

    return JsonResponse({'routes': route_data})
