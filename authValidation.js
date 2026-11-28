function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeOtp(code) {
  return code.trim();
}

function isValidOtp(token) {
  return /^\d{6}$/.test(token);
}

function normalizePhone(phone) {
  return phone.replace(/[\s().-]/g, '');
}

function isValidPhone(phone) {
  // E.164: international format, leading +, 8–15 digits, non-zero country code.
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  normalizeOtp,
  isValidOtp,
  normalizePhone,
  isValidPhone,
};
