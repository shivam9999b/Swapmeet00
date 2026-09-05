// ============================================
// AUTHENTICATION - MAKE SURE IT INITIALIZES
// ============================================

// Wait for Firebase to be ready
console.log('🔐 Auth.js loading...');

// Force auth initialization check
if (typeof firebase !== 'undefined' && firebase.auth) {
    console.log('✅ Firebase auth available');
    // Rest of your auth code...
} else {
    console.error('❌ Firebase not loaded!');
    // Show error and redirect
    alert('Firebase not loaded. Please refresh the page.');
}

// ============================================
// AUTHENTICATION LOGIC - WITH ADMIN PANEL
// ============================================

// DOM Elements
const loginModal = document.getElementById('loginModal');
const signupModal = document.getElementById('signupModal');
const messageDiv = document.getElementById('message');

// ============================================
// ADMIN CHECK
// ============================================

// List of admin emails (Add your email here)
const ADMIN_EMAILS = [
    'admin@swapmeet.com',
    'your-email@gmail.com',  // ← Add your email here
    'swapmeet.admin@gmail.com'
];

// Check if user is admin
async function checkAdmin(user) {
    if (!user) return false;
    
    // Check if email is in admin list
    if (ADMIN_EMAILS.includes(user.email)) {
        // Also check if admin in database (optional)
        try {
            const snapshot = await database.ref('admins/' + user.uid).once('value');
            return snapshot.val() === true || ADMIN_EMAILS.includes(user.email);
        } catch (error) {
            // If database check fails, still allow if email is in list
            return ADMIN_EMAILS.includes(user.email);
        }
    }
    return false;
}

// ============================================
// AUTH STATE OBSERVER
// ============================================
auth.onAuthStateChanged(async (user) => {
    const currentPath = window.location.pathname;
    
    if (user) {
        console.log('✅ User logged in:', user.email);
        
        // Check if admin
        const isAdmin = await checkAdmin(user);
        if (isAdmin) {
            user.isAdmin = true;
            console.log('👑 Admin user detected!');
        }
        
        // Update header button on index page
        const statusBtn = document.querySelector('.user-status button');
        if (statusBtn) {
            statusBtn.innerHTML = `<i class="fas fa-user"></i> ${user.displayName || 'User'}`;
            statusBtn.style.background = '#34d399';
            statusBtn.onclick = () => {
                if (confirm('Logout?')) {
                    auth.signOut();
                }
            };
        }
        
        // Show admin link
        const adminLink = document.getElementById('adminLink');
        if (adminLink) {
            adminLink.style.display = isAdmin ? 'inline' : 'none';
        }
        
        // Close modals
        if (loginModal) loginModal.style.display = 'none';
        if (signupModal) signupModal.style.display = 'none';
        
        // Show welcome message
        showMessage(`Welcome back${isAdmin ? ' Admin' : ''}! 🎉`, 'success');
        
    } else {
        console.log('❌ User signed out');
        
        // Redirect to index if on chat page
        if (currentPath.includes('chat.html')) {
            console.log('🔄 Redirecting to login page...');
            window.location.href = 'index.html';
            return;
        }
        
        // Update header button on index page
        const statusBtn = document.querySelector('.user-status button');
        if (statusBtn) {
            statusBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
            statusBtn.style.background = '#5b2b8c';
            statusBtn.onclick = () => {
                if (loginModal) loginModal.style.display = 'flex';
            };
        }
        
        // Hide admin link
        const adminLink = document.getElementById('adminLink');
        if (adminLink) {
            adminLink.style.display = 'none';
        }
    }
});

// ============================================
// ADD ADMIN LINK TO HEADER
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Find header right section
    const headerRight = document.querySelector('.header-right') || document.querySelector('.user-status')?.parentElement;
    
    if (headerRight && !document.getElementById('adminLink')) {
        // Insert admin link before user status
        headerRight.insertAdjacentHTML('afterbegin', `
            <a href="admin.html" class="admin-link" id="adminLink" style="display:none; color: #8a5cb8; text-decoration: none; font-weight: 600; margin-right: 16px; align-items: center; gap: 6px;">
                <i class="fas fa-crown"></i> Admin
            </a>
        `);
    }
});

// ============================================
// MODAL CONTROLS
// ============================================
document.getElementById('headerLoginBtn')?.addEventListener('click', () => {
    if (loginModal) loginModal.style.display = 'flex';
});

document.getElementById('closeModal')?.addEventListener('click', () => {
    if (loginModal) loginModal.style.display = 'none';
});

document.getElementById('closeSignupModal')?.addEventListener('click', () => {
    if (signupModal) signupModal.style.display = 'none';
});

document.getElementById('showSignup')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (loginModal) loginModal.style.display = 'none';
    if (signupModal) signupModal.style.display = 'flex';
});

document.getElementById('showLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (signupModal) signupModal.style.display = 'none';
    if (loginModal) loginModal.style.display = 'flex';
});

window.addEventListener('click', (e) => {
    if (e.target === loginModal) loginModal.style.display = 'none';
    if (e.target === signupModal) signupModal.style.display = 'none';
});

