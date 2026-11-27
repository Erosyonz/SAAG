
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
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from apps.accounts.models import Route
from django.urls import reverse



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


        # GET LAST GPS COORDINATE (excluding initial starting point)
        last_gps_coordinate = RouteCoordinates.objects.filter(
            route=route,
            point_order__gt=1
        ).order_by('-point_order').first()

        # GET LAST WAYPOINT
        last_waypoint = RouteWaypoint.objects.filter(
            route=route
        ).order_by('-route_wp_id').first()

        # DETERMINE END COORDINATES
        if last_gps_coordinate:
            end_latitude = last_gps_coordinate.latitude
            end_longitude = last_gps_coordinate.longitude

        elif last_waypoint:
            end_latitude = last_waypoint.latitude
            end_longitude = last_waypoint.longitude

        else:
            end_latitude = None
            end_longitude = None

        # SAVE END COORDINATES
        if end_latitude is not None and end_longitude is not None:
            last_coordinate = RouteCoordinates.objects.filter(
                route=route
            ).order_by('-point_order').first()

            if last_coordinate:
                last_coordinate.end_latitude = end_latitude
                last_coordinate.end_longitude = end_longitude

                last_coordinate.save(
                    update_fields=['end_latitude', 'end_longitude']
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

def get_difficulty_label(distance_km, climb_meters):
    """Turn distance and climb into a simple label for the trail cards."""
    if distance_km < 5 and climb_meters < 100:
        return 'Easy'
    if distance_km < 10 and climb_meters < 400:
        return 'Moderate'
    return 'Challenging'


def get_image_url(stored_path):
    """Turn a saved file path into a link the browser can open."""
    if not stored_path:
        return None
    try:
        return default_storage.url(stored_path)
    except Exception:
        return None


# MAP PIN + TRAIL CARD DATA
# Default: every route is shown so people can discover trails.
# To show only the logged-in user's routes, call this URL with ?mine=1

@login_required
def route_map_data(request):
    routes = (
        Route.objects
        .select_related('account')
        .prefetch_related('coordinates', 'waypoints')
        .order_by('-created_at')
    )

    if request.GET.get('mine') == '1':
        routes = routes.filter(account=request.user)

    route_data = []

    for route in routes:
        # Use the prefetched rows (no extra database trips)
        coordinates = sorted(route.coordinates.all(), key=lambda point: point.point_order)
        waypoints = list(route.waypoints.all())

        distance_km = float(route.total_distance)
        climb_meters = float(route.elevation)

        waypoint_list = [
            {
                'id': waypoint.route_wp_id,
                'name': waypoint.location_spot_name,
                'description': waypoint.spot_description,
                'image': get_image_url(waypoint.spot_image),
                'latitude': float(waypoint.latitude),
                'longitude': float(waypoint.longitude),
            }
            for waypoint in waypoints
        ]

        # The first waypoint that has a photo becomes the card picture
        cover_image = next(
            (waypoint['image'] for waypoint in waypoint_list if waypoint['image']),
            None
        )

        creator_name = str(route.account).strip() or route.account.username

        route_data.append({
            'route_id': route.route_id,
            'name': route.route_name,
            'description': route.description or '',
            'total_distance': distance_km,
            'elevation': climb_meters,
            'estimated_time': route.estimated_time,
            'difficulty': get_difficulty_label(distance_km, climb_meters),
            'created_by': creator_name,
            'is_mine': route.account_id == request.user.pk,
            'profile_url': (
                reverse('profile') if route.account_id == request.user.pk
                else reverse('profile_detail', args=[route.account_id])
            ),
            'created_at': route.created_at.isoformat(),
            'cover_image': cover_image,

            
            'coordinates': [
                {
                    'latitude': float(point.latitude),
                    'longitude': float(point.longitude),
                    'elevation': point.elevation,
                    'point_order': point.point_order,

                    'end_latitude': (
                        float(point.end_latitude)
                        if point.end_latitude is not None else None
                    ),
                    'end_longitude': (
                        float(point.end_longitude)
                        if point.end_longitude is not None else None
                    ),
                }
                for point in coordinates
            ],


            'waypoints': waypoint_list,
        })

    return JsonResponse({'routes': route_data})
