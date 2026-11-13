
/**
 * home.js
 * SA-AG - Route Creation and Waypoint Tracking
 */

// ==========================================
// MAP VARIABLES
// ==========================================

let map;

let startMarker = null;
let currentMarker = null;
let walkingTrail = null;

let waypointMarkers = [];

let gpsWatcher = null;
let isRecording = false;

let selectedStartPoint = null;
let currentPosition = null;
let waypointPosition = null;

let routeData = null;


// ==========================================
// INITIALIZE
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    initMap();
    initModalEvents();

});


// ==========================================
// MAP INITIALIZATION
// ==========================================

function initMap() {

    const container = document.getElementById('mapbox-container');

    if (!container) return;

    map = L.map(container, {
        zoomControl: false,
        attributionControl: false
    }).setView([10.3157, 123.8907], 13);

    /// Satellite layer
    L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }
    ).addTo(map);

    L.control.zoom({
        position: 'bottomleft'
    }).addTo(map);


    // Map click retrieves user's actual GPS position
    map.on('click', () => {

        console.log('Map clicked');

        if (isRecording) return;

        hideHeroCards();

        getStartingLocation();

    });


    window.addEventListener('resize', () => {
        map.invalidateSize();
    });

}

// ==========================================
// GET STARTING LOCATION
// ==========================================

function showStartCoordinatesText(message) {
    const coordinatesBox = document.getElementById('route-start-coordinates');

    if (coordinatesBox) {
        coordinatesBox.textContent = message;
    } else {
        console.warn("Missing element: #route-start-coordinates. Check that the right home.html is being served.");
    }
}

function getStartingLocation() {

    // Open the panel FIRST so the user always sees it
    openRouteModal();

    showStartCoordinatesText('Getting GPS location...');

    if (!navigator.geolocation) {
        showStartCoordinatesText('Geolocation is not supported.');
        alert('Your browser does not support GPS location.');
        return;
    }

    navigator.geolocation.getCurrentPosition(

        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            selectedStartPoint = [lat, lng];
            currentPosition = [lat, lng];

            showStartingPoint(lat, lng);

            showStartCoordinatesText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        },

        (error) => {
            selectedStartPoint = null;

            showStartCoordinatesText('Unable to retrieve GPS location.');

            console.error('GPS Error:', error.code, error.message);
            alert('Unable to get your location. Please check browser location permissions.');
        },

        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}



// ==========================================
// STARTING POINT MARKER
// ==========================================

function showStartingPoint(lat, lng) {

    const position = [lat, lng];

    if (startMarker) {
        map.removeLayer(startMarker);
    }

    startMarker = L.marker(position, {
        zIndexOffset: 1000
    }).addTo(map);

    startMarker.bindPopup('Starting Point');

    map.setView(position, 17, {
        animate: true
    });

}


// ==========================================
// ROUTE CREATION
// ==========================================

function createRoute() {

    if (!selectedStartPoint) {

        alert('Please retrieve your GPS starting location first.');
        return;

    }

    const routeName =
        document.getElementById('route-name').value.trim();

    const description =
        document.getElementById('route-description').value.trim();

    if (!routeName) {

        alert('Please enter a route name.');
        return;

    }

    const [lat, lng] = selectedStartPoint;

    // Route object matching your ERD
    routeData = {

        RouteID: null, // Assigned by Django/database later

        UserID: null, // Assigned from authenticated user later

        RouteName: routeName,

        Description: description,

        TotalDistance: 0,

        Elevation: 0,

        EstimatedTime: 0,

        CreatedAt: new Date(),

        Coordinates: [],

        Waypoints: []

    };


    // Save the starting GPS coordinate
    addRouteCoordinate(lat, lng);

    // Initialize the current GPS position
    currentPosition = [lat, lng];

    // Create the actual route line
    walkingTrail = L.polyline(
        [[lat, lng]],
        {
            color: '#10b981',
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round'
        }
    ).addTo(map);


    // Starting marker
    if (startMarker) {
        map.removeLayer(startMarker);
    }

    startMarker = L.marker([lat, lng])
        .addTo(map)
        .bindPopup('Route Starting Point');


    // Current GPS marker
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    currentMarker = L.circleMarker([lat, lng], {
        radius: 7,
        color: '#ffffff',
        weight: 3,
        fillColor: '#10b981',
        fillOpacity: 1
    }).addTo(map);


    // Start recording
    isRecording = true;

    closeRouteModal();

    document.getElementById('route-controls').classList.remove('hidden');

    startGPSTracking();

    console.log('Route created:', routeData);

}


