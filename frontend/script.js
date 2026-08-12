// frontend/script.js - COMPLETE WITH JWT AUTH + FORGOT PASSWORD

// ============================================
// API CONFIGURATION
// ============================================
const API_URL = (() => {
  // Production (Vercel) - use relative path
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return '/api'; // Vercel handles /api routes
  }
  // Development (Local)
  return 'http://localhost:5000/api';
})();

console.log('🔗 API URL:', API_URL);

let currentUser = null;
let authToken = null;
let currentImageFile = null;
let currentAnalysis = null;
let customConditions = [];

// Camera variables
let cameraStream = null;
let detectionInterval = null;
let isAutoMode = true;
let canvasContext = null;
let videoElement = null;
let canvasElement = null;
let modalElement = null;

// Barcode Scanner variables
let barcodeStream = null;
let barcodeScanner = null;
let isBarcodeScanning = false;
let barcodeTorchOn = false;
let isBarcodeScannerActive = false;

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function showBarcodeLoading(message = 'Fetching product details...') {
    document.getElementById('barcodeLoadingText').textContent = message;
    document.getElementById('barcodeLoadingOverlay').style.display = 'flex';
}

function hideBarcodeLoading() {
    document.getElementById('barcodeLoadingOverlay').style.display = 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Force layout so the entrance animation actually plays
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
        setTimeout(() => toast.remove(), 400); // safety fallback
    }, 3000);
}

// ============================================
// AUTHENTICATION FUNCTIONS (JWT BASED)
// ============================================

async function login(email, password) {
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('nutriscan_token', authToken);
            localStorage.setItem('nutriscan_user', JSON.stringify(currentUser));
            showMainApp();
            loadUserProfile();
            showToast('✅ Login successful!', 'success');
            return true;
        } else {
            showToast(data.error || 'Invalid email or password', 'error');
            return false;
        }
    } catch (error) {
        showToast('Network error. Please try again.', 'error');
        return false;
    }
}

async function signup(name, email, password) {
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (data.success) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('nutriscan_token', authToken);
            localStorage.setItem('nutriscan_user', JSON.stringify(currentUser));
            showMainApp();
            loadUserProfile();
            showToast('✅ Account created! Welcome!', 'success');
            return true;
        } else {
            showToast(data.error || 'Registration failed', 'error');
            return false;
        }
    } catch (error) {
        showToast('Network error. Please try again.', 'error');
        return false;
    }
}

async function forgotPassword(email) {
    const submitBtn = document.querySelector('#forgotPasswordForm .auth-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;

        if (data.success) {
            showToast('✅ Password reset link sent to your email! Please check your inbox.', 'success');
            
            document.getElementById('forgotEmail').value = '';
            
            setTimeout(() => {
                switchAuthTab('login');
            }, 3000);
            return true;
        } else {
            showToast(data.error || 'Email not found', 'error');
            return false;
        }
    } catch (error) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        showToast('Network error. Please try again.', 'error');
        return false;
    }
}

async function resetPassword(token, newPassword) {
    const submitBtn = document.querySelector('#resetPasswordForm .auth-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
    submitBtn.disabled = true;

    try {
        console.log('🔐 Attempting password reset with token:', token);

        const response = await fetch(`${API_URL}/auth/reset-password/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            console.warn(`⚠️ Reset password failed (${response.status}):`, data.error);
        }

        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;

        if (data.success) {
            document.getElementById('resetNewPassword').value = '';
            document.getElementById('resetConfirmPassword').value = '';
            document.getElementById('resetPasswordForm').dataset.token = '';

            // Show the success overlay instead of trying to switch forms —
            // the page is still in reset-mode (from the /reset-password/:token
            // URL), and reset-mode's CSS force-hides the login form, so the
            // overlay (outside that scope) is what actually gets seen.
            const overlay = document.getElementById('resetSuccessOverlay');
            if (overlay) {
                overlay.style.display = 'flex';
            }

            return true;
        } else {
            showToast(data.error || 'Reset failed', 'error');
            return false;
        }
    } catch (error) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        showToast('Network error. Please try again.', 'error');
        return false;
    }
}

function logout() {
    localStorage.removeItem('nutriscan_token');
    localStorage.removeItem('nutriscan_user');
    currentUser = null;
    authToken = null;
    const authContainerEl = document.getElementById('authContainer');
    authContainerEl.classList.add('active');
    authContainerEl.classList.remove('hidden');
    authContainerEl.scrollTop = 0;
    document.getElementById('mainContainer').classList.remove('active');
    showPage('homePage');
    showToast('Logged out successfully', 'info');
}

function checkAuth() {
    const token = localStorage.getItem('nutriscan_token');
    const user = localStorage.getItem('nutriscan_user');
    
    if (token && user) {
        authToken = token;
        currentUser = JSON.parse(user);
        showMainApp();
        loadUserProfile();
    } else {
        const authContainerEl = document.getElementById('authContainer');
        authContainerEl.classList.add('active');
        authContainerEl.scrollTop = 0;
        document.getElementById('mainContainer').classList.remove('active');
    }
}

function showMainApp() {
    document.getElementById('authContainer').classList.remove('active');
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('mainContainer').classList.add('active');
}

function getAuthHeaders() {
    const token = localStorage.getItem('nutriscan_token');
    return {
        'Authorization': `Bearer ${token}`
    };
}

// ============================================
// SHOW FORGOT PASSWORD FORM - TABS HIDE
// ============================================
function showForgotPassword() {
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
        form.style.display = '';
    });
    
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm) {
        forgotForm.classList.remove('slide-from-left', 'slide-from-right');
        forgotForm.classList.add('active', 'slide-sheet');
    }
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.display = '';
    });
    
    const authTabs = document.querySelector('.auth-tabs');
    if (authTabs) {
        authTabs.style.display = 'none';
    }

    const authContainer = document.getElementById('authContainer');
    if (authContainer) {
        authContainer.scrollTop = 0;
    }
    const authCard = document.querySelector('.auth-card');
    if (authCard) {
        authCard.scrollTop = 0;
    }
    window.scrollTo(0, 0);
}

function showResetPassword(token) {
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    document.getElementById('resetPasswordForm').classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('resetPasswordForm').dataset.token = token;
}

// ============================================
// SWITCH BETWEEN LOGIN / SIGNUP TABS
// ============================================
// This is the single source of truth for moving between auth forms.
// It always resets stray inline styles (display:'') so the CSS
// .auth-form.active rule is back in full control — this is what fixes
// the "signup stops working after visiting forgot-password" bug: other
// flows used to leave `style.display = 'none'` stuck on a form, which
// overrides the CSS class forever since inline styles win over stylesheet
// rules. It also resets scroll to the top so the new form is fully in view.
function switchAuthTab(tabName) {
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active', 'slide-from-left', 'slide-from-right', 'slide-sheet');
        form.style.display = '';
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.display = '';
    });

    const authTabs = document.querySelector('.auth-tabs');
    if (authTabs) {
        authTabs.style.display = '';
    }

    const targetForm = document.getElementById(`${tabName}Form`);
    if (targetForm) {
        targetForm.classList.add('active');
        targetForm.classList.add(tabName === 'signup' ? 'slide-from-right' : 'slide-from-left');
    }

    const targetTabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (targetTabBtn) {
        targetTabBtn.classList.add('active');
    }

    const authContainer = document.getElementById('authContainer');
    if (authContainer) {
        authContainer.scrollTop = 0;
    }
    const authCard = document.querySelector('.auth-card');
    if (authCard) {
        authCard.scrollTop = 0;
    }
    window.scrollTo(0, 0);

    // .auth-container is the element that actually scrolls (it has
    // overflow-y:auto in CSS), not window/.auth-card. Some mobile browsers
    // also apply the scrollTop reset a frame late (after the slide-in
    // animation/layout settles), so we force it again on the next frame.
    requestAnimationFrame(() => {
        if (authContainer) authContainer.scrollTop = 0;
    });
}

// ============================================
// PAGE NAVIGATION
// ============================================

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active', 'page-forward', 'page-back');
    });
    
    const target = document.getElementById(pageId);
    target.classList.add('active');
    target.classList.add(pageId === 'homePage' ? 'page-back' : 'page-forward');
    window.scrollTo(0, 0);
    
    if (pageId === 'historyPage') {
        loadHistory();
    } else if (pageId === 'profilePage') {
        loadUserProfile();
    }
}

// ============================================
// USER PROFILE
// ============================================

function loadUserProfile() {
    if (!currentUser) return;
    
    document.getElementById('userName').textContent = currentUser.name || 'User';
    document.getElementById('userEmail').textContent = currentUser.email;
    
    const conditions = currentUser.healthConditions || [];
    customConditions = currentUser.customConditions || [];
    
    document.querySelectorAll('.condition-checkbox input').forEach(checkbox => {
        checkbox.checked = conditions.includes(checkbox.value);
    });
    
    displayCustomConditions();
}

async function saveUserProfile() {
    if (!currentUser) return;
    
    const selectedConditions = [];
    document.querySelectorAll('.condition-checkbox input:checked').forEach(checkbox => {
        selectedConditions.push(checkbox.value);
    });
    selectedConditions.push(...customConditions);
    
    try {
        const token = localStorage.getItem('nutriscan_token');
        const response = await fetch(`${API_URL}/auth/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                healthConditions: selectedConditions,
                customConditions: customConditions
            })
        });

        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('nutriscan_user', JSON.stringify(currentUser));
            showToast('✅ Profile saved successfully!', 'success');
        } else {
            showToast(data.error || 'Failed to save profile', 'error');
        }
    } catch (error) {
        showToast('Network error. Please try again.', 'error');
    }
}

// ============================================
// CUSTOM HEALTH CONDITIONS
// ============================================

function addCustomCondition() {
    const input = document.getElementById('customConditionInput');
    const condition = input.value.trim();
    
    if (!condition) {
        showToast('Please enter a condition', 'error');
        return;
    }
    
    if (customConditions.includes(condition)) {
        showToast('Condition already exists', 'error');
        return;
    }
    
    customConditions.push(condition);
    displayCustomConditions();
    input.value = '';
    showToast('Custom condition added', 'success');
}

function displayCustomConditions() {
    document.querySelectorAll('.custom-condition-tag').forEach(tag => tag.remove());
    
    customConditions.forEach(condition => {
        const tag = document.createElement('div');
        tag.className = 'custom-condition-tag';
        tag.innerHTML = `
            <span>${condition}</span>
            <i class="fas fa-times remove-condition" onclick="removeCustomCondition('${condition}')"></i>
        `;
        document.getElementById('conditionsGrid').appendChild(tag);
    });
}

