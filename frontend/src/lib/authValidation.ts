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

export type SignUpValidationStep =
  | 'email'
  | 'password'
  | 'passwordConfirm'
  | 'duplicate'

export function validateSignUpStep(
  step: SignUpValidationStep,
  values: { email: string; password: string; confirmPassword: string; nickname: string },
): string | null {
  switch (step) {
    case 'email':
      if (!isValidEmail(values.email)) return '올바른 이메일 형식이 아닙니다.'
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

export function mapSignUpError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('already registered') ||
    lower.includes('already been registered') ||
    lower.includes('user already registered')
  ) {
    return '이미 사용 중인 이메일입니다.'
  }
  return message
}
