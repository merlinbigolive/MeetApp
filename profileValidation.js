const RESERVED_USERNAMES = new Set([
  'meei', 'meeiapp', 'meeiofficial', 'meeisvip', 'svipteam',
  'meeimoderation', 'meeimoderationteam', 'moderation', 'moderationteam',
]);

/**
 * Validate the normalized profile values submitted by the profile editor.
 * Returns the same user-facing validation message used by the app, or null.
 */
function validateProfile(input) {
  if (!input.name || input.name.length > 40) {
    return { title: 'Check display name', message: 'Enter a display name between 1 and 40 characters.' };
  }
  if (!/^[a-z0-9_]{3,25}$/.test(input.username)) {
    return { title: 'Check username', message: 'Username must be 3–25 characters and use only lowercase letters, numbers, or underscores.' };
  }
  const normalizedUsername = input.username.replace(/[^a-z0-9]/g, '');
  if (/^meei[0-9]+$/.test(normalizedUsername) || RESERVED_USERNAMES.has(normalizedUsername)) {
    return { title: 'Username reserved', message: 'This username is reserved for the official MEEi or Moderation Team account. Please choose another username.' };
  }
  if (input.bio.trim().length > 300) {
    return { title: 'Bio too long', message: 'Your bio can contain up to 300 characters.' };
  }
  if (input.accountType === 'business' && (!input.businessName || !input.businessCategory)) {
    return { title: 'Business details required', message: 'Enter your business name and category before switching to a professional business account.' };
  }
  if (input.businessName.length > 80 || input.businessCategory.length > 60 || input.businessDescription.trim().length > 500) {
    return { title: 'Business details too long', message: 'Business name: 80 characters, category: 60, description: 500.' };
  }
  if (input.website && !/^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/[^\s]*)?$/i.test(input.website)) {
    return { title: 'Check website', message: 'Enter a valid website address.' };
  }
  return null;
}

module.exports = { validateProfile };
