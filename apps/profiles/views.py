from uuid import uuid4

from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.core.validators import validate_email
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from apps.accounts.models import Account, Route, UserCompletedRoute


ALLOWED_IMAGE_TYPES = {'image/jpeg': 'jpg', 'image/png': 'png'}
MAX_IMAGE_BYTES = 5 * 1024 * 1024

BADGE_CLASSES = {
    'Easy': 'bg-emerald-400 text-black',
    'Moderate': 'bg-lime-300 text-black',
    'Challenging': 'bg-white text-black',
}


# ==========================================
# HELPERS
# ==========================================

def get_difficulty_label(distance_km, climb_meters):
    """Same rule the home page uses for its trail cards."""
    if distance_km < 5 and climb_meters < 100:
        return 'Easy'
    if distance_km < 10 and climb_meters < 400:
        return 'Moderate'
    return 'Challenging'


def get_image_url(stored_path):
    if not stored_path:
        return None
    try:
        return default_storage.url(stored_path)
    except Exception:
        return None


def build_route_card(route, date, rating=None):
    """Turn a Route row into the small dictionary the card template needs."""
    distance = float(route.total_distance)
    climb = float(route.elevation)
    difficulty = get_difficulty_label(distance, climb)

    # The first waypoint that has a photo becomes the card picture
    cover_image = next(
        (get_image_url(waypoint.spot_image)
         for waypoint in route.waypoints.all() if waypoint.spot_image),
        None
    )

    return {
        'id': route.route_id,
        'name': route.route_name,
        'distance': distance,
        'difficulty': difficulty,
        'badge_class': BADGE_CLASSES[difficulty],
        'cover_image': cover_image,
        'date': date,
        'rating': rating,
    }


# ==========================================
# PROFILE PAGE
# ==========================================

@login_required
@ensure_csrf_cookie
def profile_view(request):
    user = request.user

    # Routes this user recorded
    created = (
        Route.objects
        .filter(account=user)
        .prefetch_related('waypoints')
        .order_by('-created_at')
    )

    # Routes this user finished (can include routes made by other people)
    completions = (
        UserCompletedRoute.objects
        .filter(account=user)
        .select_related('route')
        .prefetch_related('route__waypoints')
        .order_by('-completed_at')
    )

    created_routes = [build_route_card(route, route.created_at) for route in created]
    completed_routes = [
        build_route_card(item.route, item.completed_at, item.rating)
        for item in completions
    ]

    return render(request, 'profiles/profile.html', {
        'created_routes': created_routes,
        'completed_routes': completed_routes,
        'created_count': len(created_routes),
        'completed_count': len(completed_routes),
        'total_km': sum(card['distance'] for card in created_routes),
    })


# ==========================================
# UPDATE PROFILE (name, email, bio, photo)
# ==========================================

def bad_request(message):
    return JsonResponse({'success': False, 'message': message}, status=400)


@login_required
@require_POST
def update_profile(request):
    user = request.user

    first_name = request.POST.get('first_name', '').strip()
    last_name = request.POST.get('last_name', '').strip()
    username = request.POST.get('username', '').strip()
    email = request.POST.get('email', '').strip()
    bio = request.POST.get('bio', '').strip()

    photo = request.FILES.get('photo')
    remove_photo = request.POST.get('remove_photo') == '1'

    # ----- Check everything before saving anything -----
    if not first_name or not last_name:
        return bad_request('First name and last name are required.')

    if len(first_name) > 50 or len(last_name) > 50:
        return bad_request('Names must not exceed 50 characters.')

    if not username or len(username) > 150:
        return bad_request('Username is required and must not exceed 150 characters.')

    if Account.objects.filter(username__iexact=username).exclude(pk=user.pk).exists():
        return bad_request('That username is already taken.')

    if email:
        try:
            validate_email(email)
        except ValidationError:
            return bad_request('Please enter a valid email address.')

    if len(bio) > 255:
        return bad_request('Bio must not exceed 255 characters.')

    if photo:
        if photo.content_type not in ALLOWED_IMAGE_TYPES:
            return bad_request('Only JPG and PNG images are allowed.')
        if photo.size > MAX_IMAGE_BYTES:
            return bad_request('Image must not exceed 5 MB.')

    # ----- Photo: save the file, keep its web link in the "profile" column -----
    if photo:
        extension = ALLOWED_IMAGE_TYPES[photo.content_type]
        saved_path = default_storage.save(f'avatars/{uuid4().hex}.{extension}', photo)
        photo_url = default_storage.url(saved_path)

        if len(photo_url) > 255:
            default_storage.delete(saved_path)
            return bad_request('The photo link is too long to store.')

        user.profile = photo_url

    elif remove_photo:
        user.profile = None

    user.first_name = first_name
    user.last_name = last_name
    user.username = username
    user.email = email
    user.bio = bio or None

    user.save(update_fields=[
        'first_name', 'last_name', 'username', 'email', 'bio', 'profile'
    ])

    return JsonResponse({'success': True, 'avatar_url': user.profile})