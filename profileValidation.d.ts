export interface ProfileValidationInput {
  name: string;
  username: string;
  bio: string;
  accountType: 'personal' | 'business';
  businessName: string;
  businessCategory: string;
  businessDescription: string;
  website: string;
}

export interface ProfileValidationError {
  title: string;
  message: string;
}

export function validateProfile(input: ProfileValidationInput): ProfileValidationError | null;
