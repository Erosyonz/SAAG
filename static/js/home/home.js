/**
 * home.js - Leaflet satellite map that gets user geolocation on click and displays it in the modal
 */

let map;
let activeMarker = null;

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initModalEvents();
});

function initMap() {
    const container = document.getElementById('mapbox-container');
    if (!container) return;

    // 1. Initialize Leaflet Map filling the container completely
    map = L.map(container, {
        zoomControl: false,
        attributionControl: false
    }).setView([10.3157, 123.8907], 13); // Centered over Cebu / Cordova region

    // 2. Add Free Public Satellite Tile Layer (Esri World Imagery)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
    }).addTo(map);

    // 3. Move Zoom Control to Bottom Left
    L.control.zoom({
        position: 'bottomleft'
    }).addTo(map);

    // 4. Handle Map Clicks to Get User Location & Open Modal
    map.on('click', (e) => {
        // Fallback clicked coordinates in case geolocation is denied or loading
        const clickLat = e.latlng.lat;
        const clickLng = e.latlng.lng;

        // Set initial loading state in the modal
        document.getElementById('modal-coords').textContent = 'Fetching location...';
        document.getElementById('modal-title-input').value = 'My Current Location';
        document.getElementById('modal-desc-input').value = 'Retrieving GPS coordinates...';
        openModal();

        // Check if browser supports Geolocation
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // Success: Get actual user GPS location
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    const accuracy = position.coords.accuracy;

                    updateMapAndModal(userLat, userLng, `GPS Position (Accurate to ~${Math.round(accuracy)}m)`);
                },
                (error) => {
                    // Error/Denied: Fall back to the exact map point the user clicked
                    console.warn("Geolocation permission denied or unavailable. Using clicked point.", error.message);
                    updateMapAndModal(clickLat, clickLng, 'Selected Map Point');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            // Fallback if Geolocation API is not supported by browser
            updateMapAndModal(clickLat, clickLng, 'Selected Map Point');
        }
    });

    // Ensure map resizes correctly when window size or layout shifts
    window.addEventListener('resize', () => {
        map.invalidateSize();
    });
}

/**
 * Drops the marker and populates the modal with the given coordinates
 */
function updateMapAndModal(lat, lng, descriptionText) {
    // Remove previous temporary marker if it exists
    if (activeMarker) {
        map.removeLayer(activeMarker);
    }

    const latLng = [lat, lng];

    // Custom green pulsing dot icon
    const customGreenIcon = L.divIcon({
        className: 'custom-map-marker',
        html: '<div class="w-5 h-5 bg-emerald-400 rounded-full border-2 border-white shadow-md animate-bounce cursor-pointer"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    // Drop marker at user/clicked position and pan map smoothly to it
    activeMarker = L.marker(latLng, { icon: customGreenIcon }).addTo(map);
    map.setView(latLng, 16, { animate: true });

    // Populate modal fields
    const coordsText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('modal-coords').textContent = coordsText;
    document.getElementById('modal-desc-input').value = descriptionText;
}

function initModalEvents() {
    const closeBtn = document.getElementById('close-modal-btn');
    const saveBtn = document.getElementById('save-location-btn');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const title = document.getElementById('modal-title-input').value || 'Unnamed Location';
            const description = document.getElementById('modal-desc-input').value;
            const coords = document.getElementById('modal-coords').textContent;

            console.log("Saving location:", { title, description, coords });
            alert(`Location "${title}" saved successfully!`);
            
            closeModal();
        });
    }
}

function openModal() {
    const modal = document.getElementById('location-modal');
    if (modal) {
        modal.classList.remove('translate-x-full');
    }
}

function closeModal() {
    const modal = document.getElementById('location-modal');
    if (modal) {
        modal.classList.add('translate-x-full');
    }
}