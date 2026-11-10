/**
 * home.js - Leaflet satellite map with click-to-pin modal and sliding Heroes overlay drawer
 */

let map;
let activeMarker = null;

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initModalEvents();
    initHeroesEvents();
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

    // 4. Handle Map Clicks to Get Geolocation & Open Modal
    map.on('click', (e) => {
        const clickLat = e.latlng.lat;
        const clickLng = e.latlng.lng;

        document.getElementById('modal-coords').textContent = 'Fetching location...';
        document.getElementById('modal-title-input').value = 'My Current Location';
        document.getElementById('modal-desc-input').value = 'Retrieving GPS coordinates...';
        openModal();

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    const accuracy = position.coords.accuracy;
                    updateMapAndModal(userLat, userLng, `GPS Position (Accurate to ~${Math.round(accuracy)}m)`);
                },
                (error) => {
                    console.warn("Geolocation fallback to click point.", error.message);
                    updateMapAndModal(clickLat, clickLng, 'Selected Map Point');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            updateMapAndModal(clickLat, clickLng, 'Selected Map Point');
        }
    });

    window.addEventListener('resize', () => {
        map.invalidateSize();
    });
}

function updateMapAndModal(lat, lng, descriptionText) {
    if (activeMarker) {
        map.removeLayer(activeMarker);
    }

    const latLng = [lat, lng];
    const customGreenIcon = L.divIcon({
        className: 'custom-map-marker',
        html: '<div class="w-5 h-5 bg-emerald-400 rounded-full border-2 border-white shadow-md animate-bounce cursor-pointer"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    activeMarker = L.marker(latLng, { icon: customGreenIcon }).addTo(map);
    map.setView(latLng, 16, { animate: true });

    const coordsText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('modal-coords').textContent = coordsText;
    document.getElementById('modal-desc-input').value = descriptionText;
}

function initModalEvents() {
    const closeBtn = document.getElementById('close-modal-btn');
    const saveBtn = document.getElementById('save-location-btn');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const title = document.getElementById('modal-title-input').value || 'Unnamed Location';
            alert(`Location "${title}" saved successfully!`);
            closeModal();
        });
    }
}

function openModal() {
    const modal = document.getElementById('location-modal');
    if (modal) modal.classList.remove('translate-x-full');
}

function closeModal() {
    const modal = document.getElementById('location-modal');
    if (modal) modal.classList.add('translate-x-full');
}

// --- Heroes Drawer Controls ---
function initHeroesEvents() {
    const openHeroesBtn = document.getElementById('open-heroes-btn');
    const closeHeroesBtn = document.getElementById('close-heroes-btn');

    if (openHeroesBtn) {
        openHeroesBtn.addEventListener('click', () => {
            const heroesModal = document.getElementById('heroes-modal');
            if (heroesModal) heroesModal.classList.remove('-translate-x-full');
        });
    }

    if (closeHeroesBtn) {
        closeHeroesBtn.addEventListener('click', () => {
            const heroesModal = document.getElementById('heroes-modal');
            if (heroesModal) heroesModal.classList.add('-translate-x-full');
        });
    }
}