const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TITLE_MAX = 200;
const CONTENT_MAX = 5000;
const NAME_MAX = 100;

export interface ValidationError {
  field: string;
  message: string;
}

export function validateEmail(value: unknown, fieldName: string): ValidationError | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { field: fieldName, message: `${fieldName} is required` };
  }
  if (value.length > 254) {
    return { field: fieldName, message: `${fieldName} is too long (max 254 characters)` };
  }
  if (!EMAIL_RE.test(value)) {
    return { field: fieldName, message: `${fieldName} format is invalid` };
  }
  return null;
}

export function validateLength(
  value: unknown,
  fieldName: string,
  max: number
): ValidationError | null {
  if (typeof value !== 'string') return null;
  if (value.length > max) {
    return { field: fieldName, message: `${fieldName} is too long (max ${max} characters)` };
  }
  return null;
}

export function validateFeedbackInput(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  const titleErr = validateLength(body.title, 'title', TITLE_MAX);
  if (titleErr) errors.push(titleErr);

  const contentErr = validateLength(body.content, 'content', CONTENT_MAX);
  if (contentErr) errors.push(contentErr);

  if (body.userEmail !== undefined && body.userEmail !== null && body.userEmail !== '') {
    const emailErr = validateEmail(body.userEmail, 'userEmail');
    if (emailErr) errors.push(emailErr);
  }

  return errors;
}

export function validateWelcomeEmailInput(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  const emailErr = validateEmail(body.userEmail, 'userEmail');
  if (emailErr) errors.push(emailErr);

  const nameErr = validateLength(body.userName, 'userName', NAME_MAX);
  if (nameErr) errors.push(nameErr);

  return errors;
}