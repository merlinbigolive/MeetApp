function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

function normalizeOtp(code) {
  return code.trim();
}

function isValidOtp(token) {
  return /^\\d{6}$/.test(token);
}

module.exports = { normalizeEmail, isValidEmail, normalizeOtp, isValidOtp };
