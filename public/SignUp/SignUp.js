const form = document.getElementById('signupForm');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const meterBar = document.getElementById('meterBar');
const strengthText = document.getElementById('strengthText');
const passwordHint = document.getElementById('passwordHint');
const statusMessage = document.getElementById('formStatus');

function getStrength(value) {
  let score = 0;

  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  if (score <= 1) return { label: 'Weak', width: '25%', color: '#d64545' };
  if (score === 2) return { label: 'Fair', width: '50%', color: '#e3922b' };
  if (score === 3) return { label: 'Good', width: '75%', color: '#1f9d55' };
  return { label: 'Strong', width: '100%', color: '#2bc46a' };
}

function updatePasswordMeter() {
  const strength = getStrength(passwordInput.value);
  meterBar.style.width = strength.width;
  meterBar.style.background = strength.color;
  strengthText.textContent = strength.label;
  passwordHint.textContent = passwordInput.value.length >= 8
    ? 'Looks good for a secure account.'
    : 'Use at least 8 characters.';
}

passwordInput.addEventListener('input', updatePasswordMeter);

Array.from(document.querySelectorAll('.toggle-password')).forEach((button) => {
  button.addEventListener('click', () => {
    const targetId = button.getAttribute('data-target');
    const target = document.getElementById(targetId);
    const isPassword = target.type === 'password';
    target.type = isPassword ? 'text' : 'password';
    button.textContent = isPassword ? 'Hide' : 'Show';
  });
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const terms = document.getElementById('terms').checked;

  statusMessage.classList.remove('error');
  statusMessage.textContent = '';

  if (!fullName || !email || !password || !confirmPassword) {
    statusMessage.classList.add('error');
    statusMessage.textContent = 'Please fill in all fields.';
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    statusMessage.classList.add('error');
    statusMessage.textContent = 'Please enter a valid email address.';
    return;
  }

  if (password.length < 8) {
    statusMessage.classList.add('error');
    statusMessage.textContent = 'Password must be at least 8 characters long.';
    return;
  }

  if (password !== confirmPassword) {
    statusMessage.classList.add('error');
    statusMessage.textContent = 'Passwords do not match.';
    return;
  }

  if (!terms) {
    statusMessage.classList.add('error');
    statusMessage.textContent = 'You must accept the terms to continue.';
    return;
  }

  statusMessage.classList.remove('error');
  statusMessage.textContent = `Welcome aboard, ${fullName}! Your account is ready.`;
  form.reset();
  updatePasswordMeter();
});
