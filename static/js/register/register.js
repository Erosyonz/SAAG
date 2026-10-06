// register.js

// Tailwind configuration & Lucide setup
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

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// Password Show/Hide Toggle helper
function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.setAttribute('data-lucide', 'eye-off');
    } else {
        input.type = 'password';
        icon.setAttribute('data-lucide', 'eye');
    }
    lucide.createIcons();
}

// Display inline feedback message
function showAlert(message, type = 'success') {
    const alertBox = document.getElementById('alert-box');
    const alertMsg = document.getElementById('alert-msg');
    const alertIcon = document.getElementById('alert-icon');

    alertBox.classList.remove('hidden', 'bg-emerald-100', 'text-emerald-800', 'bg-amber-100', 'text-amber-800');
    
    if (type === 'success') {
        alertBox.classList.add('bg-emerald-100', 'text-emerald-800');
        alertIcon.setAttribute('data-lucide', 'check-circle-2');
    } else {
        alertBox.classList.add('bg-amber-100', 'text-amber-800');
        alertIcon.setAttribute('data-lucide', 'info');
    }

    alertMsg.innerText = message;
    lucide.createIcons();
}

// Handle Sign Up redirect / submission logic
function handleSignUpRedirect(event) {
    if (window.location.protocol === 'file:' || !window.location.pathname.includes('register')) {
        // Reserved for custom redirection logic if needed
    }
}