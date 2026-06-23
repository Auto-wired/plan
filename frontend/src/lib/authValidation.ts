const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SPECIAL_CHAR_REGEX = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;/'`~]/

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim())
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 8 && SPECIAL_CHAR_REGEX.test(password)
}

export function isValidNickname(nickname: string): boolean {
  const trimmed = nickname.trim()
  return trimmed.length >= 2 && trimmed.length <= 20
}

export type SignUpValidationStep = 'email' | 'nickname' | 'password' | 'passwordConfirm'

export interface SignUpFormValues {
  email: string
  password: string
  confirmPassword: string
  nickname: string
}

export function validateSignUpStep(
  step: SignUpValidationStep,
  values: SignUpFormValues,
): string | null {
  switch (step) {
    case 'email':
      if (!values.email.trim()) return '이메일을 입력해주세요.'
      if (!isValidEmail(values.email)) return '올바른 이메일 형식이 아닙니다.'
      return null
    case 'nickname':
      if (!isValidNickname(values.nickname)) return '닉네임은 2~20자로 입력해주세요.'
      return null
    case 'password':
      if (!isStrongPassword(values.password)) {
        return '8자 이상, 특수문자 1개 이상 포함해야 합니다.'
      }
      return null
    case 'passwordConfirm':
      if (values.password !== values.confirmPassword) {
        return '비밀번호가 일치하지 않습니다.'
      }
      return null
    default:
      return null
  }
}

const SIGN_UP_STEPS: SignUpValidationStep[] = [
  'email',
  'nickname',
  'password',
  'passwordConfirm',
]

export function validateSignUpForm(values: SignUpFormValues): string | null {
  for (const step of SIGN_UP_STEPS) {
    const error = validateSignUpStep(step, values)
    if (error) return error
  }
  return null
}

export function validateLoginForm(email: string, password: string): string | null {
  const trimmedEmail = email.trim()
  const hasEmail = trimmedEmail.length > 0
  const hasPassword = password.length > 0

  if (!hasEmail && !hasPassword) {
    return '이메일과 비밀번호를 입력해주세요.'
  }
  if (!hasEmail) {
    return '이메일을 입력해주세요.'
  }
  if (!hasPassword) {
    return '비밀번호를 입력해주세요.'
  }
  return null
}

/** signUp 응답에서 identities가 비어 있을 때 (이미 등록된 이메일) */
export const SIGNUP_ERROR_ALREADY_REGISTERED = 'ALREADY_REGISTERED'

export function isDuplicateSignUpUser(user: { identities?: unknown[] | null } | null): boolean {
  return Boolean(user && (!user.identities || user.identities.length === 0))
}

export function mapSignUpError(message: string): string {
  if (message === SIGNUP_ERROR_ALREADY_REGISTERED) {
    return '이미 사용 중인 이메일입니다.'
  }
  if (message === 'SIGNUP_NO_USER') {
    return '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.'
  }

  const lower = message.toLowerCase()
  if (
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('user already registered')
  ) {
    return '이미 사용 중인 이메일입니다.'
  }
  return '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.'
}

export function mapLoginError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid email or password')
  ) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.'
  }
  if (lower.includes('email not confirmed')) {
    return '이메일 인증이 완료되지 않았습니다.'
  }
  return '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.'
}