// ============================================
// GOOGLE LOGIN
// ============================================
async function signInWithGoogle() {
    try {
        showMessage('Signing in with Google...', 'success');
        await auth.signInWithPopup(googleProvider);
    } catch (error) {
        console.error('Google login error:', error);
        if (error.code === 'auth/popup-closed-by-user') {
            showMessage('Sign-in popup was closed. Please try again.', 'error');
        } else {
            showMessage('Google login failed: ' + error.message, 'error');
        }
    }
}

document.getElementById('googleLoginBtn')?.addEventListener('click', signInWithGoogle);
document.getElementById('signupGoogleBtn')?.addEventListener('click', signInWithGoogle);

// ============================================
// EMAIL/PASSWORD LOGIN
// ============================================
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        showMessage('Please enter both email and password.', 'error');
        return;
    }

    try {
        showMessage('Logging in...', 'success');
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        console.error('Login error:', error);
        let message = 'Login failed. Please try again.';
        if (error.code === 'auth/user-not-found') {
            message = 'No account found with this email.';
        } else if (error.code === 'auth/wrong-password') {
            message = 'Incorrect password. Please try again.';
        } else if (error.code === 'auth/too-many-requests') {
            message = 'Too many attempts. Please try again later.';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Invalid email format.';
        }
        showMessage(message, 'error');
    }
});

// ============================================
// SIGNUP
// ============================================
document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;

    if (!name || !email || !password) {
        showMessage('Please fill all fields.', 'error');
        return;
    }

    if (password.length < 6) {
        showMessage('Password must be at least 6 characters.', 'error');
        return;
    }

    try {
        showMessage('Creating account...', 'success');
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await userCredential.user.updateProfile({ displayName: name });
        
        // Save user to database
        await database.ref('users/' + userCredential.user.uid).set({
            displayName: name,
            email: email,
            createdAt: Date.now(),
            online: true,
            lastSeen: Date.now()
        });
        
        // Check if this is an admin
        if (ADMIN_EMAILS.includes(email)) {
            await database.ref('admins/' + userCredential.user.uid).set(true);
            showMessage('Admin account created! 🎉', 'success');
        } else {
            showMessage('Account created successfully! 🎉', 'success');
        }
        
    } catch (error) {
        console.error('Signup error:', error);
        let message = 'Signup failed. Please try again.';
        if (error.code === 'auth/email-already-in-use') {
            message = 'This email is already registered.';
        } else if (error.code === 'auth/weak-password') {
            message = 'Password is too weak. Use at least 6 characters.';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Invalid email format.';
        }
        showMessage(message, 'error');
    }
});

// ============================================
// FORGOT PASSWORD
// ============================================
document.getElementById('forgotPassword')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) {
        showMessage('Please enter your email first.', 'error');
        return;
    }
    try {
        await auth.sendPasswordResetEmail(email);
        showMessage('Password reset email sent! Check your inbox.', 'success');
    } catch (error) {
        showMessage(error.message, 'error');
    }
});

// ============================================
// TOGGLE PASSWORD
// ============================================
document.getElementById('togglePw')?.addEventListener('click', function() {
    const input = document.getElementById('password');
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
    this.querySelector('i').classList.toggle('fa-eye');
    this.querySelector('i').classList.toggle('fa-eye-slash');
});

// ============================================
// CHAT BUTTONS
// ============================================
document.getElementById('startVideoBtn')?.addEventListener('click', () => {
    const user = auth.currentUser;
    if (user) {
        window.location.href = 'chat.html?mode=video';
    } else {
        if (loginModal) loginModal.style.display = 'flex';
        showMessage('Please login first to start chatting.', 'error');
    }
});

document.getElementById('startTextBtn')?.addEventListener('click', () => {
    const user = auth.currentUser;
    if (user) {
        window.location.href = 'chat.html?mode=text';
    } else {
        if (loginModal) loginModal.style.display = 'flex';
        showMessage('Please login first to start chatting.', 'error');
    }
});

// ============================================
// MESSAGE HELPER
// ============================================
function showMessage(text, type = 'error') {
    if (!messageDiv) return;
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    clearTimeout(messageDiv._timeout);
    messageDiv._timeout = setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    // Escape to close modals
    if (e.key === 'Escape') {
        if (loginModal && loginModal.style.display === 'flex') loginModal.style.display = 'none';
        if (signupModal && signupModal.style.display === 'flex') signupModal.style.display = 'none';
    }
});

// ============================================
// FIREBASE INITIALIZATION CHECK
// ============================================
console.log('✅ Auth.js loaded with admin panel support!');
console.log('👑 Admin emails:', ADMIN_EMAILS);

// Check if Firebase is properly initialized
setTimeout(() => {
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase not defined! Check your script tags.');
        showMessage('Firebase not loaded. Please refresh the page.', 'error');
    } else if (!firebase.auth) {
        console.error('❌ Firebase auth not available!');
        showMessage('Firebase auth not available. Please refresh the page.', 'error');
    } else {
        console.log('✅ Firebase auth is ready');
    }
}, 2000);