function removeCustomCondition(condition) {
    customConditions = customConditions.filter(c => c !== condition);
    displayCustomConditions();
    saveUserProfile();
}

// ============================================
// IMAGE HANDLING
// ============================================

function handleImageUpload(file) {
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image size should be less than 5MB', 'error');
        return;
    }
    
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    currentImageFile = file;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewImg = document.getElementById('previewImage');
        previewImg.src = e.target.result;
        document.querySelector('.image-preview').classList.remove('empty');
        showPage('scanPage');
    };
    reader.readAsDataURL(file);
}

// ============================================
// ANALYZE IMAGE - WITH AUTH TOKEN
// ============================================

async function analyzeImage() {
    if (!currentImageFile) {
        showToast('No image selected', 'error');
        return;
    }

    const token = localStorage.getItem('nutriscan_token');
    if (!token) {
        showToast('Please login first', 'error');
        return;
    }

    showLoading();

    const formData = new FormData();
    formData.append('image', currentImageFile);
    formData.append('healthConditions', JSON.stringify(currentUser?.healthConditions || []));

    try {
        const response = await fetch(`${API_URL}/scan/analyze`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            currentAnalysis = data;
            displayResults(data);
            saveToHistory(data);
            showPage('resultPage');
        } else {
            showToast(data.error || 'Analysis failed', 'error');
        }
    } catch (error) {
        console.error('Analysis error:', error);
        showToast('Network error. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

// ============================================
// FETCH PRODUCT BY BARCODE - WITH AUTH TOKEN
// ============================================

async function fetchProductByBarcode(barcode) {
    showBarcodeLoading('🔍 Searching for product...');

    const token = localStorage.getItem('nutriscan_token');
    if (!token) {
        showToast('Please login first', 'error');
        hideBarcodeLoading();
        return;
    }

    try {
        const response = await fetch(`${API_URL}/scan/barcode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ barcode, healthConditions: currentUser?.healthConditions || [] })
        });

        const data = await response.json();
        hideBarcodeLoading();

        if (data.success) {
            const historyData = {
                success: true,
                analysis: data.analysis,
                explanation: data.explanation,
                product: data.product
            };
            saveToHistory(historyData);
            displayBarcodeResults(data);
            showPage('barcodeResultPage');
            showToast('✅ Product found!', 'success');
        } else {
            if (data.error === 'ingredients_missing') {
                displayIngredientsMissingUI(data.product);
                showPage('barcodeResultPage');
                return;
            }
            showToast(data.error || 'Product not found', 'error');
        }
    } catch (error) {
        console.error('Barcode fetch error:', error);
        hideBarcodeLoading();
        showToast('Network error. Please try again.', 'error');
    }
}

// ============================================
// BARCODE SCANNER FUNCTIONS
// ============================================

async function startBarcodeScanner() {
    try {
        if (barcodeScanner) {
            try {
                await barcodeScanner.stop();
                barcodeScanner.clear();
            } catch(e) {}
            barcodeScanner = null;
        }
        
        if (barcodeStream) {
            barcodeStream.getTracks().forEach(track => track.stop());
            barcodeStream = null;
        }
        
        const video = document.getElementById('barcodeVideo');
        if (video && video.srcObject) {
            video.srcObject = null;
        }
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Camera not supported. Please enter barcode manually.', 'error');
            const manualInput = document.getElementById('manualBarcodeInput');
            if (manualInput) manualInput.style.display = 'block';
            return;
        }
        
        if (typeof Html5Qrcode === 'undefined') {
            await loadBarcodeLibrary();
        }
        
        const statusElement = document.getElementById('barcodeStatus');
        let overlay = document.getElementById('barcodeOverlay');
        const container = document.getElementById('barcodeVideoContainer');
        
        if (!container) {
            showToast('Scanner container not found', 'error');
            return;
        }
        
        container.style.position = 'relative';
        container.style.top = 'auto';
        container.style.left = 'auto';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
        container.style.width = '100%';
        container.style.height = 'auto';
        container.style.aspectRatio = '1/1';
        container.style.zIndex = 'auto';
        container.style.backgroundColor = '#000';
        container.style.borderRadius = '16px';
        container.style.overflow = 'hidden';
        container.style.padding = '0';
        container.style.margin = '0';
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'barcodeOverlay';
            container.appendChild(overlay);
        }
        
        overlay.classList.remove('manual');
        
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
        overlay.style.backdropFilter = 'blur(16px)';
        overlay.style.webkitBackdropFilter = 'blur(16px)';
        overlay.style.zIndex = '10';
        overlay.style.cursor = 'pointer';
        overlay.style.pointerEvents = 'auto';
        overlay.style.margin = '0';
        overlay.style.padding = '0';
        overlay.style.borderRadius = '16px';
        
        overlay.innerHTML = `
            <div class="overlay-card">
                <div class="orb1"></div>
                <div class="orb2"></div>
                <div class="overlay-icon">
                    <i class="fas fa-barcode"></i>
                </div>
                <h2 class="overlay-title">Tap to Scan</h2>
                <p class="overlay-sub">
                    <i class="fas fa-arrow-up"></i>
                    Tap to start scanning
                </p>
                <div class="dot-container">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                </div>
            </div>
        `;
        
        barcodeScanner = new Html5Qrcode("barcodeVideoContainer");
        isBarcodeScannerActive = false;
        
        const manualBtn = document.getElementById('barcodeManualBtn');
        if (manualBtn) {
            manualBtn.innerHTML = '<i class="fas fa-keyboard"></i> Manual';
        }
        
        if (statusElement) {
            statusElement.textContent = '';
            statusElement.style.display = 'none';
        }
        
        overlay.onclick = async function(e) {
            if (e.target.closest('#manualBarcodeInput')) return;
            
            console.log('👆 Overlay clicked - Starting scanner...');
            
            overlay.style.transition = 'opacity 0.3s ease';
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.style.pointerEvents = 'none';
                overlay.onclick = null;
            }, 300);
            
            if (statusElement) {
                statusElement.textContent = '📦 Looking for barcode...';
                statusElement.style.background = 'rgba(0,0,0,0.85)';
                statusElement.style.display = 'block';
            }
            
            try {
                const config = {
                    fps: 30,
                    qrbox: { width: 250, height: 100 },
                    aspectRatio: 1.0,
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.UPC_E,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.QR_CODE
                    ]
                };
                
                isBarcodeScanning = true;
                isBarcodeScannerActive = true;
                
                await barcodeScanner.start(
                    { facingMode: "environment" },
                    config,
                    onBarcodeDetected,
                    (error) => {
                        if (isBarcodeScanning && error) {
                            if (error.message && error.message.includes('Camera')) {
                                console.warn('Camera warning:', error.message);
                            }
                        }
                    }
                );
                
                const videoElement = document.getElementById('barcodeVideo');
                if (videoElement && videoElement.srcObject) {
                    barcodeStream = videoElement.srcObject;
                }
                
                setTimeout(() => {
                    if (isBarcodeScanning) {
                        const status = document.getElementById('barcodeStatus');
                        if (status) {
                            status.textContent = '🔄 Align barcode in frame...';
                        }
                    }
                }, 3000);
                
            } catch (error) {
                console.error('Scanner start error:', error);
                showToast('Could not start scanner. Try manual entry.', 'error');
                showOverlay();
            }
        };
        
        const manualInput = document.getElementById('manualBarcodeInput');
        if (manualInput) manualInput.style.display = 'none';
        
    } catch (error) {
        console.error('Barcode scanner error:', error);
        showToast('Could not start barcode scanner. Please use manual entry.', 'error');
        const manualInput = document.getElementById('manualBarcodeInput');
        if (manualInput) manualInput.style.display = 'block';
        
        const status = document.getElementById('barcodeStatus');
        if (status) {
            status.textContent = '⚠️ Camera error - Use manual entry';
            status.style.background = 'rgba(244, 67, 54, 0.9)';
            status.style.display = 'block';
        }
    }
}

function showOverlay() {
    const container = document.getElementById('barcodeVideoContainer');
    let overlay = document.getElementById('barcodeOverlay');
    const status = document.getElementById('barcodeStatus');
    
    if (container) {
        container.style.position = 'relative';
        container.style.top = 'auto';
        container.style.left = 'auto';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
        container.style.width = '100%';
        container.style.height = 'auto';
        container.style.aspectRatio = '1/1';
        container.style.zIndex = 'auto';
        container.style.backgroundColor = '#000';
        container.style.borderRadius = '16px';
        container.style.overflow = 'hidden';
        container.style.padding = '0';
        container.style.margin = '0';
    }
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'barcodeOverlay';
        if (container) {
            container.appendChild(overlay);
        }
    }
    
    overlay.classList.remove('manual');
    
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
        overlay.style.backdropFilter = 'blur(16px)';
        overlay.style.webkitBackdropFilter = 'blur(16px)';
        overlay.style.zIndex = '10';
        overlay.style.cursor = 'pointer';
        overlay.style.pointerEvents = 'auto';
        overlay.style.margin = '0';
        overlay.style.padding = '0';
        overlay.style.borderRadius = '16px';
        overlay.style.opacity = '1';
        overlay.style.transition = 'none';
        
        overlay.innerHTML = `
            <div class="overlay-card">
                <div class="orb1"></div>
                <div class="orb2"></div>
                <div class="overlay-icon">
                    <i class="fas fa-barcode"></i>
                </div>
                <h2 class="overlay-title">Tap to Scan</h2>
                <p class="overlay-sub">
                    <i class="fas fa-arrow-up"></i>
                    Tap to start scanning
                </p>
                <div class="dot-container">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                </div>
            </div>
        `;
        
        overlay.onclick = function(e) {
            if (e.target.closest('#manualBarcodeInput')) return;
            
            if (barcodeScanner && isBarcodeScannerActive) {
                try {
                    barcodeScanner.stop();
                    isBarcodeScannerActive = false;
                } catch(err) {}
            }
            
            startBarcodeScanner();
        };
    }
    
    if (status) {
        status.textContent = '';
        status.style.display = 'none';
    }
}

function loadBarcodeLibrary() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function onBarcodeDetected(decodedText, decodedResult) {
    if (!isBarcodeScanning) return;
    
    isBarcodeScanning = false;
    isBarcodeScannerActive = false;
    
    const status = document.getElementById('barcodeStatus');
    if (status) {
        status.textContent = '✅ Barcode detected! Fetching product...';
        status.style.background = 'rgba(76, 175, 80, 0.9)';
        status.style.display = 'block';
    }
    
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
    
    if (barcodeScanner) {
        barcodeScanner.stop().then(() => {
            if (barcodeScanner) {
                try {
                    barcodeScanner.clear();
                } catch(e) {}
            }
        }).catch(err => console.error('Stop error:', err));
    }
    
    if (barcodeStream) {
        barcodeStream.getTracks().forEach(track => track.stop());
        barcodeStream = null;
    }
    
    fetchProductByBarcode(decodedText);
}

function toggleBarcodeTorch() {
    if (!barcodeScanner || !isBarcodeScannerActive) {
        showToast('Scanner is not active. Tap the overlay to start first.', 'info');
        return;
    }
    
    if (typeof barcodeScanner.toggleTorch !== 'function') {
        console.warn('Torch not supported by this scanner');
        showToast('Torch feature is not available', 'info');
        return;
    }
    
    try {
        barcodeTorchOn = !barcodeTorchOn;
        barcodeScanner.toggleTorch(barcodeTorchOn);
        
        const torchBtn = document.getElementById('barcodeTorchBtn');
        if (torchBtn) {
            torchBtn.innerHTML = barcodeTorchOn ? 
                '<i class="fas fa-lightbulb"></i> Torch ON' : 
                '<i class="fas fa-lightbulb"></i> Torch';
            torchBtn.style.background = barcodeTorchOn ? '#4CAF50' : '#333';
            torchBtn.classList.toggle('on', barcodeTorchOn);
        }
    } catch (error) {
        console.error('Torch error:', error);
        showToast('Could not toggle torch', 'error');
        barcodeTorchOn = false;
        const torchBtn = document.getElementById('barcodeTorchBtn');
        if (torchBtn) {
            torchBtn.innerHTML = '<i class="fas fa-lightbulb"></i> Torch';
            torchBtn.style.background = '#333';
            torchBtn.classList.remove('on');
        }
    }
}

function closeBarcodeScanner() {
    console.log('🔴 Closing barcode scanner...');
    
    isBarcodeScanning = false;
    isBarcodeScannerActive = false;
    
    barcodeTorchOn = false;
    const torchBtn = document.getElementById('barcodeTorchBtn');
    if (torchBtn) {
        torchBtn.innerHTML = '<i class="fas fa-lightbulb"></i> Torch';
        torchBtn.style.background = '#333';
        torchBtn.classList.remove('on');
    }
    
    if (barcodeScanner) {
        try {
            if (typeof barcodeScanner.toggleTorch === 'function') {
                try {
                    barcodeScanner.toggleTorch(false);
                } catch(e) {}
            }
            
            barcodeScanner.stop().then(() => {
                if (barcodeScanner) {
                    try {
                        barcodeScanner.clear();
                        console.log('✅ Scanner cleared');
                    } catch(e) {}
                }
            }).catch(err => {
                console.error('Stop error:', err);
                if (barcodeScanner) {
                    try {
                        barcodeScanner.clear();
                    } catch(e) {}
                }
            });
        } catch (e) {
            console.error('Close error:', e);
            if (barcodeScanner) {
                try {
                    barcodeScanner.clear();
                } catch(e) {}
            }
        }
        barcodeScanner = null;
    }
    
    if (barcodeStream) {
        try {
            barcodeStream.getTracks().forEach(track => {
                track.stop();
                console.log('✅ Track stopped:', track.kind);
            });
            barcodeStream = null;
        } catch (e) {
            console.error('Stream stop error:', e);
        }
    }
    
    const video = document.getElementById('barcodeVideo');
    if (video) {
        try {
            if (video.srcObject) {
                const stream = video.srcObject;
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }
                video.srcObject = null;
            }
            video.pause();
        } catch (e) {
            console.error('Video cleanup error:', e);
        }
    }
    
    const manualInput = document.getElementById('manualBarcodeInput');
    if (manualInput) {
        manualInput.style.display = 'none';
    }
    
    const manualBtn = document.getElementById('barcodeManualBtn');
    if (manualBtn) {
        manualBtn.innerHTML = '<i class="fas fa-keyboard"></i> Manual';
    }
    
    const container = document.getElementById('barcodeVideoContainer');
    if (container) {
        container.style.position = 'relative';
        container.style.top = 'auto';
        container.style.left = 'auto';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
        container.style.width = '100%';
        container.style.height = 'auto';
        container.style.aspectRatio = '1/1';
        container.style.zIndex = 'auto';
        container.style.backgroundColor = '#000';
        container.style.borderRadius = '16px';
        container.style.overflow = 'hidden';
        container.style.padding = '0';
        container.style.margin = '0';
    }
    
    let overlay = document.getElementById('barcodeOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'barcodeOverlay';
        if (container) {
            container.appendChild(overlay);
        }
    }
    
    overlay.classList.remove('manual');
    
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
        overlay.style.backdropFilter = 'blur(16px)';
        overlay.style.webkitBackdropFilter = 'blur(16px)';
        overlay.style.zIndex = '10';
        overlay.style.cursor = 'pointer';
        overlay.style.pointerEvents = 'auto';
        overlay.style.margin = '0';
        overlay.style.padding = '0';
        overlay.style.borderRadius = '16px';
        overlay.style.opacity = '1';
        overlay.style.transition = 'none';
        
        overlay.innerHTML = `
            <div class="overlay-card">
                <div class="orb1"></div>
                <div class="orb2"></div>
                <div class="overlay-icon">
                    <i class="fas fa-barcode"></i>
                </div>
                <h2 class="overlay-title">Tap to Scan</h2>
                <p class="overlay-sub">
                    <i class="fas fa-arrow-up"></i>
                    Tap to start scanning
                </p>
                <div class="dot-container">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                </div>
            </div>
        `;
        
        overlay.onclick = function() {
            startBarcodeScanner();
        };
    }
    
    const statusElement = document.getElementById('barcodeStatus');
    if (statusElement) {
        statusElement.textContent = '';
        statusElement.style.display = 'none';
    }
    
    showPage('homePage');
    console.log('✅ Barcode scanner closed successfully');
}

async function searchBarcodeManual() {
    const barcode = document.getElementById('barcodeManualInput').value.trim();
    
    if (!barcode) {
        showToast('Please enter a barcode number', 'error');
        return;
    }
    
    if (barcode.length < 8) {
        showToast('Please enter a valid barcode (min 8 digits)', 'error');
        return;
    }
    
    await fetchProductByBarcode(barcode);
}

function displayIngredientsMissingUI(product) {
    const resultContent = document.getElementById('barcodeResultContent');
    
    let html = `
        <div class="product-header" style="background: linear-gradient(135deg, #fff3e0, #ffe0b2); padding: 16px; border-radius: 12px; margin-bottom: 16px; border: 2px solid #FF9800;">
            ${product.image ? `<img src="${product.image}" alt="${product.name}" style="max-width: 100px; max-height: 100px; object-fit: contain; display: block; margin: 0 auto 8px; border-radius: 8px;">` : ''}
            <h3 style="text-align: center; margin: 8px 0 4px; font-size: 20px; color: #e65100;">${product.name || 'Unknown Product'}</h3>
            ${product.brand ? `<p style="text-align: center; color: #555; font-size: 15px; margin: 0;">🏷️ ${product.brand}</p>` : ''}
            ${product.barcode ? `<p style="text-align: center; color: #888; font-size: 12px; margin: 4px 0 0;">📦 Barcode: ${product.barcode}</p>` : ''}
        </div>
        
        <div class="info-card" style="background: #fff8e1; border: 2px solid #FF9800;">
            <div style="text-align: center; padding: 10px 0;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #FF9800; margin-bottom: 12px;"></i>
                <h3 style="color: #e65100;">⚠️ Ingredients Not Found</h3>
                <p style="color: #555; line-height: 1.6; font-size: 15px; margin: 12px 0;">
                    We couldn't find the ingredients list for this product in our database.
                </p>
            </div>
            
            <div style="background: white; border-radius: 12px; padding: 16px; margin-top: 12px; border: 1px solid #e0e0e0;">
                <p style="font-size: 15px; font-weight: 600; color: #333; margin: 0 0 8px 0;">💡 What to do next:</p>
                <ul style="margin: 0; padding-left: 20px; color: #555; line-height: 1.8;">
                    <li>📸 Use <strong>"Upload Image"</strong> mode to scan the ingredients label from the product packaging</li>
                    <li>🔍 Try scanning a different barcode</li>
                </ul>
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; justify-content: center;">
                <button onclick="showPage('homePage')" style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600;">
                    <i class="fas fa-home"></i> Go Home
                </button>
                <button onclick="document.getElementById('uploadBtn').click(); showPage('homePage');" style="padding: 12px 24px; background: #2196F3; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600;">
                    <i class="fas fa-upload"></i> Upload Image
                </button>
            </div>
        </div>
    `;
    
    resultContent.innerHTML = html;
}

function displayBarcodeResults(data) {
    const resultContent = document.getElementById('barcodeResultContent');
    const product = data.product;
    const analysis = data.analysis;
    const explanation = data.explanation;
    
    if (!product || !analysis) {
        resultContent.innerHTML = `
            <div class="info-card" style="text-align: center; padding: 30px;">
                <i class="fas fa-box-open" style="font-size: 48px; color: #FF9800; margin-bottom: 16px;"></i>
                <h3>Product Not Found</h3>
                <p style="color: #666; line-height: 1.6;">We couldn't find this product in our database.</p>
                <div style="background: #fff3e0; border-radius: 12px; padding: 16px; margin: 16px 0; text-align: left;">
                    <p style="font-size: 14px; color: #555; margin: 0;">
                        💡 <strong>Try this:</strong><br>
                        1️⃣ Use <strong>"Upload Image"</strong> mode to scan the ingredients list directly from the label<br>
                        2️⃣ Try <strong>manual barcode entry</strong> below<br>
                        3️⃣ Search by product name in the app
                    </p>
                </div>
                <button onclick="showPage('homePage')" style="margin-top: 16px; padding: 10px 24px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
                    <i class="fas fa-home"></i> Go Home
                </button>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="product-header" style="background: linear-gradient(135deg, #e3f2fd, #bbdefb); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
            ${product.image ? `<img src="${product.image}" alt="${product.name}" style="max-width: 100px; max-height: 100px; object-fit: contain; display: block; margin: 0 auto 8px; border-radius: 8px;">` : ''}
            <h3 style="text-align: center; margin: 8px 0 4px; font-size: 20px; color: #1a237e;">${product.name || 'Unknown Product'}</h3>
            ${product.brand ? `<p style="text-align: center; color: #555; font-size: 15px; margin: 0;">🏷️ ${product.brand}</p>` : ''}
            ${product.barcode ? `<p style="text-align: center; color: #888; font-size: 12px; margin: 4px 0 0;">📦 Barcode: ${product.barcode}</p>` : ''}
        </div>
    `;
    
    if (product.nutrition) {
        const nutrition = product.nutrition;
        let hasNutrition = false;
        let nutritionHtml = `
            <div class="info-card">
                <h4><i class="fas fa-chart-bar"></i> Nutrition Information</h4>
                <div style="margin-top: 12px;">
        `;
        
        const nutritionItems = [
            { key: 'calories', icon: '🔥', label: 'Calories', unit: 'kcal' },
            { key: 'sugar', icon: '🍬', label: 'Sugar', unit: 'g' },
            { key: 'sodium', icon: '🧂', label: 'Sodium', unit: 'mg' },
            { key: 'protein', icon: '💪', label: 'Protein', unit: 'g' },
            { key: 'fat', icon: '🥩', label: 'Fat', unit: 'g' },
            { key: 'fiber', icon: '🌾', label: 'Fiber', unit: 'g' }
        ];
        
        nutritionItems.forEach(item => {
            if (nutrition[item.key] !== null && nutrition[item.key] !== undefined && nutrition[item.key] > 0) {
                nutritionHtml += `
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0;">
                        <span>${item.icon} ${item.label}</span>
                        <span><strong>${nutrition[item.key]}</strong> ${item.unit}</span>
                    </div>
                `;
                hasNutrition = true;
            }
        });
        
        nutritionHtml += '</div></div>';
        
        if (hasNutrition) {
            html += nutritionHtml;
        }
    }
    
    if (product.nutrition) {
        const nutrition = product.nutrition;
        
        const nutritionLimits = {
            sugar: { limit: 25, unit: 'g', icon: '🍬', label: 'Sugar' },
            sodium: { limit: 2000, unit: 'mg', icon: '🧂', label: 'Sodium' },
            fat: { limit: 20, unit: 'g', icon: '🥩', label: 'Saturated Fat' }
        };
        
        const breakdownItems = [];
        
        if (nutrition.sugar && nutrition.sugar > 0) {
            const value = nutrition.sugar;
            const limit = nutritionLimits.sugar.limit;
            const pct = Math.min(Math.round((value / limit) * 100), 100);
            let status = 'low';
            let statusText = 'Good';
            let statusEmoji = '🟢';
            let color = '#2ecc71';
            let bgColor = '#e8f8ef';
            let borderColor = '#2ecc71';
            
            if (pct > 80) {
                status = 'high';
                statusText = 'Too High';
                statusEmoji = '🔴';
                color = '#e74c3c';
                bgColor = '#fde8e8';
                borderColor = '#e74c3c';
            } else if (pct > 50) {
                status = 'moderate';
                statusText = 'Moderate';
                statusEmoji = '🟡';
                color = '#f39c12';
                bgColor = '#fef9e7';
                borderColor = '#f39c12';
            }
            
            breakdownItems.push({
                name: nutritionLimits.sugar.label,
                icon: nutritionLimits.sugar.icon,
                value: value,
                limit: limit,
                unit: nutritionLimits.sugar.unit,
                pct: pct,
                status: status,
                statusText: statusText,
                statusEmoji: statusEmoji,
                color: color,
                bgColor: bgColor,
                borderColor: borderColor
            });
        }
        
        if (nutrition.sodium && nutrition.sodium > 0) {
            const value = nutrition.sodium;
            const limit = nutritionLimits.sodium.limit;
            const pct = Math.min(Math.round((value / limit) * 100), 100);
            let status = 'low';
            let statusText = 'Good';
            let statusEmoji = '🟢';
            let color = '#2ecc71';
            let bgColor = '#e8f8ef';
            let borderColor = '#2ecc71';
            
            if (pct > 80) {
                status = 'high';
                statusText = 'Too High';
                statusEmoji = '🔴';
                color = '#e74c3c';
                bgColor = '#fde8e8';
                borderColor = '#e74c3c';
            } else if (pct > 50) {
                status = 'moderate';
                statusText = 'Moderate';
                statusEmoji = '🟡';
                color = '#f39c12';
                bgColor = '#fef9e7';
                borderColor = '#f39c12';
            }
            
            breakdownItems.push({
                name: nutritionLimits.sodium.label,
                icon: nutritionLimits.sodium.icon,
                value: value,
                limit: limit,
                unit: nutritionLimits.sodium.unit,
                pct: pct,
                status: status,
                statusText: statusText,
                statusEmoji: statusEmoji,
                color: color,
                bgColor: bgColor,
                borderColor: borderColor
            });
        }
        
        if (nutrition.fat && nutrition.fat > 0) {
            const value = nutrition.fat;
            const limit = nutritionLimits.fat.limit;
            const pct = Math.min(Math.round((value / limit) * 100), 100);
            let status = 'low';
            let statusText = 'Good';
            let statusEmoji = '🟢';
            let color = '#2ecc71';
            let bgColor = '#e8f8ef';
            let borderColor = '#2ecc71';
            
            if (pct > 80) {
                status = 'high';
                statusText = 'Too High';
                statusEmoji = '🔴';
                color = '#e74c3c';
                bgColor = '#fde8e8';
                borderColor = '#e74c3c';
            } else if (pct > 50) {
                status = 'moderate';
                statusText = 'Moderate';
                statusEmoji = '🟡';
                color = '#f39c12';
                bgColor = '#fef9e7';
                borderColor = '#f39c12';
            }
            
            breakdownItems.push({
                name: nutritionLimits.fat.label,
                icon: nutritionLimits.fat.icon,
                value: value,
                limit: limit,
                unit: nutritionLimits.fat.unit,
                pct: pct,
                status: status,
                statusText: statusText,
                statusEmoji: statusEmoji,
                color: color,
                bgColor: bgColor,
                borderColor: borderColor
            });
        }
        
        if (breakdownItems.length > 0) {
            html += `<div class="info-card" style="background: #f8f9fa;"><h4><i class="fas fa-chart-pie"></i> Ingredient Breakdown</h4><div style="margin-top: 12px;">`;
            
            breakdownItems.forEach((item) => {
                html += `
                    <div style="background: ${item.bgColor}; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; border-left: 5px solid ${item.borderColor};">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 20px;">${item.icon}</span>
                                <span style="font-weight: 600; font-size: 15px; color: #222;">${item.name}</span>
                            </div>
                            <div style="text-align: right;">
                                <span style="font-size: 18px; font-weight: 700; color: ${item.color};">${item.value}</span>
                                <span style="font-size: 13px; color: #888;"> / ${item.limit}${item.unit}</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="flex: 1; height: 10px; background: #e8e8e8; border-radius: 5px; overflow: hidden;">
                                <div style="width: ${item.pct}%; height: 100%; background: ${item.color}; border-radius: 5px; transition: width 1s ease;"></div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px; min-width: 80px;">
                                <span>${item.statusEmoji}</span>
                                <span style="font-size: 12px; font-weight: 600; color: ${item.color};">${item.statusText}</span>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: #888;">
                            <span>Daily limit: ${item.limit}${item.unit}</span>
                            <span>${item.pct}% of daily limit</span>
                        </div>
                    </div>
                `;
            });
            
            const highCount = breakdownItems.filter(i => i.status === 'high').length;
            const lowCount = breakdownItems.filter(i => i.status === 'low').length;
            let summaryText = '';
            if (highCount === 0 && lowCount === breakdownItems.length) {
                summaryText = '✅ All ingredients are within healthy limits!';
            } else if (highCount > 0) {
                summaryText = `⚠️ ${highCount} ingredient${highCount > 1 ? 's are' : ' is'} above recommended limit. Try to limit consumption.`;
            } else {
                summaryText = '⚖️ Some ingredients are moderate. Enjoy in moderation.';
            }
            
            html += `
                <div style="background: white; border-radius: 10px; padding: 12px 16px; margin-top: 6px; border: 1px solid #e8e8e8;">
                    <p style="font-size: 14px; color: #444; margin: 0;">${summaryText}</p>
                </div>
            `;
            
            html += `</div></div>`;
        }
    }
    
    if (analysis && analysis.score !== undefined) {
        const score = analysis.score;
        const rating = analysis.rating || 'Moderate';
        let scoreColor = '#FF9800';
        if (score >= 7) scoreColor = '#4CAF50';
        else if (score >= 4) scoreColor = '#FF9800';
        else scoreColor = '#F44336';
        
        html += `
            <div class="score-section" style="text-align: center; padding: 20px 15px; background: linear-gradient(135deg, #f8f9fa, #ffffff);">
                <div style="position: relative; display: inline-block;">
                    <svg width="180" height="180" viewBox="0 0 200 200">
                        <circle cx="100" cy="100" r="80" fill="none" stroke="#e8e8e8" stroke-width="14"/>
                        <circle cx="100" cy="100" r="80" fill="none" stroke="${scoreColor}" stroke-width="14"
                            stroke-dasharray="${2 * Math.PI * 65}" stroke-dashoffset="${2 * Math.PI * 65 - (score / 10) * 2 * Math.PI * 65}"
                            stroke-linecap="round" transform="rotate(-90 100 100)"/>
                        <text x="100" y="95" text-anchor="middle" font-size="40" font-weight="800" fill="#222">${score}</text>
                        <text x="100" y="125" text-anchor="middle" font-size="14" fill="#888" font-weight="500">out of 10</text>
                    </svg>
                </div>
                <div style="margin-top: 8px;">
                    <span style="font-size: 18px; padding: 8px 24px; border-radius: 30px; font-weight: 600; background: ${scoreColor}22; color: ${scoreColor};">${rating}</span>
                </div>
            </div>
        `;
    }
    
    if (analysis && analysis.warnings && analysis.warnings.length > 0) {
        html += `
            <div class="warning-section" style="margin-bottom: 16px;">
                <h4 style="margin-bottom: 12px;"><i class="fas fa-exclamation-triangle"></i> Personalized Warnings</h4>
        `;
        analysis.warnings.forEach(warning => {
            html += `
                <div class="warning-card" style="margin-bottom: 12px; padding: 16px; border-radius: 12px; background: rgba(244, 67, 54, 0.05); border-left: 4px solid #f44336;">
                    <i class="fas fa-heartbeat" style="color: #f44336; margin-right: 8px;"></i>
                    <strong>${warning.condition}</strong>
                    <p style="margin-top: 4px; margin-bottom: 0; color: #555; font-size: 14px; line-height: 1.5;">${warning.warning}</p>
                </div>
            `;
        });
        html += `</div>`;
    }
    
    if (explanation && explanation.summary) {
        html += `<div class="info-card"><h4><i class="fas fa-brain"></i> AI Nutrition Analysis</h4><p style="line-height: 1.6; font-size: 14px;">${explanation.summary}</p></div>`;
    }
    
    if (explanation && explanation.harmfulDetails && explanation.harmfulDetails.length > 0) {
        html += `<div class="info-card"><h4><i class="fas fa-skull-crossbones"></i> Ingredients to Limit</h4>`;
        explanation.harmfulDetails.forEach(detail => {
            html += `<p style="margin-bottom: 10px; font-size: 14px;"><i class="fas fa-angle-right" style="color: #e74c3c;"></i> ${detail}</p>`;
        });
        html += `</div>`;
    }
    
    if (explanation && explanation.goodDetails && explanation.goodDetails.length > 0) {
        html += `<div class="info-card"><h4><i class="fas fa-check-circle"></i> Beneficial Ingredients</h4>`;
        explanation.goodDetails.forEach(detail => {
            html += `<p style="margin-bottom: 10px; font-size: 14px;"><i class="fas fa-angle-right" style="color: #2ecc71;"></i> ${detail}</p>`;
        });
        html += `</div>`;
    } else {
        html += `
            <div class="info-card">
                <h4><i class="fas fa-check-circle"></i> Beneficial Ingredients</h4>
                <p style="font-size: 14px; color: #888; text-align: center; padding: 10px 0;">
                    No beneficial ingredients detected in this product.
                </p>
            </div>
        `;
    }
    
    if (explanation && explanation.alternatives && explanation.alternatives.length > 0) {
        html += `
            <div class="info-card" style="border: 2px solid #4CAF50; background: linear-gradient(135deg, #f0faf0, #e8f5e9); padding: 16px;">
                <h4 style="color: #2E7D32; font-size: 16px;"><i class="fas fa-star" style="color: #FFD700;"></i> Healthier Alternatives <span style="font-size: 12px; color: #666; font-weight: normal;">— Best Picks</span></h4>
                <div style="display: grid; gap: 12px; margin-top: 10px;">
        `;
        
        const icons = ['🥇', '🥈', '🥉'];
        explanation.alternatives.forEach((alt, index) => {
            if (typeof alt === 'object' && alt.name) {
                const productLink = alt.link || `https://www.amazon.in/s?k=${encodeURIComponent(alt.name)}`;
                html += `
                    <div style="background: white; border-radius: 12px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-left: 4px solid ${index === 0 ? '#4CAF50' : '#FF9800'};">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <span style="font-size: 22px;">${icons[index] || '⭐'}</span>
                            <div style="flex: 1; min-width: 120px;">
                                <strong style="font-size: 15px; color: #2E7D32;">${alt.name}</strong>
                                <p style="font-size: 13px; color: #555; margin: 3px 0 0 0;">${alt.description}</p>
                            </div>
                            <a href="${productLink}" target="_blank" rel="noopener noreferrer" style="background: #4CAF50; color: white; padding: 6px 16px; border-radius: 20px; text-decoration: none; font-size: 12px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">
                                <i class="fas fa-external-link-alt"></i> View
                            </a>
                        </div>
                    </div>
                `;
            } else if (typeof alt === 'string') {
                html += `<p style="margin-bottom: 6px; font-size: 14px;"><i class="fas fa-check" style="color: #4CAF50;"></i> ${alt}</p>`;
            }
        });
        
        html += `</div></div>`;
    }
    
    resultContent.innerHTML = html;
}

function getIngredientData(type, analysis) {
    const text = (analysis.extractedText || analysis.rawText || '').toLowerCase();
    const limits = {
        sugar: { limit: 25, unit: 'g', max: 50 },
        sodium: { limit: 2000, unit: 'mg', max: 4000 },
        fat: { limit: 20, unit: 'g', max: 40 }
    };
    
    let actual = null;
    
    if (type === 'sugar') {
        const match = text.match(/(\d+\.?\d*)\s*g\s*sugar|sugar[:\s]*(\d+\.?\d*)\s*g/i);
        if (match) actual = parseFloat(match[1] || match[2]) || 10;
        else if (analysis.harmfulIngredients && analysis.harmfulIngredients.includes('high sugar')) actual = 35;
        else if (analysis.goodIngredients && analysis.goodIngredients.includes('natural ingredients')) actual = 8;
        else actual = 15;
    } else if (type === 'sodium') {
        const match = text.match(/(\d+\.?\d*)\s*mg\s*sodium|sodium[:\s]*(\d+\.?\d*)\s*mg/i);
        if (match) actual = parseFloat(match[1] || match[2]) || 500;
        else if (analysis.harmfulIngredients && analysis.harmfulIngredients.includes('high sodium')) actual = 2500;
        else actual = 600;
    } else if (type === 'fat') {
        const match = text.match(/(\d+\.?\d*)\s*g\s*((saturated|trans)\s*)?fat/i);
        if (match) actual = parseFloat(match[1]) || 8;
        else if (analysis.harmfulIngredients && analysis.harmfulIngredients.includes('palm oil')) actual = 25;
        else actual = 10;
    }
    
    if (actual === null) return null;
    
    const limit = limits[type].limit;
    const percentage = (actual / limit) * 100;
    let status = 'low';
    if (percentage > 80) status = 'high';
    else if (percentage > 50) status = 'moderate';
    
    return { actual: Math.round(actual * 10) / 10, limit, status };
}

function displayResults(data) {
    const resultContent = document.getElementById('resultContent');
    const analysis = data.analysis;
    const explanation = data.explanation;
    
    const realScore = analysis.score !== undefined && analysis.score !== null ? analysis.score : 5;
    const demoRating = analysis.rating || 'Moderate';
    
    let scoreColor = '#FF9800';
    let ratingBg = 'rgba(255, 152, 0, 0.1)';
    let ratingColor = '#FF9800';
    
    if (realScore >= 7) {
        scoreColor = '#4CAF50';
        ratingBg = 'rgba(76, 175, 80, 0.1)';
        ratingColor = '#4CAF50';
    } else if (realScore >= 4) {
        scoreColor = '#FF9800';
        ratingBg = 'rgba(255, 152, 0, 0.1)';
        ratingColor = '#FF9800';
    } else {
        scoreColor = '#F44336';
        ratingBg = 'rgba(244, 67, 54, 0.1)';
        ratingColor = '#F44336';
    }
    
    let html = `
        <div class="score-section" style="text-align: center; padding: 20px 15px; background: linear-gradient(135deg, #f8f9fa, #ffffff);">
            <div style="position: relative; display: inline-block;">
                <svg width="220" height="220" viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="80" fill="none" stroke="#e8e8e8" stroke-width="14"/>
                    <circle cx="100" cy="100" r="80" fill="none" stroke="${scoreColor}" stroke-width="14"
                        stroke-dasharray="${2 * Math.PI * 65}" stroke-dashoffset="${2 * Math.PI * 65 - (realScore / 10) * 2 * Math.PI * 65}"
                        stroke-linecap="round" transform="rotate(-90 100 100)"
                        style="transition: stroke-dashoffset 1.5s ease;"/>
                    <text x="100" y="95" text-anchor="middle" font-size="48" font-weight="800" fill="#222">${realScore}</text>
                    <text x="100" y="125" text-anchor="middle" font-size="16" fill="#888" font-weight="500">out of 10</text>
                </svg>
            </div>
            <div style="margin-top: 12px;">
                <span class="rating-badge" style="font-size: 20px; padding: 10px 32px; border-radius: 30px; font-weight: 600; box-shadow: 0 2px 12px rgba(0,0,0,0.08); background: ${ratingBg}; color: ${ratingColor};">${demoRating}</span>
            </div>
        </div>
    `;
    
    if (analysis.warnings && analysis.warnings.length > 0) {
        html += `<div class="warning-section"><h4><i class="fas fa-exclamation-triangle"></i> Personalized Warnings</h4>`;
        analysis.warnings.forEach(warning => {
            html += `<div class="warning-card"><i class="fas fa-heartbeat"></i><strong>${warning.condition}</strong><p>${warning.warning}</p></div>`;
        });
        html += `</div>`;
    }
    
    html += `<div class="info-card" style="background: #f8f9fa;"><h4><i class="fas fa-chart-pie"></i> Ingredient Breakdown</h4><div style="margin-top: 12px;">`;
    
    const sugarData = getIngredientData('sugar', analysis);
    const sodiumData = getIngredientData('sodium', analysis);
    const fatData = getIngredientData('fat', analysis);
    
    const ingredients = [];
    if (sugarData) ingredients.push({ name: 'Sugar', icon: '🍬', data: sugarData });
    if (sodiumData) ingredients.push({ name: 'Sodium', icon: '🧂', data: sodiumData });
    if (fatData) ingredients.push({ name: 'Saturated Fat', icon: '🥩', data: fatData });
    
    if (ingredients.length > 0) {
        ingredients.forEach((item) => {
            const data = item.data;
            const pct = Math.min((data.actual / data.limit) * 100, 100);
            const color = data.status === 'high' ? '#e74c3c' : data.status === 'moderate' ? '#f39c12' : '#2ecc71';
            const bgColor = data.status === 'high' ? '#fde8e8' : data.status === 'moderate' ? '#fef9e7' : '#e8f8ef';
            const borderColor = data.status === 'high' ? '#e74c3c' : data.status === 'moderate' ? '#f39c12' : '#2ecc71';
            const statusEmoji = data.status === 'high' ? '🔴' : data.status === 'moderate' ? '🟡' : '🟢';
            const statusTextIng = data.status === 'high' ? 'Too High' : data.status === 'moderate' ? 'Moderate' : 'Good';
            
            html += `
                <div style="background: ${bgColor}; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; border-left: 5px solid ${borderColor};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 20px;">${item.icon}</span>
                            <span style="font-weight: 600; font-size: 15px; color: #222;">${item.name}</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-size: 18px; font-weight: 700; color: ${color};">${data.actual}</span>
                            <span style="font-size: 13px; color: #888;"> / ${data.limit}g</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="flex: 1; height: 10px; background: #e8e8e8; border-radius: 5px; overflow: hidden; position: relative;">
                            <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 5px; transition: width 1s ease;"></div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px; min-width: 80px;">
                            <span>${statusEmoji}</span>
                            <span style="font-size: 12px; font-weight: 600; color: ${color};">${statusTextIng}</span>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: #888;">
                        <span>Daily limit: ${data.limit}g</span>
                        <span>${Math.round(pct)}% of daily limit</span>
                    </div>
                </div>
            `;
        });
        
        const highCount = ingredients.filter(i => i.data.status === 'high').length;
        const lowCount = ingredients.filter(i => i.data.status === 'low').length;
        let summaryText = '';
        if (highCount === 0 && lowCount === ingredients.length) {
            summaryText = '✅ All ingredients are within healthy limits!';
        } else if (highCount > 0) {
            summaryText = `⚠️ ${highCount} ingredient${highCount > 1 ? 's are' : ' is'} above recommended limit. Try to limit consumption.`;
        } else {
            summaryText = '⚖️ Some ingredients are moderate. Enjoy in moderation.';
        }
        
        html += `
            <div style="background: white; border-radius: 10px; padding: 12px 16px; margin-top: 6px; border: 1px solid #e8e8e8;">
                <p style="font-size: 14px; color: #444; margin: 0;">${summaryText}</p>
            </div>
        `;
    } else {
        html += `<p style="color: #888; font-size: 14px; text-align: center; padding: 10px;">No specific ingredient data available.</p>`;
    }
    
    html += `</div></div>`;
    
    if (explanation.summary) {
        html += `<div class="info-card"><h4><i class="fas fa-brain"></i> AI Nutrition Analysis</h4><p style="line-height: 1.6; font-size: 14px;">${explanation.summary}</p></div>`;
    }
    
    if (explanation.harmfulDetails && explanation.harmfulDetails.length > 0) {
        html += `<div class="info-card"><h4><i class="fas fa-skull-crossbones"></i> Ingredients to Limit</h4>`;
        explanation.harmfulDetails.forEach(detail => {
            html += `<p style="margin-bottom: 10px; font-size: 14px;"><i class="fas fa-angle-right" style="color: #e74c3c;"></i> ${detail}</p>`;
        });
        html += `</div>`;
    }
    
    if (explanation.goodDetails && explanation.goodDetails.length > 0) {
        html += `<div class="info-card"><h4><i class="fas fa-check-circle"></i> Beneficial Ingredients</h4>`;
        explanation.goodDetails.forEach(detail => {
            html += `<p style="margin-bottom: 10px; font-size: 14px;"><i class="fas fa-angle-right" style="color: #2ecc71;"></i> ${detail}</p>`;
        });
        html += `</div>`;
    }
    
    if (explanation.alternatives && explanation.alternatives.length > 0) {
        html += `
            <div class="info-card" style="border: 2px solid #4CAF50; background: linear-gradient(135deg, #f0faf0, #e8f5e9); padding: 16px;">
                <h4 style="color: #2E7D32; font-size: 16px;"><i class="fas fa-star" style="color: #FFD700;"></i> Healthier Alternatives <span style="font-size: 12px; color: #666; font-weight: normal;">— Best Picks</span></h4>
                <div style="display: grid; gap: 12px; margin-top: 10px;">
        `;
        
        const icons = ['🥇', '🥈'];
        explanation.alternatives.forEach((alt, index) => {
            if (typeof alt === 'object' && alt.name) {
                const productLink = alt.link || `https://www.amazon.in/s?k=${encodeURIComponent(alt.name)}`;
                html += `
                    <div style="background: white; border-radius: 12px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-left: 4px solid ${index === 0 ? '#4CAF50' : '#FF9800'};">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <span style="font-size: 22px;">${icons[index] || '⭐'}</span>
                            <div style="flex: 1; min-width: 120px;">
                                <strong style="font-size: 15px; color: #2E7D32;">${alt.name}</strong>
                                <p style="font-size: 13px; color: #555; margin: 3px 0 0 0;">${alt.description}</p>
                            </div>
                            <a href="${productLink}" target="_blank" style="background: #4CAF50; color: white; padding: 5px 14px; border-radius: 20px; text-decoration: none; font-size: 12px; white-space: nowrap;">
                                <i class="fas fa-external-link-alt"></i> View
                            </a>
                        </div>
                    </div>
                `;
            } else if (typeof alt === 'string') {
                html += `<p style="margin-bottom: 6px; font-size: 14px;"><i class="fas fa-check" style="color: #4CAF50;"></i> ${alt}</p>`;
            }
        });
        
        html += `</div></div>`;
    }
    
    resultContent.innerHTML = html;
}

function saveToHistory(analysisData) {
    if (!currentUser) return;
    
    let ingredientsText = '';
    if (analysisData.analysis && analysisData.analysis.extractedText) {
        ingredientsText = analysisData.analysis.extractedText;
    } else if (analysisData.analysis && analysisData.analysis.rawText) {
        ingredientsText = analysisData.analysis.rawText;
    } else if (analysisData.explanation && analysisData.explanation.summary) {
        ingredientsText = analysisData.explanation.summary;
    } else if (analysisData.product && analysisData.product.ingredients) {
        ingredientsText = analysisData.product.ingredients;
    } else if (analysisData.product && analysisData.product.name) {
        ingredientsText = analysisData.product.name;
    }
    
    if (!ingredientsText || ingredientsText.length < 10) {
        if (analysisData.analysis && analysisData.analysis.harmfulIngredients && analysisData.analysis.harmfulIngredients.includes('high sugar')) {
            ingredientsText = 'chocolate sugar sweet candy';
        } else if (analysisData.analysis && analysisData.analysis.harmfulIngredients && analysisData.analysis.harmfulIngredients.includes('high sodium')) {
            ingredientsText = 'chips salty crispy snack';
        } else if (analysisData.product && analysisData.product.name) {
            ingredientsText = analysisData.product.name;
        } else {
            ingredientsText = 'food snack product';
        }
    }
    
    const historyItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        score: analysisData.analysis.score,
        rating: analysisData.analysis.rating,
        ratingColor: analysisData.analysis.ratingColor,
        harmfulIngredients: analysisData.analysis.harmfulIngredients || [],
        goodIngredients: analysisData.analysis.goodIngredients || [],
        warnings: analysisData.analysis.warnings || [],
        summary: analysisData.explanation?.summary || 'No summary',
        ingredientsText: ingredientsText
    };
    
    const history = JSON.parse(localStorage.getItem(`nutriscan_history_${currentUser.email}`) || '[]');
    history.unshift(historyItem);
    if (history.length > 50) history.pop();
    localStorage.setItem(`nutriscan_history_${currentUser.email}`, JSON.stringify(history));
}