// ==========================================
// RECORD ROUTE COORDINATES
// ==========================================

function addRouteCoordinate(lat, lng) {

    if (!routeData) return;

    const pointOrder = routeData.Coordinates.length + 1;

    routeData.Coordinates.push({

        Latitude: lat,
        Longitude: lng,
        Elevation: 0, // Replace with GPS altitude when available
        PointOrder: pointOrder

    });

}


// ==========================================
// GPS TRACKING
// ==========================================

function startGPSTracking() {

    if (!navigator.geolocation) {
        alert('GPS tracking is unavailable.');
        return;
    }

    gpsWatcher = navigator.geolocation.watchPosition(

        (position) => {

            if (!isRecording) return;

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            if (accuracy > 50) return;

            const newPosition = [lat, lng];

            currentPosition = newPosition;

            const coordinates = routeData.Coordinates;

            const previous = coordinates[coordinates.length - 1];

            if (!previous) return;

            const distance = getDistance(
                previous.Latitude,
                previous.Longitude,
                lat,
                lng
            );

            if (distance >= 3) {

                addRouteCoordinate(lat, lng);

                walkingTrail.addLatLng(newPosition);

                routeData.TotalDistance += distance / 1000;

            }

            currentMarker.setLatLng(newPosition);

            map.panTo(newPosition, {
                animate: true
            });

        },

        (error) => {

            console.error('GPS tracking error:', error);

            alert('GPS tracking interrupted: ' + error.message);

        },

        {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 15000
        }

    );

}



// ==========================================
// WAYPOINT CREATION
// ==========================================

function openWaypointModal() {

    if (!isRecording || !currentPosition) {

        alert('Please wait for your GPS location before adding a waypoint.');
        return;

    }

    waypointPosition = [...currentPosition];

    document.getElementById('waypoint-name').value = '';
    document.getElementById('waypoint-description').value = '';

    document.getElementById('waypoint-coordinates').textContent =
        `${waypointPosition[0].toFixed(6)}, ${waypointPosition[1].toFixed(6)}`;

    document.getElementById('waypoint-photo').value = '';

    document.getElementById('waypoint-photo-name').textContent = '';

    document.getElementById('waypoint-modal').classList.remove('translate-x-full');

}


// ==========================================
// SAVE WAYPOINT
// ==========================================

function saveWaypoint() {

    if (!isRecording || !waypointPosition) {

        alert('No active route or waypoint position found.');
        return;

    }

    const name =
        document.getElementById('waypoint-name').value.trim();

    const description =
        document.getElementById('waypoint-description').value.trim();

    const photoInput =
        document.getElementById('waypoint-photo');

    const photo = photoInput.files[0] || null;

    if (!name) {

        alert('Please enter a waypoint name.');
        return;

    }

    const lat = waypointPosition[0];
    const lng = waypointPosition[1];

    // Waypoint object matching your ERD
    const waypoint = {

        RouteWP_ID: null,

        RouteID: routeData.RouteID,

        LocationSpotName: name,

        SpotDescription: description,

        SpotImage: photo,

        Latitude: lat,

        Longitude: lng

    };


    // Save waypoint to current route
    routeData.Waypoints.push(waypoint);


    // Create separate waypoint marker
    createWaypointMarker(waypoint);


    console.log('Waypoint added:', waypoint);

    closeWaypointModal();

}


// ==========================================
// WAYPOINT MAP PIN
// ==========================================

