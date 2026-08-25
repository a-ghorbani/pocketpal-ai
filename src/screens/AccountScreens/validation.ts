export type AccountValidationKey =
  | 'emailRequired'
  | 'emailInvalid'
  | 'passwordRequired'
  | 'nameRequired';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (email: string): AccountValidationKey | null => {
  const trimmed = email.trim();
  if (!trimmed) {
    return 'emailRequired';
  }
  return EMAIL_PATTERN.test(trimmed) ? null : 'emailInvalid';
};

export const validatePassword = (
  password: string,
): AccountValidationKey | null => (password ? null : 'passwordRequired');

export const validateName = (name: string): AccountValidationKey | null =>
  name.trim() ? null : 'nameRequired';
