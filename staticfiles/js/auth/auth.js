/**
 * auth.js
 * SA-AG - login and register pages
 */

const byId = (id) => document.getElementById(id);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;


// ==========================================
// SMALL MESSAGES
// ==========================================

function showNotice(message, type = 'info') {
    const area = byId('notice-area');
    if (!area) return;

    const colors = {
        success: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200',
        error: 'border-red-400/50 bg-red-500/10 text-red-200',
        info: 'border-white/20 bg-white/5 text-zinc-200'
    }[type] || 'border-white/20 bg-white/5 text-zinc-200';

    area.innerHTML = '';

    const notice = document.createElement('div');
    notice.className = `mb-5 rounded-xl border px-4 py-3 text-sm ${colors}`;
    notice.textContent = message;
    area.appendChild(notice);
}


// ==========================================
// PASSWORD SHOW / HIDE
// ==========================================

function setUpPasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach((button) => {
        button.addEventListener('click', () => {
            const input = byId(button.dataset.togglePassword);
            const isShowing = input.type === 'text';

            input.type = isShowing ? 'password' : 'text';
            button.querySelector('.eye-open').classList.toggle('hidden', !isShowing);
            button.querySelector('.eye-closed').classList.toggle('hidden', isShowing);
            button.setAttribute('aria-label', isShowing ? 'Show password' : 'Hide password');
        });
    });
}


// ==========================================
// LOGIN PAGE
// ==========================================

function setUpForgotPassword() {
    const button = byId('forgot-password-btn');
    if (!button) return;

    button.addEventListener('click', () => {
        showNotice('Password reset is not set up yet. Please ask a SAAG admin to reset it for you.', 'info');
    });
}


// ==========================================
// REGISTER PAGE
// ==========================================

function setUpPhotoPreview() {
    const input = byId('photo-input');
    if (!input) return;

    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;

        if (!['image/jpeg', 'image/png'].includes(file.type)) {
            showNotice('Only JPG and PNG photos are allowed.', 'error');
            input.value = '';
            return;
        }

        if (file.size > MAX_PHOTO_BYTES) {
            showNotice('The photo must be 5 MB or smaller.', 'error');
            input.value = '';
            return;
        }

        byId('photo-preview').src = URL.createObjectURL(file);
        byId('photo-preview').classList.remove('hidden');
        byId('photo-placeholder').classList.add('hidden');
        byId('notice-area').innerHTML = '';
    });
}

function setUpPasswordMatchCheck() {
    const form = byId('register-form');
    if (!form) return;

    form.addEventListener('submit', (event) => {
        if (byId('reg-pass').value !== byId('confirm-pass').value) {
            event.preventDefault();
            showNotice('The two passwords do not match.', 'error');
            byId('confirm-pass').focus();
        }
    });
}


// ==========================================
// START UP
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    setUpPasswordToggles();
    setUpForgotPassword();
    setUpPhotoPreview();
    setUpPasswordMatchCheck();
});