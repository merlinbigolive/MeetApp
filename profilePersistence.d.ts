export type ProfileRecord = {
  display_name?: string | null; username?: string | null; bio?: string | null;
  website_url?: string | null; profession_category?: string | null;
  account_type?: string | null; business_name?: string | null;
  business_category?: string | null; business_description?: string | null;
  is_private?: boolean | null; activity_status?: string | null;
  country_code?: string | null; country_name?: string | null;
};
export type ProfileForm = {
  name: string; username: string; bio: string; website: string;
  occupation: string; accountType: 'personal' | 'business';
  businessName: string; businessCategory: string; businessDescription: string;
  isPrivateAccount: boolean; activity: string; countryCode: string; countryName: string;
};
export function mapProfileRecord(record: ProfileRecord): ProfileForm;
export function buildProfileUpdate(profile: ProfileForm, updatedAt: string): Record<string, string | boolean | null>;
export type ProfileMediaUpdateInput = {
  position: number;
  storage_path: string;
  media_type: 'image' | 'video';
  original_name?: string | null;
  updated_at: string;
};
export function buildProfileMediaUpdate(record: ProfileMediaUpdateInput): {
  position: number;
  storage_path: string;
  media_type: 'image' | 'video';
  original_name: string | null;
  updated_at: string;
};

export type ResolvedProfileCountry = {
  countryCode: string;
  countryName: string;
  persistFields: { country_code?: string; country_name?: string };
};
export function resolveProfileCountry(input: {
  savedCountryCode?: string | null;
  savedCountryName?: string | null;
  deviceCountryCode?: string | null;
  deviceCountryName?: string | null;
  getDisplayName: (countryCode: string) => string;
}): ResolvedProfileCountry;

export type ProfileMediaRecord = {
  media_type: 'image' | 'video';
  original_name?: string | null;
  storage_path: string;
};
export type MappedProfileMedia = {
  uri: string;
  type: 'image' | 'video';
  name?: string;
  storagePath: string;
  unavailable: boolean;
};
export function mapProfileMediaRecord(record: ProfileMediaRecord, signedUrl?: string | null): MappedProfileMedia;

export type ProfileMediaPreviewResult = { media: MappedProfileMedia; errorMessage: string | null };
export function resolveProfileMediaPreview(
  record: ProfileMediaRecord,
  createSignedUrl: (storagePath: string) => Promise<{ data?: { signedUrl?: string | null } | null; error?: unknown | null }>,
): Promise<ProfileMediaPreviewResult>;
