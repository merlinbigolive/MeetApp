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