function loadHistory() {
    if (!currentUser) return;
    
    const history = JSON.parse(localStorage.getItem(`nutriscan_history_${currentUser.email}`) || '[]');
    const container = document.getElementById('historyList');
    
    if (history.length === 0) {
        container.innerHTML = `<div class="empty-history"><i class="fas fa-history"></i><p>No scan history yet</p><p style="font-size:12px">Scan your first food label</p></div>`;
        return;
    }
    
    container.innerHTML = history.map(item => {
        let scoreClass = 'moderate';
        if (item.score >= 8) scoreClass = 'healthy';
        else if (item.score <= 4) scoreClass = 'unhealthy';
        
        const date = new Date(item.timestamp);
        return `
            <div class="history-item" onclick='viewHistoryItem("${item.id}")'>
                <div class="history-header">
                    <div class="history-score ${scoreClass}">${item.score}/10</div>
                    <div class="history-date">${date.toLocaleDateString()}</div>
                </div>
                <div class="history-rating ${scoreClass}">${item.rating}</div>
                <div class="history-preview">${item.summary ? item.summary.substring(0, 80) : 'No details'}</div>
                ${item.warnings && item.warnings.length > 0 ? `<div class="history-warning"><i class="fas fa-exclamation-triangle"></i> ${item.warnings.length} warning(s)</div>` : ''}
            </div>
        `;
    }).join('');
}