function createWaypointMarker(waypoint) {

    const icon = L.divIcon({

        className: 'waypoint-pin',

        html: `
            <div style="
                width: 30px;
                height: 30px;
                background: #2563eb;
                border: 2px solid white;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 8px rgba(0,0,0,.5);
            ">
                <span style="
                    color: white;
                    transform: rotate(45deg);
                    font-size: 12px;
                    font-weight: bold;
                ">W</span>
            </div>
        `,

        iconSize: [30, 30],
        iconAnchor: [15, 30]

    });


    const marker = L.marker(
        [waypoint.Latitude, waypoint.Longitude],
        { icon: icon }
    ).addTo(map);


    // Build popup safely
    const popupContent = document.createElement('div');

    const title = document.createElement('strong');
    title.textContent = waypoint.LocationSpotName;

    const desc = document.createElement('p');
    desc.textContent = waypoint.SpotDescription || 'No description provided.';

    popupContent.appendChild(title);
    popupContent.appendChild(desc);


    if (waypoint.SpotImage) {

        const image = document.createElement('img');

        image.src = URL.createObjectURL(waypoint.SpotImage);

        image.style.width = '150px';
        image.style.marginTop = '8px';
        image.style.borderRadius = '8px';

        popupContent.appendChild(image);

    }

    marker.bindPopup(popupContent);

    waypointMarkers.push(marker);

}


// ==========================================
// STOP ROUTE RECORDING
// ==========================================

function stopRoute() {

    if (!isRecording) return;

    isRecording = false;

    if (gpsWatcher !== null) {

        navigator.geolocation.clearWatch(gpsWatcher);

        gpsWatcher = null;

    }

    routeData.Status = 'Completed';

    routeData.CompletedAt = new Date();

    document.getElementById('route-controls').classList.add('hidden');

    // Preserve completed trail
    console.log('Completed Route:', routeData);

    alert(
        `Route "${routeData.RouteName}" completed!\n` +
        `Distance: ${routeData.TotalDistance.toFixed(2)} km\n` +
        `Coordinates: ${routeData.Coordinates.length}\n` +
        `Waypoints: ${routeData.Waypoints.length}`
    );

}


// ==========================================
// DISTANCE CALCULATION
// ==========================================

function getDistance(lat1, lon1, lat2, lon2) {

    const R = 6371000;

    const toRad = value => value * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );

}


// ==========================================
// MODAL EVENTS
// ==========================================

function initModalEvents() {

    document.getElementById('close-route-modal')
        .addEventListener('click', closeRouteModal);

    document.getElementById('close-waypoint-modal')
        .addEventListener('click', closeWaypointModal);

    document.getElementById('save-route-btn')
        .addEventListener('click', createRoute);

    document.getElementById('add-waypoint-btn')
        .addEventListener('click', openWaypointModal);

    document.getElementById('save-waypoint-btn')
        .addEventListener('click', saveWaypoint);

    document.getElementById('stop-route-btn')
        .addEventListener('click', stopRoute);

    document.getElementById('waypoint-photo')
        .addEventListener('change', function() {

            const file = this.files[0];

            document.getElementById('waypoint-photo-name').textContent =
                file ? file.name : '';

        });

}


// ==========================================
// MODAL CONTROLS
// ==========================================

function openRouteModal() {

    document.getElementById('route-modal')
        .classList.remove('translate-x-full');

}

function closeRouteModal() {

    document.getElementById('route-modal')
        .classList.add('translate-x-full');

}

function closeWaypointModal() {

    document.getElementById('waypoint-modal')
        .classList.add('translate-x-full');

}


// ==========================================
// HERO CARDS
// ==========================================

function hideHeroCards() {

    const container =
        document.getElementById('hero-cards-container');

    if (container) {

        container.classList.add(
            'opacity-0',
            'pointer-events-none',
            'translate-y-4'
        );

    }

}

function showHeroCards() {

    const container =
        document.getElementById('hero-cards-container');

    if (container) {

        container.classList.remove(
            'opacity-0',
            'pointer-events-none',
            'translate-y-4'
        );

    }

}
