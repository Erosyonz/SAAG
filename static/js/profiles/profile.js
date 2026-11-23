/**
 * profile.js
 * SA-AG - Profile page: route tabs, edit panel, photo upload
 */

const byId = (id) => document.getElementById(id);

const PANEL_HIDDEN_CLASSES = ['translate-x-full', 'invisible', 'pointer-events-none'];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;


// ==========================================
// SMALL MESSAGES
// ==========================================

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
// TABS (created / finished)
// ==========================================

function showTab(name) {
    ['created', 'completed'].forEach((tabName) => {
        byId(`tab-${tabName}`).classList.toggle('hidden', tabName !== name);
    });

    document.querySelectorAll('.tab-btn').forEach((button) => {
        const isActive = button.dataset.tab === name;
        button.setAttribute('aria-selected', String(isActive));
        button.classList.toggle('border-emerald-400', isActive);
        button.classList.toggle('text-white', isActive);
        button.classList.toggle('border-transparent', !isActive);
        button.classList.toggle('text-zinc-400', !isActive);
    });
}


// ==========================================
// EDIT PANEL
// ==========================================

function openEditPanel() {
    byId('edit-panel').classList.remove(...PANEL_HIDDEN_CLASSES);
    byId('panel-backdrop').classList.remove('opacity-0', 'pointer-events-none');
    updateBioCount();
    setTimeout(() => byId('first-name').focus(), 320);
}

function closeEditPanel() {
    byId('edit-panel').classList.add(...PANEL_HIDDEN_CLASSES);
    byId('panel-backdrop').classList.add('opacity-0', 'pointer-events-none');
}

function updateBioCount() {
    const bio = byId('bio');
    byId('bio-count').textContent = `${bio.value.length} / ${bio.maxLength}`;
}


// ==========================================
// PROFILE PHOTO
// ==========================================

function showPhotoPreview() {
    const file = byId('photo-input').files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
        showToast('Only JPG and PNG photos are allowed.', 'error');
        byId('photo-input').value = '';
        return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
        showToast('The photo must be 5 MB or smaller.', 'error');
        byId('photo-input').value = '';
        return;
    }

    byId('photo-preview').src = URL.createObjectURL(file);
    byId('photo-preview').classList.remove('hidden');
    byId('photo-initial').classList.add('hidden');
    byId('remove-photo').value = '0';
}

function removePhoto() {
    byId('photo-input').value = '';
    byId('remove-photo').value = '1';
    byId('photo-preview').classList.add('hidden');
    byId('photo-initial').classList.remove('hidden');
}


// ==========================================
// SAVE PROFILE
// ==========================================

async function saveProfile(event) {
    event.preventDefault();

    const form = byId('profile-form');
    const saveButton = byId('save-profile-btn');

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
        // The form carries the CSRF token and the photo file with it
        const response = await fetch(form.dataset.url, {
            method: 'POST',
            body: new FormData(form)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to save your profile.');
        }

        showToast('Profile saved.', 'success');

        // Reload so the name, photo and bio show the saved values
        setTimeout(() => window.location.reload(), 600);

    } catch (error) {
        console.error('Profile saving error:', error);
        showToast(error.message, 'error');
        saveButton.disabled = false;
        saveButton.textContent = 'Save changes';
    }
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
// START UP
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach((button) => {
        button.addEventListener('click', () => showTab(button.dataset.tab));
    });

    byId('open-edit-btn').addEventListener('click', openEditPanel);
    byId('close-edit-btn').addEventListener('click', closeEditPanel);
    byId('cancel-edit-btn').addEventListener('click', closeEditPanel);
    byId('panel-backdrop').addEventListener('click', closeEditPanel);

    byId('photo-input').addEventListener('change', showPhotoPreview);
    byId('remove-photo-btn').addEventListener('click', removePhoto);
    byId('bio').addEventListener('input', updateBioCount);
    byId('profile-form').addEventListener('submit', saveProfile);

    byId('open-sidebar-btn').addEventListener('click', openSidebar);
    byId('close-sidebar-btn').addEventListener('click', closeSidebar);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeEditPanel();
    });
});