function viewHistoryItem(itemId) {
    const history = JSON.parse(localStorage.getItem(`nutriscan_history_${currentUser.email}`) || '[]');
    const item = history.find(h => h.id === itemId);
    
    if (item) {
        let harmfulText = '';
        if (item.harmfulIngredients && item.harmfulIngredients.length > 0) {
            if (item.harmfulIngredients.includes('high sugar')) {
                harmfulText = 'High sugar can spike your blood sugar levels. Too much sugar also adds empty calories that can cause weight gain over time.';
            } else if (item.harmfulIngredients.includes('high sodium')) {
                harmfulText = 'High sodium is not good for your blood pressure. It can make your heart work harder than it needs to.';
            } else if (item.harmfulIngredients.includes('palm oil')) {
                harmfulText = 'Palm oil contains saturated fats which can increase your bad cholesterol levels. This is not good for your heart health.';
            } else {
                harmfulText = `${item.harmfulIngredients.join(', ')} - These ingredients are not good for your health. Try to limit foods containing them.`;
            }
        }
        
        let goodText = '';
        if (item.goodIngredients && item.goodIngredients.length > 0) {
            if (item.goodIngredients.includes('fiber')) {
                goodText = 'Fiber is great for your digestion. It helps you feel full longer and supports heart health.';
            } else if (item.goodIngredients.includes('protein')) {
                goodText = 'Protein is essential for building and repairing muscles. It also helps you feel satisfied after eating.';
            } else if (item.goodIngredients.includes('natural ingredients')) {
                goodText = 'Natural ingredients mean fewer artificial additives. This is generally better for your overall health.';
            } else {
                goodText = `${item.goodIngredients.join(', ')} - These ingredients are beneficial for your health.`;
            }
        }
        
        const fakeAnalysis = {
            success: true,
            analysis: {
                score: item.score,
                rating: item.rating,
                ratingColor: item.ratingColor,
                harmfulIngredients: item.harmfulIngredients || [],
                goodIngredients: item.goodIngredients || [],
                warnings: item.warnings || []
            },
            explanation: {
                summary: item.summary || (item.score >= 7 ? 'Good news! This product is actually good for your health.' : item.score >= 4 ? 'This product is okay but not great.' : 'Here is the truth - this product is not good for your health.'),
                harmfulDetails: harmfulText ? [harmfulText] : [],
                goodDetails: goodText ? [goodText] : [],
                alternatives: []
            }
        };
        displayResults(fakeAnalysis);
        showPage('resultPage');
    }
}

