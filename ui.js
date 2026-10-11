// Screen Router
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');

    const bottomNav = document.getElementById('bottom-nav');
    if (screenId === 'screen-splash' || screenId === 'screen-login' || screenId === 'screen-ar') {
        bottomNav.style.display = 'none';
    } else {
        bottomNav.style.display = 'flex';
    }
}

// Bottom Nav Highlighter
function switchNav(screenId, btnElement) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
    switchScreen(screenId);
}

// Simulated Login Check
function attemptLogin() {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    
    if(email === "" || pass === "") {
        alert("Please enter your email and password to log in.");
        return;
    }
    
    // Clear inputs and proceed to dashboard
    document.getElementById('email-input').value = "";
    document.getElementById('password-input').value = "";
    switchScreen('screen-dashboard');
}

// Simulated Google Login
function attemptGoogleLogin() {
    alert("Google Authentication API will be integrated later.");
}
