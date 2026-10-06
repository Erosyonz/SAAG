// home.js

// 1. Configure Tailwind theme extensions
tailwind.config = {
    theme: {
        extend: {
            colors: {
                forest: { 100: '#dcfce7', 700: '#15803d', 800: '#1e3d2f', 900: '#142920', 950: '#0b1712' },
                terracotta: { 50: '#fff7ed', 100: '#ffedd5', 500: '#d96b43', 600: '#c2542d' },
                amber: { 400: '#fbbf24' }
            },
            fontFamily: { sans: ['Outfit', 'sans-serif'] }
        }
    }
};

// 2. Wrap all DOM and Map logic inside DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    
    // Initialize Lucide icons if available
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Safety check: ensure map element exists on current template
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    // Default Trail Coordinates
    const initialLat = 10.3167;
    const initialLng = 123.8907;
    const initialZoom = 12;

    // Initialize Leaflet map
    const map = L.map('map').setView([initialLat, initialLng], initialZoom);
    const apiKey = window.CARTO_API_KEY || '';

    // Add OpenStreetMap tile layer
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${apiKey}`, {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    
    // Force Leaflet to recalculate map dimensions once layout settles
    setTimeout(() => {
        map.invalidateSize();
    }, 200);

    // Track created Leaflet marker instances
    let markers = [];

    // DOM Elements
    const pinList = document.getElementById('pin-list');
    const emptyState = document.getElementById('empty-state');
    const clearBtn = document.getElementById('clear-btn');
    const pinCount = document.getElementById('pin-count');

    // Helper to sync count badge UI
    function updatePinCount() {
        if (pinCount) {
            pinCount.textContent = `${markers.length} ${markers.length === 1 ? 'Pin' : 'Pins'}`;
        }
    }

    // Helper function to add a pin to the map & sidebar list
    function addPin(lat, lng, label = null) {
        if (emptyState) {
            emptyState.style.display = 'none';
        }

        // Create Leaflet marker
        const marker = L.marker([lat, lng]).addTo(map);
        const pinIndex = markers.length + 1;
        const pinTitle = label || `Waypoint #${pinIndex}`;

        // Bind popup to marker
        marker
            .bindPopup(`
                <div class="text-xs font-sans">
                    <strong style="color: #1e3d2f;">${pinTitle}</strong><br>
                    Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}
                </div>
            `)
            .openPopup();

        markers.push(marker);
        updatePinCount();

        // Append new location card to sidebar list
        if (pinList) {
            const li = document.createElement('li');
            li.className = 'p-3 bg-slate-50 border-l-4 border-forest-800 rounded-lg flex justify-between items-center shadow-sm text-xs';
            li.innerHTML = `
                <div>
                    <span class="font-bold text-slate-800 block">${pinTitle}</span>
                    <span class="text-slate-500 font-mono">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
                </div>
                <i class="fa-solid fa-location-crosshairs text-forest-700"></i>
            `;
            pinList.appendChild(li);
        }
    }

    // Add default initial marker
    addPin(initialLat, initialLng, "Trailhead Center");

    // Map click event listener
    map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        addPin(lat, lng);
    });

    // Clear button event listener
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            markers.forEach((marker) => map.removeLayer(marker));
            markers = [];

            if (pinList) pinList.innerHTML = '';
            if (emptyState) {
                emptyState.style.display = 'block';
                pinList.appendChild(emptyState);
            }
            updatePinCount();
        });
    }
});