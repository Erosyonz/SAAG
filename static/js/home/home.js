
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
let savedRouteLayers = [];

let gpsWatcher = null;
let isRecording = false;

let selectedStartPoint = null;
let currentPosition = null;
let waypointPosition = null;

let routeData = null;
let activeRouteId = null;
let routeStartedAt = null;
let coordinateSaveQueue = Promise.resolve();


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

    map.whenReady(() => {
        loadSavedRoutes();
    });

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

function getCookie(name) {
    const cookies = document.cookie.split(';');

    for (let cookie of cookies) {
        cookie = cookie.trim();

        if (cookie.startsWith(name + '=')) {
            return decodeURIComponent(
                cookie.substring(name.length + 1)
            );
        }
    }

    return null;
}


async function createRoute() {

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

    const saveButton = document.getElementById('save-route-btn');

    saveButton.disabled = true;
    saveButton.textContent = 'Saving Route...';

    try {

        const response = await fetch('/home/routes/create/', {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },

            body: JSON.stringify({
                name: routeName,
                description: description,
                latitude: lat,
                longitude: lng
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to save route.');
        }

        // Store the actual database RouteID
        activeRouteId = result.route_id;

        // Initialize local route data
        routeData = {
            RouteID: activeRouteId,
            RouteName: routeName,
            Description: description,
            TotalDistance: 0,
            Elevation: 0,
            EstimatedTime: 0,
            Coordinates: [{
                Latitude: lat,
                Longitude: lng,
                Elevation: 0,
                PointOrder: 1
            }],
            Waypoints: []
        };

        currentPosition = [lat, lng];

        routeStartedAt = Date.now();

        // Create route line
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

        if (startMarker) {
            map.removeLayer(startMarker);
        }

        startMarker = L.marker([lat, lng])
            .addTo(map)
            .bindPopup('Route Starting Point');

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

        isRecording = true;

        closeRouteModal();

        document.getElementById('route-controls')
            .classList.remove('hidden');

        // Start GPS only after successful database creation
        startGPSTracking();

        console.log('Route saved:', activeRouteId);

    } catch (error) {

        console.error('Route creation error:', error);
        alert(error.message);

    } finally {

        saveButton.disabled = false;
        saveButton.textContent = 'Save Starting Point & Start Recording';

    }
}



// ==========================================
// RECORD ROUTE COORDINATES
// ==========================================


function addRouteCoordinate(lat, lng, elevation = 0) {

    if (!routeData || !activeRouteId) return;

    const coordinate = {
        Latitude: lat,
        Longitude: lng,
        Elevation: elevation,
        PointOrder: routeData.Coordinates.length + 1
    };

    // Keep a local copy for map calculations
    routeData.Coordinates.push(coordinate);

    // Queue requests to preserve GPS point ordering
    coordinateSaveQueue = coordinateSaveQueue.then(async () => {

        const response = await fetch(
            `/home/routes/${activeRouteId}/coordinates/`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },

                body: JSON.stringify({
                    latitude: lat,
                    longitude: lng,
                    elevation: elevation
                })
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Coordinate save failed.');
        }

        coordinate.PointOrder = result.point_order;

        console.log('GPS coordinate saved:', result);

    }).catch(error => {

        console.error('GPS coordinate saving failed:', error);

    });

    return coordinateSaveQueue;
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

                addRouteCoordinate(
                    lat,
                    lng,
                    position.coords.altitude || 0
                );

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


async function saveWaypoint() {

    if (!isRecording || !waypointPosition || !activeRouteId) {
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

    const [lat, lng] = waypointPosition;

    const saveButton = document.getElementById('save-waypoint-btn');

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {

        const formData = new FormData();

        formData.append('name', name);
        formData.append('description', description);
        formData.append('latitude', lat);
        formData.append('longitude', lng);

        if (photo) {
            formData.append('photo', photo);
        }

        const response = await fetch(
            `/home/routes/${activeRouteId}/waypoints/`,
            {
                method: 'POST',

                headers: {
                    'X-CSRFToken': getCookie('csrftoken')
                },

                body: formData
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to save waypoint.');
        }

        const waypoint = {
            RouteWP_ID: result.waypoint_id,
            RouteID: activeRouteId,
            LocationSpotName: name,
            SpotDescription: description,
            SpotImage: photo,
            Latitude: lat,
            Longitude: lng
        };

        routeData.Waypoints.push(waypoint);

        createWaypointMarker(waypoint);

        console.log('Waypoint saved:', result);

        closeWaypointModal();

    } catch (error) {

        console.error('Waypoint saving error:', error);
        alert(error.message);

    } finally {

        saveButton.disabled = false;
        saveButton.textContent = 'Save Waypoint';

    }
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
        [waypoint.latitude, waypoint.longitude],
        { icon: waypointIcon }
    ).addTo(routeDetailsLayer);


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


async function stopRoute() {

    if (!isRecording) return;

    isRecording = false;

    if (gpsWatcher !== null) {
        navigator.geolocation.clearWatch(gpsWatcher);
        gpsWatcher = null;
    }

    document.getElementById('route-controls')
        .classList.add('hidden');

    try {

        // Wait for pending GPS requests
        await coordinateSaveQueue;

        const elapsedMinutes = Math.floor(
            (Date.now() - routeStartedAt) / 60000
        );

        const response = await fetch(
            `/home/routes/${activeRouteId}/finish/`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },

                body: JSON.stringify({
                    total_distance: routeData.TotalDistance,
                    elevation: routeData.Elevation || 0,
                    estimated_time: elapsedMinutes
                })
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to complete route.');
        }

        routeData.Status = 'Completed';

        console.log('Completed Route:', routeData);

        alert(
            `Route "${routeData.RouteName}" completed!\n` +
            `Distance: ${routeData.TotalDistance.toFixed(2)} km\n` +
            `Coordinates: ${routeData.Coordinates.length}\n` +
            `Waypoints: ${routeData.Waypoints.length}`
        );

        activeRouteId = null;

    } catch (error) {

        console.error('Route completion error:', error);

        alert(
            'GPS recording stopped, but the route summary could not be saved: ' +
            error.message
        );

    }

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


// ==========================================
// DISPLAY SAVED ROUTES
// ==========================================

async function loadSavedRoutes() {

    try {

        const response = await fetch('/SA-AG/api/routes/map/');

        if (!response.ok) {
            throw new Error('Unable to retrieve saved routes.');
        }

        const result = await response.json();

        // Remove previously displayed routes
        savedRouteLayers.forEach(layer => {
            map.removeLayer(layer);
        });

        savedRouteLayers = [];

        // Display each route
        result.routes.forEach(route => {
            displaySavedRoute(route);
        });

        console.log('Saved routes loaded:', result.routes);

    } catch (error) {

        console.error('Saved route loading error:', error);

    }
}


// ==========================================
// DISPLAY ONE SAVED ROUTE
// ==========================================

function displaySavedRoute(route) {

    const coordinates = route.coordinates || [];
    const waypoints = route.waypoints || [];

    const routeDetailsLayer = L.layerGroup();
    let routeDetailsVisible = false;

    if (coordinates.length === 0) {
        console.warn('Route has no starting coordinate:', route.name);
        return;
    }

    // --------------------------------------
    // 1. STARTING POINT PIN
    // --------------------------------------

    const startPoint = coordinates[0];

    const startIcon = L.divIcon({
        className: '',
        html: `
            <div style="
                width: 38px;
                height: 38px;
                background: #f5a623;
                border: 3px solid white;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 3px 10px rgba(0,0,0,.4);
            ">
                <span style="transform: rotate(45deg);">📍</span>
            </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 38]
    });

    const startMarker = L.marker(
        [startPoint.latitude, startPoint.longitude],
        {
            icon: startIcon,
            zIndexOffset: 1000
        }
    ).addTo(map);

    startMarker.bindPopup(`
        <div>
            <strong>${escapeMapText(route.name)}</strong>
            <p>${escapeMapText(route.description || '')}</p>
            <small>
                ${route.total_distance} km ·
                ${route.estimated_time} minutes
            </small>
        </div>
    `);

    savedRouteLayers.push(startMarker);


    // --------------------------------------
    // 2. DRAW THE RECORDED GPS PATH
    // --------------------------------------

    const routePoints = coordinates.map(point => [
        point.latitude,
        point.longitude
    ]);

    if (routePoints.length >= 2) {

        const routeLine = L.polyline(routePoints, {
            color: '#f5a623',
            weight: 5,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(routeDetailsLayer);

        savedRouteLayers.push(routeDetailsLayer);
    }


    // --------------------------------------
    // 3. DISPLAY WAYPOINT MARKERS
    // --------------------------------------
waypoints.forEach((waypoint, index) => {

    const latitude = Number(waypoint.latitude);
    const longitude = Number(waypoint.longitude);

    console.log(`Waypoint ${index + 1}:`, {
        name: waypoint.name,
        latitude,
        longitude,
        valid: Number.isFinite(latitude) &&
               Number.isFinite(longitude)
    });

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        console.warn('Invalid waypoint:', waypoint);
        return;
    }

    const waypointIcon = L.divIcon({
        className: '',
        html: `
            <div style="
                width: 30px;
                height: 30px;
                background: #2563eb;
                border: 2px solid white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                box-shadow: 0 2px 8px rgba(0,0,0,.4);
            ">★</div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    const marker = L.marker(
        [latitude, longitude],
        { icon: waypointIcon }
    ).addTo(routeDetailsLayer);

    console.log('Marker added to map:', map.hasLayer(marker));

    const popup = document.createElement('div');

    const title = document.createElement('strong');
    title.textContent = waypoint.name || 'Unnamed waypoint';

    const description = document.createElement('p');
    description.textContent =
        waypoint.description || 'No description available.';

    popup.appendChild(title);
    popup.appendChild(description);

    if (waypoint.image) {
        const image = document.createElement('img');
        image.src = waypoint.image;
        image.alt = waypoint.name || 'Waypoint image';
        image.style.width = '180px';
        image.style.marginTop = '8px';
        image.style.borderRadius = '8px';
        popup.appendChild(image);
    }

    marker.bindPopup(popup);
});

   // --------------------------------------
// 4. TOGGLE ROUTE DETAILS
// --------------------------------------

startMarker.on('click', () => {

    if (routeDetailsVisible) {

        // Hide this route's waypoints and path
        map.removeLayer(routeDetailsLayer);
        routeDetailsVisible = false;

        return;
    }

    // Show this route's waypoints and path
    routeDetailsLayer.addTo(map);
    routeDetailsVisible = true;

    // Zoom to this route's locations
    const allPoints = [
        ...routePoints,
        ...waypoints.map(waypoint => [
            Number(waypoint.latitude),
            Number(waypoint.longitude)
        ])
    ];

    if (allPoints.length > 0) {

        const bounds = L.latLngBounds(allPoints);

        map.fitBounds(bounds, {
            padding: [60, 60],
            maxZoom: 16,
            animate: true
        });

    }

});

}


// ==========================================
// ESCAPE POPUP TEXT
// ==========================================

function escapeMapText(value) {

    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[character]);

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
