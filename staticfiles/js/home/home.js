/**
 * home.js
 * SA-AG - Trail map: saved trails, route recording, waypoints
 */

// ==========================================
// SETTINGS (web addresses must match urls.py)
// ==========================================

const URLS = {
    savedRoutes: '/SA-AG/api/routes/map/',
    createRoute: '/home/routes/create/',
    saveCoordinate: (routeId) => `/home/routes/${routeId}/coordinates/`,
    saveWaypoint: (routeId) => `/home/routes/${routeId}/waypoints/`,
    finishRoute: (routeId) => `/home/routes/${routeId}/finish/`
};

const DEFAULT_MAP_CENTER = [10.3157, 123.8907];
const MIN_STEP_METERS = 1;        // draw the line after moving just 1 meter
const MAX_ACCURACY_METERS = 100;  // accept weaker GPS readings
const MIN_CLIMB_METERS = 3;       // count a climb only if it is at least this much
const SHOW_START_END_LINK = true; // dashed straight line from start to end (set false to hide)
const ROUTE_LOOP_METERS = 25;     // if a route ends this close to its start, treat it as a loop


// ==========================================
// STATE
// ==========================================

let map;

// Saved trails from the database: routeId -> { route, startMarker, detailsLayer, points }
const savedTrails = new Map();
let focusedRouteId = null;

// Search and cards
const MAX_TRAIL_CARDS = 3;
let allRoutes = [];
let searchText = '';
const placeNames = new Map();   // routeId -> "Town, Province"

// Live recording
let isRecording = false;
let activeRouteId = null;
let routeData = null;
let routeStartedAt = null;
let lastAltitude = null;
let followUser = true;

let liveLayer = null;
let liveTrail = null;
let liveTrailOutline = null;
let liveLink = null;
let liveTail = null;
let liveStart = null;
let liveDot = null;
let gpsWatcher = null;
let hudTimer = null;
let coordinateSaveQueue = Promise.resolve();
let hasWarnedAboutSaving = false;

// Create-route panel
let startPoint = null;
let previewMarker = null;

// Waypoint panel
let currentPosition = null;
let waypointPoint = null;


// ==========================================
// SMALL HELPERS
// ==========================================

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[character]);
}

function getCookie(name) {
    for (let cookie of document.cookie.split(';')) {
        cookie = cookie.trim();
        if (cookie.startsWith(name + '=')) {
            return decodeURIComponent(cookie.substring(name.length + 1));
        }
    }
    return null;
}

function formatMinutes(totalMinutes) {
    const minutes = Math.max(0, Math.round(totalMinutes));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function getDistance(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371000;
    const toRadians = (value) => value * Math.PI / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function showToast(message, type = 'info') {
    const area = byId('toast-area');
    if (!area) return;

    const borderColor = {
        success: 'border-emerald-400',
        error: 'border-red-400',
        info: 'border-white/30'
    }[type] || 'border-white/30';

    const toast = document.createElement('div');
    toast.className =
        `rounded-xl border ${borderColor} bg-black/95 text-white text-sm px-4 py-3 shadow-2xl backdrop-blur ` +
        'transition-opacity duration-300';
    toast.textContent = message;
    area.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}


// ==========================================
// START UP
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    initEvents();
    await loadSavedRoutes();
    startAutoRefresh();

    // Coming from the profile page: open that route on the map
    const routeToOpen = Number(new URLSearchParams(window.location.search).get('route'));
    if (routeToOpen && savedTrails.has(routeToOpen)) focusTrail(routeToOpen);
});

// ==========================================
// MAP
// ==========================================

function initMap() {
    const container = byId('mapbox-container');
    if (!container) return;

    map = L.map(container, {
        zoomControl: false,
        attributionControl: false
    }).setView(DEFAULT_MAP_CENTER, 13);

    L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }
    ).addTo(map);

    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Clicking empty map just un-selects the trail (it no longer opens the form)
    map.on('click', () => {
        if (!isRecording) clearFocusedTrail();
    });

    // If the walker drags the map, stop auto-following them
    map.on('dragstart', () => {
        if (isRecording) followUser = false;
    });

    window.addEventListener('resize', () => map.invalidateSize());
}


// ==========================================
// SIDE PANELS (open / close)
// ==========================================

const PANEL_HIDDEN_CLASSES = ['translate-x-full', 'invisible', 'pointer-events-none'];

function isPanelOpen(panelId) {
    return !byId(panelId).classList.contains('translate-x-full');
}

function openPanel(panelId) {
    byId(panelId).classList.remove(...PANEL_HIDDEN_CLASSES);
    byId('panel-backdrop').classList.remove('opacity-0', 'pointer-events-none');
}

function closePanel(panelId) {
    byId(panelId).classList.add(...PANEL_HIDDEN_CLASSES);

    const anyOpen = isPanelOpen('route-modal') || isPanelOpen('waypoint-modal');
    if (!anyOpen) {
        byId('panel-backdrop').classList.add('opacity-0', 'pointer-events-none');
    }
}

function closeAllPanels() {
    if (isPanelOpen('route-modal')) closeRouteModal();
    if (isPanelOpen('waypoint-modal')) closeWaypointModal();
}


// ==========================================
// NEW ROUTE PANEL
// ==========================================

function openRouteModal() {
    if (isRecording) {
        showToast('Finish your current route before starting a new one.', 'info');
        return;
    }

    if (followTrail) {
        showToast('Stop following the route first.', 'info');
        return;
    }

    byId('route-name').value = '';
    byId('route-description').value = '';

    openPanel('route-modal');
    requestStartLocation();

    setTimeout(() => byId('route-name').focus(), 320);
}

function closeRouteModal() {
    closePanel('route-modal');

    // Throw away the unsaved preview pin
    if (previewMarker) {
        map.removeLayer(previewMarker);
        previewMarker = null;
    }
    startPoint = null;
}

function setGpsStatus(state, message) {
    const dot = byId('gps-dot');
    const text = byId('route-start-coordinates');
    const retryButton = byId('gps-retry-btn');
    const saveButton = byId('save-route-btn');

    const dotColor = {
        searching: 'bg-amber-400 animate-pulse',
        ready: 'bg-emerald-400',
        error: 'bg-red-400'
    }[state];

    dot.className = `w-3 h-3 rounded-full shrink-0 ${dotColor}`;
    text.textContent = message;

    retryButton.classList.toggle('hidden', state !== 'error');
    saveButton.disabled = state !== 'ready';
}