// ============================================
// CAMERA FUNCTIONS
// ============================================

async function openCamera() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Camera not supported. Please upload image instead.', 'error');
            document.getElementById('fileInput').click();
            return;
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });
        
        cameraStream = stream;
        
        videoElement = document.createElement('video');
        videoElement.srcObject = stream;
        videoElement.setAttribute('playsinline', true);
        videoElement.style.width = '100%';
        videoElement.style.maxHeight = '60vh';
        videoElement.style.objectFit = 'cover';
        
        canvasElement = document.createElement('canvas');
        canvasContext = canvasElement.getContext('2d', { willReadFrequently: true });
        
        modalElement = document.createElement('div');
        modalElement.id = 'cameraModal';
        modalElement.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: black; z-index: 100000;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
        `;
        
        const modeToggle = document.createElement('button');
        modeToggle.id = 'modeToggle';
        modeToggle.innerHTML = '🤖 Auto Detect ON';
        modeToggle.style.cssText = `
            position: absolute; top: 20px; left: 20px;
            padding: 10px 20px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 30px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            z-index: 100001;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        
        const statusText = document.createElement('div');
        statusText.id = 'detectStatus';
        statusText.innerHTML = '🔍 Searching for ingredient label...';
        statusText.style.cssText = `
            position: absolute; top: 60px; left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.75);
            color: white;
            padding: 10px 20px;
            border-radius: 30px;
            font-size: 14px;
            font-weight: 500;
            z-index: 100001;
            white-space: nowrap;
            backdrop-filter: blur(5px);
            font-family: inherit;
        `;
        
        const captureBtn = document.createElement('button');
        captureBtn.id = 'captureBtn';
        captureBtn.innerHTML = '📸 Manual Capture';
        captureBtn.style.cssText = `
            margin-top: 20px; padding: 15px 30px;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 50px;
            font-size: 18px;
            cursor: pointer;
            font-weight: bold;
            z-index: 100001;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '❌ Close';
        closeBtn.style.cssText = `
            margin-top: 10px; padding: 10px 20px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 50px;
            font-size: 14px;
            cursor: pointer;
            z-index: 100001;
        `;
        
        modalElement.appendChild(videoElement);
        modalElement.appendChild(modeToggle);
        modalElement.appendChild(statusText);
        modalElement.appendChild(captureBtn);
        modalElement.appendChild(closeBtn);
        document.body.appendChild(modalElement);
        
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
            startAutoDetection(canvasElement, canvasContext, statusText, stream);
        };
        
        modeToggle.onclick = () => {
            isAutoMode = !isAutoMode;
            if (isAutoMode) {
                modeToggle.innerHTML = '🤖 Auto Detect ON';
                modeToggle.style.background = '#4CAF50';
                statusText.innerHTML = '🔍 Auto detecting ingredients...';
                statusText.style.display = 'block';
                if (detectionInterval) {
                    clearInterval(detectionInterval);
                }
                startAutoDetection(canvasElement, canvasContext, statusText, stream);
            } else {
                modeToggle.innerHTML = '👆 Manual Mode ON';
                modeToggle.style.background = '#FF9800';
                statusText.innerHTML = '📸 Click "Manual Capture" to take photo';
                statusText.style.display = 'block';
                if (detectionInterval) {
                    clearInterval(detectionInterval);
                    detectionInterval = null;
                }
            }
        };
        
        captureBtn.onclick = () => {
            if (videoElement.videoWidth === 0) {
                showToast('Please wait, camera loading...', 'info');
                return;
            }
            capturePhoto(canvasElement, canvasContext, statusText, stream, true);
        };
        
        closeBtn.onclick = () => {
            closeCamera();
        };
        
    } catch (error) {
        console.error('Camera error:', error);
        
        if (error.name === 'NotAllowedError') {
            showToast('Camera permission denied. Please allow camera access.', 'error');
        } else if (error.name === 'NotFoundError') {
            showToast('No camera found on this device.', 'error');
        } else {
            showToast('Could not open camera. Please upload image instead.', 'error');
        }
        
        document.getElementById('fileInput').click();
    }
}

function closeCamera() {
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
    }
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    if (modalElement) {
        modalElement.remove();
        modalElement = null;
    }
    isAutoMode = true;
}

function capturePhoto(canvas, ctx, statusText, stream, isManual = false) {
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(blob => {
        showPhotoPreview(blob, stream);
    }, 'image/jpeg', 0.95);
}

function showPhotoPreview(blob, stream) {
    videoElement.style.display = 'none';
    
    const captureBtn = document.querySelector('#captureBtn');
    const modeToggle = document.querySelector('#modeToggle');
    const statusText = document.querySelector('#detectStatus');
    
    if (captureBtn) captureBtn.style.display = 'none';
    if (modeToggle) modeToggle.style.display = 'none';
    if (statusText) statusText.style.display = 'none';
    
    let previewContainer = document.querySelector('#previewContainer');
    if (!previewContainer) {
        previewContainer = document.createElement('div');
        previewContainer.id = 'previewContainer';
        previewContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin-top: 20px;
            z-index: 100001;
        `;
        modalElement.appendChild(previewContainer);
    }
    
    const previewImg = document.createElement('img');
    previewImg.id = 'previewImg';
    previewImg.src = URL.createObjectURL(blob);
    previewImg.style.cssText = `
        max-width: 90%;
        max-height: 50vh;
        border-radius: 12px;
        margin-bottom: 15px;
        border: 3px solid #4CAF50;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    `;
    
    const confirmBtn = document.createElement('button');
    confirmBtn.innerHTML = '✅ Confirm & Analyze';
    confirmBtn.style.cssText = `
        padding: 12px 25px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 50px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        margin-bottom: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    
    const retakeBtn = document.createElement('button');
    retakeBtn.innerHTML = '🔄 Retake Photo';
    retakeBtn.style.cssText = `
        padding: 12px 25px;
        background: #FF9800;
        color: white;
        border: none;
        border-radius: 50px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        margin-bottom: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    
    previewContainer.innerHTML = '';
    previewContainer.appendChild(previewImg);
    previewContainer.appendChild(confirmBtn);
    previewContainer.appendChild(retakeBtn);
    previewContainer.style.display = 'flex';
    
    let capturedBlob = blob;
    
    confirmBtn.onclick = () => {
        const file = new File([capturedBlob], "captured-photo.jpg", { type: "image/jpeg" });
        handleImageUpload(file);
        closeCamera();
    };
    
    retakeBtn.onclick = () => {
        videoElement.style.display = 'block';
        previewContainer.style.display = 'none';
        if (captureBtn) captureBtn.style.display = 'block';
        if (modeToggle) modeToggle.style.display = 'block';
        if (statusText) statusText.style.display = 'block';
        
        if (isAutoMode) {
            statusText.innerHTML = '🔍 Searching for label...';
            statusText.style.background = 'rgba(0,0,0,0.75)';
            if (detectionInterval) {
                clearInterval(detectionInterval);
                detectionInterval = null;
            }
            startAutoDetection(canvasElement, canvasContext, statusText, stream);
        } else {
            statusText.innerHTML = '📸 Manual mode - Click capture button';
        }
    };
}

