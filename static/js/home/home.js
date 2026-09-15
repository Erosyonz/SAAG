// home.js

// Configure Tailwind theme extensions
tailwind.config = {
    theme: {
        extend: {
            colors: {
                forest: { 800: '#1e3d2f', 900: '#142920', 950: '#0b1712' },
                terracotta: { 500: '#d96b43', 600: '#c2542d' },
                amber: { 400: '#fbbf24' }
            },
            fontFamily: { sans: ['Outfit', 'sans-serif'] }
        }
    }
};

// Initialize Lucide icons on page load
document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});