function describeGpsError(error) {
    if (error.code === 1) return 'Location is blocked. Allow location for this site in your browser settings, then try again.';
    if (error.code === 2) return 'Your location is not available right now. Try again outdoors.';
    if (error.code === 3) return 'Finding your location took too long. Try again.';
    return 'Could not get your location.';
}

function requestStartLocation() {
    startPoint = null;
    setGpsStatus('searching', 'Finding your location...');

    if (!navigator.geolocation) {
        setGpsStatus('error', 'This browser does not support GPS.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            // The panel might have been closed while we waited
            if (!isPanelOpen('route-modal')) return;

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            startPoint = [lat, lng];
            currentPosition = [lat, lng];

            showPreviewPin(lat, lng);
            setGpsStatus('ready', `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        },
        (error) => {
            console.error('GPS error:', error.code, error.message);
            if (!isPanelOpen('route-modal')) return;
            setGpsStatus('error', describeGpsError(error));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function showPreviewPin(lat, lng) {
    if (previewMarker) map.removeLayer(previewMarker);

    previewMarker = L.marker([lat, lng], { icon: createStartIcon(true), zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup('Your starting point', { autoPan: false });

    map.flyTo([lat, lng], 17, { duration: 0.8 });
}


// ==========================================
// CREATE ROUTE
// ==========================================

async function createRoute() {
    if (!startPoint) {
        showToast('Wait for your GPS location first.', 'error');
        return;
    }

    const routeName = byId('route-name').value.trim();
    const description = byId('route-description').value.trim();

    if (!routeName) {
        showToast('Please enter a route name.', 'error');
        byId('route-name').focus();
        return;
    }

    const [lat, lng] = startPoint;
    const saveButton = byId('save-route-btn');

    saveButton.disabled = true;
    saveButton.textContent = 'Starting...';

    try {
        const response = await fetch(URLS.createRoute, {
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

        activeRouteId = result.route_id;

        routeData = {
            RouteID: activeRouteId,
            RouteName: routeName,
            TotalDistance: 0,
            ElevationGain: 0,
            Coordinates: [{ Latitude: lat, Longitude: lng, Elevation: 0, PointOrder: 1 }],
            Waypoints: []
        };

        currentPosition = [lat, lng];
        routeStartedAt = Date.now();
        lastAltitude = null;
        followUser = true;

        beginRecordingScreen(lat, lng);

        closeRouteModal();
        startGPSTracking();

    } catch (error) {
        console.error('Route creation error:', error);
        showToast(error.message, 'error');
    } finally {
        saveButton.textContent = 'Start recording';
        // Button state is reset by setGpsStatus the next time the panel opens
        saveButton.disabled = !startPoint;
    }
}

function beginRecordingScreen(lat, lng) {
    clearFocusedTrail();

    liveLayer = L.layerGroup().addTo(map);

    liveStart = [lat, lng];

    // Dashed line from the start to where you are now
    liveLink = L.polyline([liveStart, liveStart], {
        color: '#ffffff',
        weight: 2,
        opacity: 0.85,
        dashArray: '4 10',
        interactive: false
    }).addTo(liveLayer);

    // White outline under the green line so it stands out on satellite photos
    liveTrailOutline = L.polyline([liveStart], {
        color: '#ffffff',
        weight: 11,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        bubblingMouseEvents: false
    }).addTo(liveLayer);

    liveTrail = L.polyline([liveStart], {
        color: '#10b981',
        weight: 6,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        bubblingMouseEvents: false
    }).addTo(liveLayer);

        // A short piece of line from the last saved point to where you are right now
    liveTail = L.polyline([liveStart, liveStart], {
        color: '#10b981',
        weight: 6,
        opacity: 1,
        lineCap: 'round',
        interactive: false
    }).addTo(liveLayer);


    L.marker(liveStart, { icon: createStartIcon(false), zIndexOffset: 900 })
        .addTo(liveLayer)
        .bindPopup('Route starting point', { autoPan: false })
        .bindTooltip('Start', PIN_TAG_OPTIONS);

    liveDot = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: '<div class="live-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 1100
    }).addTo(liveLayer);

    isRecording = true;

    byId('route-controls').classList.remove('hidden');
    byId('route-controls').classList.add('flex');
    byId('recording-hud').classList.remove('hidden');
    byId('recording-hud').classList.add('flex');
    byId('new-route-btn').classList.add('hidden');
    byId('search-box').classList.add('hidden');
    byId('hero-cards-container').classList.add('hidden');

    updateRecordingHud();
    hudTimer = setInterval(updateRecordingHud, 1000);
}

function updateRecordingHud() {
    if (!routeData) return;

    const seconds = Math.floor((Date.now() - routeStartedAt) / 1000);
    const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secondsText = String(seconds % 60).padStart(2, '0');

    byId('hud-distance').textContent = routeData.TotalDistance.toFixed(2);
    byId('hud-time').textContent = `${minutesText}:${secondsText}`;
    byId('hud-points').textContent = routeData.Coordinates.length;
}


// ==========================================
// GPS TRACKING
// ==========================================

function addRouteCoordinate(lat, lng, altitude) {
    if (!routeData || !activeRouteId) return;

    const routeId = activeRouteId;
    const coordinate = {
        Latitude: lat,
        Longitude: lng,
        Elevation: Math.round(altitude || 0),
        PointOrder: routeData.Coordinates.length + 1
    };

    routeData.Coordinates.push(coordinate);

    // One request at a time keeps the points in the right order
    coordinateSaveQueue = coordinateSaveQueue.then(async () => {
        const response = await fetch(URLS.saveCoordinate(routeId), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                latitude: lat,
                longitude: lng,
                elevation: coordinate.Elevation
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Coordinate save failed.');
        }

        coordinate.PointOrder = result.point_order;

    }).catch((error) => {
        console.error('GPS point saving failed:', error);

        // Only warn once, so you are not flooded with messages while walking
        if (!hasWarnedAboutSaving) {
            hasWarnedAboutSaving = true;
            showToast('Some GPS points could not be saved. Check your internet or log in again.', 'error');
        }
    });
}

function startGPSTracking() {
    if (!navigator.geolocation) {
        showToast('GPS tracking is not available in this browser.', 'error');
        return;
    }

    gpsWatcher = navigator.geolocation.watchPosition(
        (position) => {
            if (!isRecording) return;

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            const altitude = position.coords.altitude;
            const newPosition = [lat, lng];

            currentPosition = newPosition;
            liveDot.setLatLng(newPosition);
            const lastSaved = routeData.Coordinates[routeData.Coordinates.length - 1];
            liveTail.setLatLngs([[lastSaved.Latitude, lastSaved.Longitude], newPosition]);

            if (followUser) map.panTo(newPosition, { animate: true });

            // Skip weak readings
            if (accuracy > MAX_ACCURACY_METERS) return;

            const previous = routeData.Coordinates[routeData.Coordinates.length - 1];
            const stepMeters = getDistance(previous.Latitude, previous.Longitude, lat, lng);

            if (stepMeters < MIN_STEP_METERS) return;

            // Add up the climbing (only going up counts)
            if (altitude !== null && altitude !== undefined) {
                if (lastAltitude !== null && altitude - lastAltitude >= MIN_CLIMB_METERS) {
                    routeData.ElevationGain += altitude - lastAltitude;
                }
                if (lastAltitude === null || Math.abs(altitude - lastAltitude) >= MIN_CLIMB_METERS) {
                    lastAltitude = altitude;
                }
            }

            addRouteCoordinate(lat, lng, altitude);
            liveTrailOutline.addLatLng(newPosition);
            liveTrail.addLatLng(newPosition);
            liveLink.setLatLngs([liveStart, newPosition]);
            routeData.TotalDistance += stepMeters / 1000;

            updateRecordingHud();
        },
        (error) => {
            console.error('GPS tracking error:', error);
            showToast('GPS problem: ' + error.message, 'error');
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
}


// ==========================================
// WAYPOINTS
// ==========================================

function createWaypointIcon() {
    return L.divIcon({
        className: '',
        html: '<div class="waypoint-pin">&#9733;</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

function buildWaypointPopup(name, description, imageUrl) {
    const popup = document.createElement('div');

    const title = document.createElement('p');
    title.className = 'trail-popup-title';
    title.textContent = name || 'Unnamed waypoint';
    popup.appendChild(title);

    const text = document.createElement('p');
    text.className = 'trail-popup-text';
    text.style.marginBottom = '0';
    text.textContent = description || 'No description yet.';
    popup.appendChild(text);

    if (imageUrl) {
        const image = document.createElement('img');
        image.className = 'popup-photo';
        image.src = imageUrl;
        image.alt = name || 'Waypoint photo';
        popup.appendChild(image);
    }

    return popup;
}

function openWaypointModal() {
    if (!isRecording || !currentPosition) {
        showToast('Waiting for your GPS location.', 'info');
        return;
    }

    waypointPoint = [...currentPosition];

    byId('waypoint-name').value = '';
    byId('waypoint-description').value = '';
    byId('waypoint-photo').value = '';
    byId('waypoint-photo-name').textContent = '';
    byId('waypoint-photo-preview').classList.add('hidden');
    byId('waypoint-coordinates').textContent =
        `${waypointPoint[0].toFixed(6)}, ${waypointPoint[1].toFixed(6)}`;

    openPanel('waypoint-modal');
    setTimeout(() => byId('waypoint-name').focus(), 320);
}

function closeWaypointModal() {
    closePanel('waypoint-modal');
}

function showPhotoPreview() {
    const file = byId('waypoint-photo').files[0];
    const preview = byId('waypoint-photo-preview');

    byId('waypoint-photo-name').textContent = file ? file.name : '';

    if (file) {
        preview.src = URL.createObjectURL(file);
        preview.classList.remove('hidden');
    } else {
        preview.classList.add('hidden');
    }
}

async function saveWaypoint() {
    if (!isRecording || !waypointPoint || !activeRouteId) {
        showToast('No active route found.', 'error');
        return;
    }

    const name = byId('waypoint-name').value.trim();
    const description = byId('waypoint-description').value.trim();
    const photo = byId('waypoint-photo').files[0] || null;

    if (!name) {
        showToast('Please enter a waypoint name.', 'error');
        byId('waypoint-name').focus();
        return;
    }

    const [lat, lng] = waypointPoint;
    const saveButton = byId('save-waypoint-btn');

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', description);
        formData.append('latitude', lat);
        formData.append('longitude', lng);
        if (photo) formData.append('photo', photo);

        const response = await fetch(URLS.saveWaypoint(activeRouteId), {
            method: 'POST',
            headers: { 'X-CSRFToken': getCookie('csrftoken') },
            body: formData
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to save waypoint.');
        }

        routeData.Waypoints.push({ id: result.waypoint_id, name: name });

        L.marker([lat, lng], { icon: createWaypointIcon() })
            .addTo(liveLayer)
            .bindPopup(buildWaypointPopup(name, description, result.image_url), { autoPan: false });

        closeWaypointModal();
        showToast(`Waypoint "${name}" saved.`, 'success');

    } catch (error) {
        console.error('Waypoint saving error:', error);
        showToast(error.message, 'error');
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save waypoint';
    }
}


// ==========================================
// FINISH ROUTE
// ==========================================

async function stopRoute() {
    if (!isRecording) return;

    if (!confirm('Finish and save this route?')) return;

    isRecording = false;

    if (gpsWatcher !== null) {
        navigator.geolocation.clearWatch(gpsWatcher);
        gpsWatcher = null;
    }

    clearInterval(hudTimer);
    hudTimer = null;

    const finishedRouteId = activeRouteId;
    const finishedName = routeData.RouteName;
    const distanceKm = routeData.TotalDistance;
    const pointCount = routeData.Coordinates.length;

    try {
        // Wait until every GPS point has reached the server
        await coordinateSaveQueue;

        const elapsedMinutes = Math.max(1, Math.round((Date.now() - routeStartedAt) / 60000));

        const response = await fetch(URLS.finishRoute(finishedRouteId), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                total_distance: Number(distanceKm.toFixed(2)),
                elevation: Number(routeData.ElevationGain.toFixed(2)),
                estimated_time: elapsedMinutes
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to complete route.');
        }

        showToast(
            `"${finishedName}" saved: ${distanceKm.toFixed(2)} km, ${pointCount} GPS points.`,
            'success'
        );

    } catch (error) {
        console.error('Route completion error:', error);
        showToast('Recording stopped, but the summary was not saved: ' + error.message, 'error');
    }

    endRecordingScreen();

    await loadSavedRoutes();
    if (savedTrails.has(finishedRouteId)) focusTrail(finishedRouteId);
}

function endRecordingScreen() {
    if (liveLayer) {
        map.removeLayer(liveLayer);
        liveLayer = null;
    }

    liveTrail = null;
    liveTrailOutline = null;
    liveLink = null;
    liveStart = null;
    liveDot = null;
    routeData = null;
    activeRouteId = null;
    currentPosition = null;
    isRecording = false;

    closeAllPanels();

    byId('route-controls').classList.add('hidden');
    byId('route-controls').classList.remove('flex');
    byId('recording-hud').classList.add('hidden');
    byId('recording-hud').classList.remove('flex');
    byId('new-route-btn').classList.remove('hidden');
    byId('search-box').classList.remove('hidden');
    byId('hero-cards-container').classList.remove('hidden');
}


// ==========================================
// SAVED TRAILS (from the database)
// ==========================================

async function loadSavedRoutes({ quiet = false } = {}) {
    // A quiet refresh does not show the grey loading boxes
    if (!quiet) showTrailCardsLoading();

    try {
        const response = await fetch(URLS.savedRoutes, {
            headers: { 'Accept': 'application/json' }
        });

        const isJson = (response.headers.get('content-type') || '').includes('application/json');

        if (!response.ok || !isJson) {
            throw new Error(
                response.status === 403 || response.redirected
                    ? 'Please log in to see trails.'
                    : 'Unable to retrieve saved trails.'
            );
        }

        const result = await response.json();

        // Remember which trail was selected, so a refresh does not un-select it
        const previouslyFocusedId = focusedRouteId;

        // Remove what was drawn before
        savedTrails.forEach((trail) => {
            map.removeLayer(trail.startMarker);
            map.removeLayer(trail.detailsLayer);
            if (trail.previewLine) map.removeLayer(trail.previewLine);
        });
        savedTrails.clear();
        focusedRouteId = null;

        result.routes.forEach(displaySavedRoute);
        allRoutes = result.routes;

        // Put the selected trail's details back (without moving the map)
        if (previouslyFocusedId !== null && savedTrails.has(previouslyFocusedId)) {
            savedTrails.get(previouslyFocusedId).detailsLayer.addTo(map);
            focusedRouteId = previouslyFocusedId;
        }

        refreshTrailCards();
        highlightTrailCard(focusedRouteId);
        renderSearchResults();
        loadPlaceNamesForSearch();

    } catch (error) {
        console.error('Saved trail loading error:', error);

        // A quiet refresh fails silently, so people are not bothered by a short internet drop
        if (!quiet) renderTrailCardsError(error.message);
    }
}


function createStartIcon(isMine) {
    return L.divIcon({
        className: '',
        html: `<div class="start-pin ${isMine ? '' : 'is-other'}"><span>&#128205;</span></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36]
    });
}

const PIN_TAG_OPTIONS = {
    permanent: true,
    direction: 'right',
    offset: [16, -18],
    className: 'pin-tag'
};

function createEndIcon() {
    return L.divIcon({
        className: '',
        html: '<div class="end-pin"><span>&#127937;</span></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 36]
    });
}

function formatDistance(meters) {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

function buildEndPopup(route, gapMeters) {
    return `
        <div>
            <p class="trail-popup-title">Route end</p>
            <p class="trail-popup-text" style="margin-bottom:0">
                ${escapeHtml(route.name)} finishes ${formatDistance(gapMeters)} in a straight line from where it started.
            </p>
        </div>`;
}

function buildRoutePopup(route) {
    const climbMeters = Math.round(Number(route.elevation || 0));
    const owner = route.is_mine ? 'Your route' : `By ${escapeHtml(route.created_by)}`;

    return `
        <div>
            <p class="trail-popup-title">${escapeHtml(route.name)}</p>
            ${route.description ? `<p class="trail-popup-text">${escapeHtml(route.description)}</p>` : ''}

            <div class="trail-popup-grid">
                <div><strong>${Number(route.total_distance).toFixed(2)}</strong><span>km</span></div>
                <div><strong>${formatMinutes(route.estimated_time)}</strong><span>time</span></div>
                <div><strong>${climbMeters}</strong><span>m climb</span></div>
            </div>

            <div class="trail-popup-footer">
                <span class="trail-popup-stat">${escapeHtml(route.difficulty)}</span>
                <span class="trail-popup-owner">${owner}</span>
            </div>
        </div>`;
}

function displaySavedRoute(route) {
    const points = (route.coordinates || []).map((point) => [point.latitude, point.longitude]);

    if (points.length === 0) return;

    const detailsLayer = L.layerGroup();

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const hasPath = points.length >= 2;
    const gapMeters = hasPath ? getDistance(firstPoint[0], firstPoint[1], lastPoint[0], lastPoint[1]) : 0;
    const endsNearStart = !hasPath || gapMeters < ROUTE_LOOP_METERS;

    if (hasPath) {
        // White outline under the green line so it stands out on satellite photos
        L.polyline(points, {
            color: '#ffffff',
            weight: 10,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
            bubblingMouseEvents: false
        }).addTo(detailsLayer);

        L.polyline(points, {
            color: '#10b981',
            weight: 5,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
            bubblingMouseEvents: false
        }).addTo(detailsLayer);

        if (!endsNearStart) {
            // Dashed straight line connecting the start to the end
            if (SHOW_START_END_LINK) {
                L.polyline([firstPoint, lastPoint], {
                    color: '#ffffff',
                    weight: 2,
                    opacity: 0.85,
                    dashArray: '4 10',
                    interactive: false
                }).addTo(detailsLayer);
            }

            L.marker(lastPoint, { icon: createEndIcon(), zIndexOffset: 900 })
                .addTo(detailsLayer)
                .bindPopup(buildEndPopup(route, gapMeters), { autoPan: false })
                .bindTooltip('End', PIN_TAG_OPTIONS);
        }
    }

    (route.waypoints || []).forEach((waypoint) => {
        const lat = Number(waypoint.latitude);
        const lng = Number(waypoint.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        L.marker([lat, lng], { icon: createWaypointIcon() })
            .addTo(detailsLayer)
            .bindPopup(buildWaypointPopup(waypoint.name, waypoint.description, waypoint.image), { autoPan: false });
    });

    const startMarker = L.marker(points[0], {
        icon: createStartIcon(route.is_mine),
        zIndexOffset: 1000
    }).addTo(map);

    startMarker.bindPopup(buildRoutePopup(route), { autoPan: false });
    startMarker.on('click', () => focusTrail(route.route_id));

        // A thin line that is always visible, so you can see the walked path without tapping
    let previewLine = null;
    if (hasPath) {
        previewLine = L.polyline(points, {
            color: '#10b981',
            weight: 3,
            opacity: 0.7,
            interactive: false
        }).addTo(map);
    }

    savedTrails.set(route.route_id, { route, startMarker, detailsLayer, points, endsNearStart, previewLine });
}

function focusTrail(routeId) {
    const trail = savedTrails.get(routeId);
    if (!trail) return;

    clearFocusedTrail();

    focusedRouteId = routeId;
    trail.detailsLayer.addTo(map);

    const allPoints = [
        ...trail.points,
        ...(trail.route.waypoints || []).map((waypoint) => [Number(waypoint.latitude), Number(waypoint.longitude)])
    ].filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));

    map.fitBounds(L.latLngBounds(allPoints), {
        paddingTopLeft: [60, 170],
        paddingBottomRight: [60, 240],
        maxZoom: 17,
        animate: true
    });

    trail.startMarker.bindTooltip(trail.endsNearStart ? 'Start and end' : 'Start', PIN_TAG_OPTIONS);
    trail.startMarker.openPopup();
    highlightTrailCard(routeId);
    showFollowButton(routeId);
}

function clearFocusedTrail() {
    hideFollowButton();
    if (focusedRouteId === null) return;

    const trail = savedTrails.get(focusedRouteId);
    if (trail) {
        map.removeLayer(trail.detailsLayer);
        trail.startMarker.closePopup();
        trail.startMarker.unbindTooltip();
    }

    focusedRouteId = null;
    highlightTrailCard(null);
}


// ==========================================
// TRAIL CARDS (at most 3, no scrolling)
// ==========================================

// Used only when a route has no waypoint photo yet
const FALLBACK_PHOTOS = [
    'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80'
];

const DIFFICULTY_BADGE_CLASSES = {
    Easy: 'bg-emerald-400 text-black',
    Moderate: 'bg-lime-300 text-black',
    Challenging: 'bg-white text-black'
};

// Phones show 1 card, small tablets 2, bigger screens all 3
const CARD_VISIBILITY_CLASSES = ['flex', 'hidden sm:flex', 'hidden md:flex'];

function showTrailCardsLoading() {
    byId('hero-cards-list').innerHTML = `
        <div class="skeleton flex-1 max-w-[300px] h-[200px] rounded-2xl"></div>
        <div class="skeleton flex-1 max-w-[300px] h-[200px] rounded-2xl hidden sm:block"></div>
        <div class="skeleton flex-1 max-w-[300px] h-[200px] rounded-2xl hidden md:block"></div>`;
}

function renderTrailCardsError(message) {
    byId('hero-cards-list').innerHTML = `
        <div class="w-full max-w-xl rounded-2xl bg-black/90 border border-white/15 p-5 flex items-center justify-between gap-4">
            <p class="text-sm text-zinc-300">${escapeHtml(message)}</p>
            <button id="retry-trails-btn" type="button"
                class="shrink-0 text-sm font-bold px-4 py-2 rounded-lg bg-white text-black hover:bg-emerald-400 transition-colors">
                Try again
            </button>
        </div>`;

    byId('retry-trails-btn').addEventListener('click', loadSavedRoutes);
}

// Shows the newest 3 routes, or the first 3 matches when something is typed in the search box
function refreshTrailCards() {
    const list = byId('hero-cards-list');
    const matches = getSearchMatches(searchText);

    list.innerHTML = '';

    if (allRoutes.length === 0) {
        list.innerHTML = `
            <div class="w-full max-w-xl rounded-2xl bg-black/90 border border-white/15 p-5 flex items-center justify-between gap-4">
                <p class="text-sm text-zinc-300">No trails yet. Record a route and it will show up here.</p>
                <button id="empty-new-route-btn" type="button"
                    class="shrink-0 text-sm font-bold px-4 py-2 rounded-lg bg-emerald-500 text-black hover:bg-emerald-400 transition-colors">
                    New route
                </button>
            </div>`;
        byId('empty-new-route-btn').addEventListener('click', openRouteModal);
        return;
    }

    if (matches.length === 0) {
        list.innerHTML = `
            <div class="w-full max-w-xl rounded-2xl bg-black/90 border border-white/15 p-5">
                <p class="text-sm text-zinc-300">No trail or place matches "${escapeHtml(searchText)}".</p>
            </div>`;
        return;
    }

    matches.slice(0, MAX_TRAIL_CARDS).forEach((route, index) => {
        list.appendChild(createTrailCard(route, index));
    });
}

function createTrailCard(route, index) {
    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.routeId = route.route_id;
    card.className =
        `trail-card group relative flex-1 min-w-0 max-w-[300px] h-[200px] ${CARD_VISIBILITY_CLASSES[index]} ` +
        'flex-col justify-end rounded-2xl overflow-hidden shadow-2xl border border-white/20 p-5 text-left cursor-pointer';

    const badgeClasses = DIFFICULTY_BADGE_CLASSES[route.difficulty] || DIFFICULTY_BADGE_CLASSES.Moderate;
    const photoUrl = route.cover_image || FALLBACK_PHOTOS[route.route_id % FALLBACK_PHOTOS.length];

    card.innerHTML = `
        <div class="trail-card-fallback absolute inset-0"></div>
        <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(route.name)}"
            class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>

        <div class="relative z-10 text-white min-w-0">
            <span class="inline-block px-2.5 py-1 ${badgeClasses} text-[11px] font-bold rounded-md mb-2">
                ${escapeHtml(route.difficulty)} &middot; ${Number(route.total_distance).toFixed(1)} km
            </span>
            <h4 class="font-display text-lg font-bold leading-snug truncate">${escapeHtml(route.name)}</h4>
            <p class="text-xs text-zinc-300 mt-0.5 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3.5 h-3.5 text-emerald-400 shrink-0">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                <span class="trail-place truncate"></span>
            </p>
        </div>`;

    // If a photo cannot load, the green contour pattern shows instead
    const image = card.querySelector('img');
    image.addEventListener('error', () => image.remove());

    fillPlaceName(card.querySelector('.trail-place'), route);

    card.addEventListener('click', () => focusTrail(route.route_id));

    return card;
}

function highlightTrailCard(routeId) {
    document.querySelectorAll('.trail-card').forEach((card) => {
        const isActive = routeId !== null && Number(card.dataset.routeId) === routeId;
        card.classList.toggle('is-active', isActive);
    });
}


// ==========================================
// PLACE NAMES (turns GPS numbers into "Town, Province")
// ==========================================

const placeRequests = new Map();
let placeLookupQueue = Promise.resolve();

function getPlaceName(lat, lng) {
    const key = `saag-place:${lat.toFixed(3)},${lng.toFixed(3)}`;

    let remembered = null;
    try { remembered = localStorage.getItem(key); } catch (error) { /* storage blocked */ }

    if (remembered) return Promise.resolve(remembered);
    if (placeRequests.has(key)) return placeRequests.get(key);

    // One lookup at a time, about one per second, to be polite to the free service
    const request = new Promise((resolve) => {
        placeLookupQueue = placeLookupQueue.then(async () => {
            let label = null;

            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${lat}&lon=${lng}`
                );
                const data = await response.json();
                const address = data.address || {};

                const smallPlace = address.village || address.suburb || address.neighbourhood ||
                    address.town || address.city_district || address.city || address.municipality;
                const bigPlace = address.city || address.municipality || address.county || address.state;

                label = [...new Set([smallPlace, bigPlace].filter(Boolean))].join(', ') || null;

                if (label) {
                    try { localStorage.setItem(key, label); } catch (error) { /* storage blocked */ }
                }
            } catch (error) {
                console.warn('Place name lookup failed:', error);
            }

            resolve(label);
            await new Promise((done) => setTimeout(done, 1100));
        });
    });

    placeRequests.set(key, request);
    return request;
}

function fillPlaceName(element, route) {
    const start = (route.coordinates || [])[0];

    if (!start) {
        element.textContent = 'Location unknown';
        return;
    }

    if (placeNames.has(route.route_id)) {
        element.textContent = placeNames.get(route.route_id);
        return;
    }

    // Show the numbers right away, then replace them with the real name
    element.textContent = `${start.latitude.toFixed(4)}, ${start.longitude.toFixed(4)}`;

    getPlaceName(start.latitude, start.longitude).then((label) => {
        if (label) element.textContent = label;
    });
}

// Looks up every route's place name so the search box can match locations
function loadPlaceNamesForSearch() {
    allRoutes.forEach((route) => {
        const start = (route.coordinates || [])[0];
        if (!start) return;

        getPlaceName(start.latitude, start.longitude).then((label) => {
            if (!label) return;

            placeNames.set(route.route_id, label);

            if (searchText) {
                refreshTrailCards();
                renderSearchResults();
            }
        });
    });
}


// ==========================================
// SEARCH (trail name or place)
// ==========================================

function getSearchMatches(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);

    if (words.length === 0) return allRoutes;

    return allRoutes
        .map((route) => {
            const name = route.name.toLowerCase();
            const place = (placeNames.get(route.route_id) || '').toLowerCase();

            const foundInName = words.every((word) => name.includes(word));
            const foundInPlace = words.every((word) => place.includes(word));
            const foundAcrossBoth = words.every((word) => name.includes(word) || place.includes(word));

            if (!foundInName && !foundInPlace && !foundAcrossBoth) return null;

            // Name matches come first, then routes in the same place
            return { route, score: (foundInName ? 2 : 0) + (foundInPlace ? 1 : 0) };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.route);
}

function renderSearchResults() {
    const box = byId('search-results');

    if (!searchText) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
    }

    const matches = getSearchMatches(searchText);
    box.classList.remove('hidden');
    box.innerHTML = '';

    if (matches.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'px-4 py-3 text-sm text-zinc-400';
        empty.textContent = `No trail or place matches "${searchText}".`;
        box.appendChild(empty);
    }

    matches.forEach((route) => {
        const place = placeNames.get(route.route_id) || 'Finding place...';

        const row = document.createElement('button');
        row.type = 'button';
        row.className =
            'w-full text-left px-4 py-3 border-b border-white/10 last:border-b-0 hover:bg-emerald-500/15 transition-colors';

        const title = document.createElement('div');
        title.className = 'text-sm font-semibold text-white truncate';
        title.textContent = route.name;

        const detail = document.createElement('div');
        detail.className = 'text-xs text-zinc-400 truncate mt-0.5';
        detail.textContent = `${place}, ${Number(route.total_distance).toFixed(1)} km`;

        row.appendChild(title);
        row.appendChild(detail);
        row.addEventListener('click', () => chooseSearchResult(route));
        box.appendChild(row);
    });

    // Let people know place matching is still warming up
    const stillLooking = allRoutes.some((route) => (route.coordinates || []).length && !placeNames.has(route.route_id));
    if (stillLooking) {
        const note = document.createElement('p');
        note.className = 'px-4 py-2 text-xs text-zinc-500 border-t border-white/10';
        note.textContent = 'Still looking up place names. Search by place may show more in a moment.';
        box.appendChild(note);
    }
}

function chooseSearchResult(route) {
    byId('search-results').classList.add('hidden');
    byId('trail-search').value = route.name;
    byId('clear-search-btn').classList.remove('hidden');
    focusTrail(route.route_id);
}

function updateSearch() {
    const input = byId('trail-search');
    searchText = input.value.trim();

    byId('clear-search-btn').classList.toggle('hidden', input.value === '');

    refreshTrailCards();
    renderSearchResults();
}

function initSearch() {
    const input = byId('trail-search');

    input.addEventListener('input', updateSearch);
    input.addEventListener('focus', renderSearchResults);

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const firstMatch = getSearchMatches(searchText)[0];
            if (searchText && firstMatch) chooseSearchResult(firstMatch);
        }
        if (event.key === 'Escape') {
            byId('search-results').classList.add('hidden');
            input.blur();
        }
    });

    byId('clear-search-btn').addEventListener('click', () => {
        input.value = '';
        updateSearch();
        input.focus();
    });

    // Click anywhere else to close the result list
    document.addEventListener('click', (event) => {
        if (!byId('search-box').contains(event.target)) {
            byId('search-results').classList.add('hidden');
        }
    });
}

// ==========================================
// FOLLOW A ROUTE (like walking directions)
// ==========================================

const FOLLOW_START_METERS = 30;       // this close to the start = you are on the trail
const FOLLOW_ARRIVE_METERS = 25;      // this close to the end = you have arrived
const FOLLOW_OFF_ROUTE_METERS = 40;   // farther than this from the line = off the route
const FOLLOW_LOOK_AHEAD_POINTS = 40;  // how many points ahead we search for your position

let followTrail = null;        // { name, points, distanceFromStart, totalMeters }
let followWatcher = null;
let followLayer = null;
let followLines = {};          // toStart, done, left, leftOutline
let followDot = null;
let followProgress = 0;        // the furthest route point you have reached
let followStage = 'to-start';  // 'to-start', 'on-trail' or 'arrived'
let followCameraOn = true;

function showFollowButton(routeId) {
    let button = byId('follow-route-btn');

    if (!button) {
        button = document.createElement('button');
        button.id = 'follow-route-btn';
        button.type = 'button';
        button.textContent = 'Follow this route';
        button.className =
            'absolute top-16 right-4 z-20 px-4 h-10 rounded-xl bg-white hover:bg-zinc-200 ' +
            'text-black text-sm font-bold shadow-xl transition-colors';
        byId('view-home').appendChild(button);
    }

    button.onclick = () => startFollowRoute(routeId);
    button.classList.toggle('hidden', isRecording || followTrail !== null);
}

function hideFollowButton() {
    const button = byId('follow-route-btn');
    if (button) button.classList.add('hidden');
}

function showFollowPanel(routeName) {
    let panel = byId('follow-panel');

    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'follow-panel';
        panel.className =
            'absolute top-16 right-4 left-4 sm:left-auto sm:w-80 z-20 rounded-2xl bg-black/95 ' +
            'border border-emerald-400/50 p-4 shadow-2xl text-white';
        panel.innerHTML = `
            <p id="follow-title" class="font-display font-bold text-base truncate"></p>
            <p id="follow-message" class="text-sm text-zinc-300 mt-1"></p>
            <div class="flex gap-2 mt-3">
                <button id="follow-center-btn" type="button"
                    class="flex-1 py-2 rounded-lg border border-white/20 text-sm font-semibold hover:bg-white hover:text-black transition-colors">
                    Center on me
                </button>
                <button id="follow-stop-btn" type="button"
                    class="flex-1 py-2 rounded-lg bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-colors">
                    Stop
                </button>
            </div>`;
        byId('view-home').appendChild(panel);

        byId('follow-center-btn').addEventListener('click', () => {
            followCameraOn = true;
            if (followDot) map.panTo(followDot.getLatLng(), { animate: true });
        });
        byId('follow-stop-btn').addEventListener('click', stopFollowRoute);
    }

    byId('follow-title').textContent = routeName;
    byId('follow-message').textContent = 'Finding your location...';
    panel.classList.remove('hidden');
}

function setFollowMessage(text) {
    const message = byId('follow-message');
    if (message) message.textContent = text;
}

function startFollowRoute(routeId) {
    const trail = savedTrails.get(routeId);

    if (isRecording) {
        showToast('Finish your current recording first.', 'info');
        return;
    }
    if (!trail || trail.points.length < 2) {
        showToast('This route does not have a path to follow yet.', 'error');
        return;
    }
    if (!navigator.geolocation) {
        showToast('This browser does not support GPS.', 'error');
        return;
    }

    stopFollowRoute();   // clean up if you were already following another route

    // How far each point is from the start, so we can tell how much route is left
    const points = trail.points;
    const distanceFromStart = [0];
    for (let i = 1; i < points.length; i++) {
        distanceFromStart.push(
            distanceFromStart[i - 1] +
            getDistance(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
        );
    }

    followTrail = {
        name: trail.route.name,
        points,
        distanceFromStart,
        totalMeters: distanceFromStart[points.length - 1]
    };
    followProgress = 0;
    followStage = 'to-start';
    followCameraOn = true;

    clearFocusedTrail();
    hideFollowButton();
    byId('hero-cards-container').classList.add('hidden');

    // Draw the route
    followLayer = L.layerGroup().addTo(map);

    followLines.toStart = L.polyline([], {
        color: '#ffffff', weight: 3, opacity: 0.9, dashArray: '4 10', interactive: false
    }).addTo(followLayer);

    followLines.done = L.polyline([points[0]], {
        color: '#a1a1aa', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false
    }).addTo(followLayer);

    followLines.leftOutline = L.polyline(points, {
        color: '#ffffff', weight: 11, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false
    }).addTo(followLayer);

    followLines.left = L.polyline(points, {
        color: '#10b981', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false
    }).addTo(followLayer);

    L.marker(points[0], { icon: createStartIcon(false), zIndexOffset: 900 })
        .addTo(followLayer).bindTooltip('Start', PIN_TAG_OPTIONS);

    L.marker(points[points.length - 1], { icon: createEndIcon(), zIndexOffset: 900 })
        .addTo(followLayer).bindTooltip('End', PIN_TAG_OPTIONS);

    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 17 });
    map.on('dragstart', pauseFollowCamera);

    showFollowPanel(followTrail.name);

    followWatcher = navigator.geolocation.watchPosition(
        onFollowPosition,
        (error) => showToast(describeGpsError(error), 'error'),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
}

function pauseFollowCamera() {
    followCameraOn = false;
}

// Finds the route point closest to you, looking only between two positions in the list
function nearestRoutePoint(here, fromIndex, toIndex) {
    const points = followTrail.points;
    const lastIndex = Math.min(toIndex, points.length - 1);

    let bestIndex = fromIndex;
    let bestMeters = Infinity;

    for (let i = fromIndex; i <= lastIndex; i++) {
        const meters = getDistance(here[0], here[1], points[i][0], points[i][1]);
        if (meters < bestMeters) {
            bestMeters = meters;
            bestIndex = i;
        }
    }

    return { index: bestIndex, meters: bestMeters };
}

function onFollowPosition(position) {
    if (!followTrail || followStage === 'arrived') return;

    const here = [position.coords.latitude, position.coords.longitude];
    const { points, distanceFromStart, totalMeters } = followTrail;

    if (!followDot) {
        followDot = L.marker(here, {
            icon: L.divIcon({ className: '', html: '<div class="live-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
            zIndexOffset: 1100
        }).addTo(followLayer);
    } else {
        followDot.setLatLng(here);
    }

    if (followCameraOn) map.panTo(here, { animate: true });

    // Part 1: walk to the start (white dashed line shrinks as you get closer)
    if (followStage === 'to-start') {
        const metersToStart = getDistance(here[0], here[1], points[0][0], points[0][1]);

        if (metersToStart > FOLLOW_START_METERS) {
            followLines.toStart.setLatLngs([here, points[0]]);
            setFollowMessage(`Head to the start: ${formatDistance(metersToStart)} away.`);
            return;
        }

        followStage = 'on-trail';
        followLines.toStart.setLatLngs([]);
        showToast('You are at the start. Follow the green line.', 'success');
    }

    // Part 2: find where you are on the route
    let nearest = nearestRoutePoint(here, followProgress, followProgress + FOLLOW_LOOK_AHEAD_POINTS);

    if (nearest.meters > FOLLOW_OFF_ROUTE_METERS) {
        nearest = nearestRoutePoint(here, followProgress, points.length - 1);
    }

    if (nearest.meters > FOLLOW_OFF_ROUTE_METERS) {
        followLines.toStart.setLatLngs([here, points[nearest.index]]);
        setFollowMessage(`You are ${formatDistance(nearest.meters)} off the route. Follow the white dashed line back.`);
        return;
    }

    followLines.toStart.setLatLngs([]);
    followProgress = Math.max(followProgress, nearest.index);

    // The line ahead of you gets shorter, the walked part turns gray
    const lineAhead = [here, ...points.slice(followProgress + 1)];
    followLines.left.setLatLngs(lineAhead);
    followLines.leftOutline.setLatLngs(lineAhead);
    followLines.done.setLatLngs(points.slice(0, followProgress + 1));

    const metersLeft = totalMeters - distanceFromStart[followProgress];

    if (metersLeft <= FOLLOW_ARRIVE_METERS) {
        followStage = 'arrived';
        navigator.geolocation.clearWatch(followWatcher);
        followWatcher = null;
        followLines.left.setLatLngs([]);
        followLines.leftOutline.setLatLngs([]);
        setFollowMessage('You have arrived. Nice hike!');
        showToast('You reached the end of the route.', 'success');
        return;
    }

    setFollowMessage(`${formatDistance(metersLeft)} left to the end.`);
}

function stopFollowRoute() {
    if (followWatcher !== null) {
        navigator.geolocation.clearWatch(followWatcher);
        followWatcher = null;
    }

    map.off('dragstart', pauseFollowCamera);

    if (followLayer) {
        map.removeLayer(followLayer);
        followLayer = null;
    }

    followLines = {};
    followDot = null;
    followTrail = null;
    followProgress = 0;
    followStage = 'to-start';

    const panel = byId('follow-panel');
    if (panel) panel.classList.add('hidden');

    if (!isRecording) byId('hero-cards-container').classList.remove('hidden');
}

// ==========================================
// SIDEBAR (phones)
// ==========================================

function openSidebar() {
    byId('sidebar-header').classList.remove('-translate-x-full');
}

function closeSidebar() {
    byId('sidebar-header').classList.add('-translate-x-full');
}


// ==========================================
// BUTTONS AND KEYBOARD
// ==========================================

function initEvents() {
    initSearch();

        // Let the sidebar links open their real pages (main.js would otherwise catch the click)
    document.querySelectorAll('#sidebar-header .nav-link').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.stopImmediatePropagation();
        }, true);
    });

    // New route panel: every way to leave it works
    byId('new-route-btn').addEventListener('click', openRouteModal);
    byId('close-route-modal').addEventListener('click', closeRouteModal);
    byId('cancel-route-btn').addEventListener('click', closeRouteModal);
    byId('save-route-btn').addEventListener('click', createRoute);
    byId('gps-retry-btn').addEventListener('click', requestStartLocation);

    byId('route-name').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !byId('save-route-btn').disabled) createRoute();
    });

    // Waypoint panel
    byId('add-waypoint-btn').addEventListener('click', openWaypointModal);
    byId('close-waypoint-modal').addEventListener('click', closeWaypointModal);
    byId('cancel-waypoint-btn').addEventListener('click', closeWaypointModal);
    byId('save-waypoint-btn').addEventListener('click', saveWaypoint);
    byId('waypoint-photo').addEventListener('change', showPhotoPreview);

    // Recording controls
    byId('stop-route-btn').addEventListener('click', stopRoute);
    byId('recenter-btn').addEventListener('click', () => {
        followUser = true;
        if (currentPosition) map.panTo(currentPosition, { animate: true });
    });

    // Click the dark area or press Escape to close a panel
    byId('panel-backdrop').addEventListener('click', closeAllPanels);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeAllPanels();
    });

    // Phone menu
    byId('open-sidebar-btn').addEventListener('click', openSidebar);
    byId('close-sidebar-btn').addEventListener('click', closeSidebar);
    document.querySelectorAll('#sidebar-header .nav-link').forEach((link) => {
        link.addEventListener('click', closeSidebar);
    });
}

// ==========================================
// AUTO REFRESH (shows routes other people just saved)
// ==========================================

const AUTO_REFRESH_SECONDS = 30;

function startAutoRefresh() {
    setInterval(() => {
        // Do not disturb someone who is in the middle of a walk, or a hidden tab
        if (isRecording || document.hidden) return;
        loadSavedRoutes({ quiet: true });
    }, AUTO_REFRESH_SECONDS * 1000);

    // Catch up right away when you come back to this tab
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !isRecording) loadSavedRoutes({ quiet: true });
    });
}