function detectTextRegions(imageData, width, height) {
    const data = imageData.data;
    const edges = [];
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const brightness = (data[idx] + data[idx+1] + data[idx+2]) / 3;
            
            if (y > 0) {
                const prevIdx = ((y-1) * width + x) * 4;
                const prevBrightness = (data[prevIdx] + data[prevIdx+1] + data[prevIdx+2]) / 3;
                if (Math.abs(brightness - prevBrightness) > 40) {
                    edges.push({x, y});
                }
            }
        }
    }
    
    const edgeDensity = edges.length / (width * height);
    return edgeDensity > 0.05;
}

function drawDetectionBorder(ctx, width, height, hasText) {
    if (!hasText) return;
    
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(20, 20, width - 40, height - 40);
    
    ctx.setLineDash([]);
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 4;
    
    ctx.beginPath();
    ctx.moveTo(20, 45);
    ctx.lineTo(20, 20);
    ctx.lineTo(45, 20);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(width - 45, 20);
    ctx.lineTo(width - 20, 20);
    ctx.lineTo(width - 20, 45);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(20, height - 45);
    ctx.lineTo(20, height - 20);
    ctx.lineTo(45, height - 20);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(width - 45, height - 20);
    ctx.lineTo(width - 20, height - 20);
    ctx.lineTo(width - 20, height - 45);
    ctx.stroke();
}

