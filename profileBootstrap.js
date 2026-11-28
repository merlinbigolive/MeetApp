const { isReservedUsername } = require('./profileValidation');

function buildProfileBootstrapPayloads(user) {
  const userId = String(user && user.id || '');
  if (!userId) throw new Error('A signed-in user ID is required to create a profile.');

  const rawEmailName = String(user.email || 'meeiuser').split('@')[0]
    .toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18);
  const emailName = rawEmailName || 'meeiuser';
  const metadataDisplayName = user.user_metadata && user.user_metadata.display_name;
  const displayName = (typeof metadataDisplayName === 'string'
    ? metadataDisplayName.trim().slice(0, 40)
    : '') || emailName;

  const primaryUsername = isReservedUsername(emailName)
    ? 'member_' + userId.replace(/-/g, '').slice(0, 6)
    : emailName + '_' + userId.slice(0, 6);

  return {
    primary: {
      id: userId,
      username: primaryUsername,
      display_name: displayName,
    },
    fallback: {
      id: userId,
      username: 'user_' + userId.replace(/-/g, '').slice(0, 16),
      display_name: displayName,
    },
  };
}

async function ensureProfileExists({ user, findProfile, insertProfile }) {
  if (typeof findProfile !== 'function' || typeof insertProfile !== 'function') {
    throw new Error('Profile bootstrap requires lookup and insert functions.');
  }

  const payloads = buildProfileBootstrapPayloads(user);
  if (await findProfile(payloads.primary.id)) {
    return { created: false, username: null };
  }

  try {
    await insertProfile(payloads.primary);
    return { created: true, username: payloads.primary.username };
  } catch (primaryError) {
    // Only a uniqueness collision is recoverable with another username.
    // Permission, connectivity, and schema errors must surface immediately.
    if (!primaryError || primaryError.code !== '23505') throw primaryError;
    // Another concurrent bootstrap may have created the profile while this
    // request was attempting its insert. Prefer that row over a second insert.
    if (await findProfile(payloads.primary.id)) {
      return { created: false, username: null };
    }

    try {
      await insertProfile(payloads.fallback);
      return { created: true, username: payloads.fallback.username };
    } catch (fallbackError) {
      if (await findProfile(payloads.primary.id)) {
        return { created: false, username: null };
      }
      const reason = fallbackError && fallbackError.message
        ? fallbackError.message
        : (primaryError && primaryError.message) || 'Unknown database error';
      throw new Error('Could not create your profile: ' + reason);
    }
  }
}

module.exports = { buildProfileBootstrapPayloads, ensureProfileExists };
