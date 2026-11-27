const PROFILE_ACTIVITY_STATUSES = new Set([
  'available', 'busy', 'work', 'drive', 'gym', 'school', 'college',
]);

function mapProfileRecord(record) {
  const rawStatus = typeof record.activity_status === 'string' ? record.activity_status.toLowerCase() : '';
  const status = PROFILE_ACTIVITY_STATUSES.has(rawStatus) ? rawStatus : '';
  return {
    name: record.display_name || 'MEEi User',
    username: record.username || 'your_username',
    bio: record.bio || '',
    website: record.website_url || '',
    occupation: record.profession_category || '',
    accountType: record.account_type === 'business' ? 'business' : 'personal',
    businessName: record.business_name || '',
    businessCategory: record.business_category || '',
    businessDescription: record.business_description || '',
    isPrivateAccount: !!record.is_private,
    activity: status ? status.charAt(0).toUpperCase() + status.slice(1) : '',
    countryCode: String(record.country_code || '').toUpperCase(),
    countryName: String(record.country_name || ''),
  };
}

function buildProfileUpdate(profile, updatedAt) {
  const isBusiness = profile.accountType === 'business';
  const requestedActivity = typeof profile.activity === 'string' ? profile.activity.toLowerCase() : '';
  const activityStatus = PROFILE_ACTIVITY_STATUSES.has(requestedActivity) ? requestedActivity : 'available';
  return {
    display_name: profile.name.trim(),
    username: profile.username.trim().replace(/[@#]/g, '').toLowerCase(),
    bio: profile.bio.trim(),
    website_url: profile.website.trim() || null,
    profession_category: profile.occupation.trim() || null,
    account_type: profile.accountType,
    business_name: isBusiness ? profile.businessName.trim() : null,
    business_category: isBusiness ? profile.businessCategory.trim() : null,
    business_description: isBusiness ? profile.businessDescription.trim() || null : null,
    is_private: !!profile.isPrivateAccount,
    country_code: profile.countryCode,
    country_name: profile.countryName,
    activity_status: activityStatus,
    updated_at: updatedAt,
  };
}


function resolveProfileCountry({ savedCountryCode, savedCountryName, deviceCountryCode, deviceCountryName, getDisplayName }) {
  const savedCode = String(savedCountryCode || '').toUpperCase();
  const savedName = String(savedCountryName || '');
  const deviceCode = String(deviceCountryCode || 'IN').toUpperCase();
  const deviceName = String(deviceCountryName || deviceCode);
  const countryCode = savedCode || deviceCode;
  const countryName = savedName || (savedCode ? getDisplayName(savedCode) : deviceName);
  const persistFields = {};

  if (!savedCode && !savedName) {
    persistFields.country_code = deviceCode;
    persistFields.country_name = deviceName;
  } else if (savedCode && !savedName) {
    persistFields.country_name = getDisplayName(savedCode);
  }

  return { countryCode, countryName, persistFields };
}

function mapProfileMediaRecord(record, signedUrl) {
  const uri = typeof signedUrl === 'string' && signedUrl.trim() ? signedUrl : '';
  return {
    uri,
    type: record.media_type,
    name: record.original_name || undefined,
    storagePath: record.storage_path,
    unavailable: !uri,
  };
}

function buildProfileMediaUpdate(record) {
  // These are the only fields an existing gallery row needs to change.
  // Keep ownership and media kind immutable during a replacement update.
  return {
    position: record.position,
    storage_path: record.storage_path,
    media_type: record.media_type,
    original_name: record.original_name ?? null,
    updated_at: record.updated_at,
  };
}

module.exports = { mapProfileRecord, buildProfileUpdate, buildProfileMediaUpdate, mapProfileMediaRecord, resolveProfileCountry };