function startAutoDetection(canvas, ctx, statusText, stream) {
    if (detectionInterval) {
        clearInterval(detectionInterval);
    }
    
    let stableCount = 0;
    let lastHasText = false;
    
    detectionInterval = setInterval(() => {
        if (!isAutoMode || !videoElement || videoElement.videoWidth === 0) return;
        
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hasText = detectTextRegions(imageData, canvas.width, canvas.height);
        
        ctx.putImageData(imageData, 0, 0);
        drawDetectionBorder(ctx, canvas.width, canvas.height, hasText);
        
        if (hasText) {
            stableCount++;
            if (stableCount >= 3) {
                statusText.innerHTML = '✅ Clear label detected! Capturing...';
                statusText.style.background = 'rgba(76, 175, 80, 0.9)';
                capturePhoto(canvas, ctx, statusText, stream);
                clearInterval(detectionInterval);
                detectionInterval = null;
            } else {
                const dots = '.'.repeat(stableCount);
                statusText.innerHTML = `🔍 Label detected! Hold steady${dots}`;
                statusText.style.background = 'rgba(76, 175, 80, 0.8)';
            }
            lastHasText = true;
        } else {
            stableCount = 0;
            if (lastHasText) {
                statusText.innerHTML = '📱 Align label in frame...';
                statusText.style.background = 'rgba(0,0,0,0.7)';
            } else {
                statusText.innerHTML = '🔍 Searching for ingredient label...';
                statusText.style.background = 'rgba(0,0,0,0.7)';
            }
            lastHasText = false;
        }
    }, 500);
}

// ============================================
// TAP RIPPLE EFFECT — fires on any press of a main button/tile
// ============================================
const RIPPLE_SELECTOR = '.action-btn, .auth-btn, .analyze-btn, .save-profile-btn, ' +
    '.tab-btn, .nav-btn, .back-btn, .reset-success-btn, .history-item, .barcode-btn';
// Buttons with a solid dark/gradient fill need a light ripple to show up;
// everything else (white/light surfaces) gets a brand-green tinted ripple.
const RIPPLE_LIGHT_SELECTOR = '.auth-btn, .action-btn.primary, .action-btn.barcode, ' +
    '.analyze-btn, .save-profile-btn, .reset-success-btn, .back-btn';

