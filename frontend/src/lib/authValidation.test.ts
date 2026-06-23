import { describe, expect, it } from 'vitest'
import {
  isDuplicateSignUpUser,
  isValidEmail,
  isValidNickname,
  isStrongPassword,
  mapLoginError,
  mapSignUpError,
  SIGNUP_ERROR_ALREADY_REGISTERED,
  validateLoginForm,
  validateSignUpForm,
} from './authValidation'

describe('validateLoginForm', () => {
  it('빈 이메일·비밀번호', () => {
    expect(validateLoginForm('', '')).toBe('이메일과 비밀번호를 입력해주세요.')
  })

  it('빈 이메일', () => {
    expect(validateLoginForm('  ', 'secret')).toBe('이메일을 입력해주세요.')
  })

  it('빈 비밀번호', () => {
    expect(validateLoginForm('a@b.com', '')).toBe('비밀번호를 입력해주세요.')
  })

  it('입력 완료 시 null', () => {
    expect(validateLoginForm('a@b.com', 'secret')).toBeNull()
  })
})

describe('validateSignUpForm', () => {
  const valid = {
    email: 'user@example.com',
    nickname: '닉네임',
    password: 'Password1!',
    confirmPassword: 'Password1!',
  }

  it('유효한 입력', () => {
    expect(validateSignUpForm(valid)).toBeNull()
  })

  it('빈 이메일', () => {
    expect(validateSignUpForm({ ...valid, email: '' })).toBe('이메일을 입력해주세요.')
  })

  it('잘못된 이메일', () => {
    expect(validateSignUpForm({ ...valid, email: 'bad' })).toBe('올바른 이메일 형식이 아닙니다.')
  })
})

describe('isDuplicateSignUpUser', () => {
  it('identities 비어 있으면 중복', () => {
    expect(isDuplicateSignUpUser({ identities: [] })).toBe(true)
    expect(isDuplicateSignUpUser({ identities: null })).toBe(true)
  })

  it('identities 있으면 신규', () => {
    expect(isDuplicateSignUpUser({ identities: [{ provider: 'email' }] })).toBe(false)
  })

  it('user null이면 중복 아님', () => {
    expect(isDuplicateSignUpUser(null)).toBe(false)
  })
})

describe('mapLoginError', () => {
  it('잘못된 자격 증명', () => {
    expect(mapLoginError('Invalid login credentials')).toBe(
      '이메일 또는 비밀번호가 올바르지 않습니다.',
    )
  })

  it('미인증', () => {
    expect(mapLoginError('Email not confirmed')).toBe('이메일 인증이 완료되지 않았습니다.')
  })
})

describe('mapSignUpError', () => {
  it('중복 코드', () => {
    expect(mapSignUpError(SIGNUP_ERROR_ALREADY_REGISTERED)).toBe('이미 사용 중인 이메일입니다.')
  })
})

describe('helpers', () => {
  it('isValidEmail', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('')).toBe(false)
  })

  it('isStrongPassword', () => {
    expect(isStrongPassword('Password1!')).toBe(true)
    expect(isStrongPassword('short')).toBe(false)
  })

  it('isValidNickname', () => {
    expect(isValidNickname('ab')).toBe(true)
    expect(isValidNickname('a')).toBe(false)
  })
})
