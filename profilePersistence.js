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

module.exports = { mapProfileRecord, buildProfileUpdate };