function initRippleEffect() {
    document.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest(RIPPLE_SELECTOR);
        if (!btn) return;

        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 1.5;
        const x = (e.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2;
        const y = (e.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2;

        const ripple = document.createElement('span');
        ripple.className = btn.matches(RIPPLE_LIGHT_SELECTOR) ? 'ripple-span ripple-span-light' : 'ripple-span';
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;

        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
        setTimeout(() => ripple.remove(), 700); // safety fallback
    });
}

// ============================================
// EVENT LISTENERS
// ============================================

function initEventListeners() {
    initRippleEffect();

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchAuthTab(btn.dataset.tab);
        });
    });
    
    // LOGIN
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        login(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
    });
    
    // SIGNUP
    document.getElementById('signupForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupConfirmPassword').value;
        
        if (password !== confirmPassword) {
            showToast('❌ Passwords do not match!', 'error');
            return;
        }
        
        signup(document.getElementById('signupName').value, document.getElementById('signupEmail').value, password);
    });
    
    // FORGOT PASSWORD
    document.getElementById('forgotPasswordForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value;
        forgotPassword(email);
    });
    
    // RESET PASSWORD
    document.getElementById('resetPasswordForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const token = (document.getElementById('resetPasswordForm').dataset.token || '').trim();
        const newPassword = document.getElementById('resetNewPassword').value.trim();
        const confirmPassword = document.getElementById('resetConfirmPassword').value.trim();

        if (!token) {
            showToast('Reset link is invalid or expired. Please request a new one.', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }
        
        if (newPassword.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        
        resetPassword(token, newPassword);
    });
    
    // FORGOT PASSWORD LINK - Login form mein
    document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
        e.preventDefault();
        showForgotPassword();
    });
    
    // BACK TO LOGIN - Forgot Password form se
    document.getElementById('backToLogin').addEventListener('click', (e) => {
        e.preventDefault();
        switchAuthTab('login');
    });
    
    // BACK TO LOGIN - Reset Password form se
    document.getElementById('backToLoginFromReset').addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/';
    });

    // GO TO LOGIN - from the password reset success overlay
    document.getElementById('goToLoginBtn').addEventListener('click', () => {
        window.location.href = '/';
    });
    
    document.getElementById('historyBtn').addEventListener('click', () => showPage('historyPage'));
    document.getElementById('profileBtn').addEventListener('click', () => showPage('profilePage'));
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('analyzeBtn').addEventListener('click', analyzeImage);
    document.getElementById('saveProfileBtn').addEventListener('click', saveUserProfile);
    
    // File input
    document.getElementById('fileInput').addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleImageUpload(e.target.files[0]);
        }
    });
    
    // Barcode Scanner events
    document.getElementById('barcodeBtn').addEventListener('click', () => {
        showPage('barcodePage');
        setTimeout(startBarcodeScanner, 500);
    });
    
    document.getElementById('barcodeBackBtn').addEventListener('click', closeBarcodeScanner);
    document.getElementById('barcodeCloseBtn').addEventListener('click', closeBarcodeScanner);
    document.getElementById('barcodeTorchBtn').addEventListener('click', toggleBarcodeTorch);
    document.getElementById('barcodeManualSubmit').addEventListener('click', searchBarcodeManual);
    document.getElementById('barcodeResultBackBtn').addEventListener('click', () => showPage('homePage'));
    
    document.getElementById('barcodeManualInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchBarcodeManual();
    });
    
    document.getElementById('cameraBtn').addEventListener('click', openCamera);
    document.getElementById('cameraInput').addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleImageUpload(e.target.files[0]);
        }
    });
    
    // Barcode Manual Button Toggle
    document.getElementById('barcodeManualBtn').addEventListener('click', () => {
        const manualInput = document.getElementById('manualBarcodeInput');
        let overlay = document.getElementById('barcodeOverlay');
        const container = document.getElementById('barcodeVideoContainer');
        const status = document.getElementById('barcodeStatus');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'barcodeOverlay';
            if (container) {
                container.appendChild(overlay);
            }
        }
        
        if (manualInput.style.display === 'none' || manualInput.style.display === '') {
            if (barcodeScanner && isBarcodeScannerActive) {
                try {
                    barcodeScanner.stop();
                    isBarcodeScannerActive = false;
                } catch(err) {}
            }
            
            manualInput.style.display = 'block';
            document.getElementById('barcodeManualInput').focus();
            
            if (overlay) {
                overlay.classList.add('manual');
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.style.position = 'absolute';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.right = '0';
                overlay.style.bottom = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
                overlay.style.backdropFilter = 'blur(16px)';
                overlay.style.webkitBackdropFilter = 'blur(16px)';
                overlay.style.zIndex = '10';
                overlay.style.cursor = 'pointer';
                overlay.style.pointerEvents = 'auto';
                overlay.style.borderRadius = '16px';
                overlay.style.margin = '0';
                overlay.style.padding = '0';
                overlay.style.opacity = '1';
                
                overlay.innerHTML = `
                    <div class="overlay-card">
                        <div class="orb1"></div>
                        <div class="orb2"></div>
                        <div class="overlay-icon">
                            <i class="fas fa-keyboard"></i>
                        </div>
                        <h2 class="overlay-title">Manual Entry</h2>
                        <p class="overlay-sub">
                            <i class="fas fa-arrow-up"></i>
                            Tap to switch to scan
                        </p>
                    </div>
                `;
                
                overlay.onclick = function(e) {
                    if (e.target.closest('#manualBarcodeInput')) return;
                    manualInput.style.display = 'none';
                    overlay.classList.remove('manual');
                    startBarcodeScanner();
                };
            }
            
            if (status) {
                status.textContent = '✏️ Enter barcode manually or tap overlay to scan';
                status.style.background = 'rgba(255, 152, 0, 0.9)';
                status.style.position = 'absolute';
                status.style.bottom = '20px';
                status.style.left = '50%';
                status.style.transform = 'translateX(-50%)';
                status.style.zIndex = '20';
                status.style.padding = '10px 24px';
                status.style.borderRadius = '50px';
                status.style.fontSize = '14px';
                status.style.fontWeight = '500';
                status.style.maxWidth = '90%';
                status.style.whiteSpace = 'nowrap';
                status.style.overflow = 'hidden';
                status.style.textOverflow = 'ellipsis';
                status.style.display = 'block';
            }
            
            document.getElementById('barcodeManualBtn').innerHTML = '<i class="fas fa-camera"></i> Scan';
        } else {
            manualInput.style.display = 'none';
            overlay.classList.remove('manual');
            showOverlay();
            document.getElementById('barcodeManualBtn').innerHTML = '<i class="fas fa-keyboard"></i> Manual';
        }
    });
    
    // Clear History
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            
            const modalContent = document.createElement('div');
            modalContent.style.cssText = `
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 300px;
                width: 90%;
                text-align: center;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            `;
            
            modalContent.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f44336; margin-bottom: 16px; display: block;"></i>
                <h3 style="margin-bottom: 8px; font-size: 18px;">Clear History?</h3>
                <p style="margin-bottom: 20px; color: #666; font-size: 14px;">Are you sure you want to clear all your scan history? This action cannot be undone.</p>
                <div style="display: flex; gap: 12px;">
                    <button id="confirmClearBtn" style="flex: 1; padding: 10px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">Yes, Clear</button>
                    <button id="cancelClearBtn" style="flex: 1; padding: 10px; background: #ccc; color: #333; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">Cancel</button>
                </div>
            `;
            
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
            
            document.getElementById('confirmClearBtn').onclick = () => {
                localStorage.removeItem(`nutriscan_history_${currentUser.email}`);
                loadHistory();
                showToast('History cleared successfully!', 'success');
                modal.remove();
            };
            
            document.getElementById('cancelClearBtn').onclick = () => {
                modal.remove();
            };
            
            modal.onclick = (e) => {
                if (e.target === modal) modal.remove();
            };
        });
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    checkAuth();
    
    // Check for reset token in URL
    const path = window.location.pathname;
    console.log('📍 Current path:', path);

    const tokenMatch = path.match(/\/reset-password\/([^\/\?\#]+)/);
    if (tokenMatch) {
        const token = tokenMatch[1].trim();
        console.log('🔑 Reset token found:', token);
        
        document.body.classList.add('reset-mode');
        console.log('✅ reset-mode class added to body');
        
        // HIDE ALL AUTH FORMS
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.remove('active');
            form.style.display = 'none';
            form.style.visibility = 'hidden';
            form.style.opacity = '0';
            form.style.height = '0';
            form.style.overflow = 'hidden';
            form.style.padding = '0';
            form.style.margin = '0';
        });
        
        // HIDE TABS
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.display = 'none';
            btn.style.visibility = 'hidden';
            btn.style.opacity = '0';
            btn.style.height = '0';
            btn.style.overflow = 'hidden';
            btn.style.padding = '0';
            btn.style.margin = '0';
        });
        
        // HIDE AUTH TABS CONTAINER
        const authTabs = document.querySelector('.auth-tabs');
        if (authTabs) {
            authTabs.style.display = 'none';
            authTabs.style.visibility = 'hidden';
            authTabs.style.opacity = '0';
            authTabs.style.height = '0';
            authTabs.style.overflow = 'hidden';
            authTabs.style.padding = '0';
            authTabs.style.margin = '0';
        }
        
        // SHOW ONLY RESET PASSWORD FORM
        const resetForm = document.getElementById('resetPasswordForm');
        if (resetForm) {
            resetForm.style.display = 'block';
            resetForm.style.visibility = 'visible';
            resetForm.style.opacity = '1';
            resetForm.style.height = 'auto';
            resetForm.style.overflow = 'visible';
            resetForm.style.padding = '0';
            resetForm.style.margin = '0';
            resetForm.classList.add('active');
            resetForm.dataset.token = token;
            console.log('✅ Reset password form shown');
        }
        
        // AUTH CONTAINER VISIBLE
        const authContainer = document.getElementById('authContainer');
        if (authContainer) {
            authContainer.style.display = 'flex';
            authContainer.style.visibility = 'visible';
            authContainer.style.opacity = '1';
        }
        
        // HIDE MAIN APP
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) {
            mainContainer.classList.remove('active');
        }
    } else {
        document.body.classList.remove('reset-mode');
    }
    
    // ============================================
    // TOGGLE PASSWORD VISIBILITY - REMOVED FOR RESET FORM
    // ============================================
    
    // NOTE: Eye icon toggles removed for reset form since eye icons are removed
    // Reset password fields are now always visible (type="text")
});