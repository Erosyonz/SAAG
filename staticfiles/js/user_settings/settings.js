// Configure Tailwind theme extensions dynamically
if (window.tailwind) {
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    forest: {
                        800: '#2d5a27',
                        900: '#1e3d1a',
                        950: '#0f200d',
                    },
                    terracotta: {
                        500: '#e07a5f',
                        600: '#d15d3d',
                    }
                }
            }
        }
    };
}

document.addEventListener("DOMContentLoaded", function () {
    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // Client-side password verification for Django PasswordChangeForm
    const form = document.querySelector("form");
    if (form) {
        form.addEventListener("submit", function (e) {
            // Target standard Django PasswordChangeForm field names safely
            const newPasswordInput = document.querySelector('input[name="new_password1"]');
            const confirmPasswordInput = document.querySelector('input[name="new_password2"]');

            if (newPasswordInput && confirmPasswordInput) {
                if (newPasswordInput.value !== confirmPasswordInput.value) {
                    e.preventDefault();
                    alert("New passwords do not match. Please try again.");
                }
            }
        });
    }
});