import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';
import { formatBaht, shortId } from './format';
 
describe('formatBaht', () => {
  it('formats string amounts from the API as Thai Baht', () => {
    expect(formatBaht('3290.00')).toBe('฿3,290.00');
    expect(formatBaht('0.10')).toBe('฿0.10');
  });
});
 
describe('shortId', () => {
  it('returns the first 8 characters in upper case', () => {
    expect(shortId('3f2a9c1e-1111-2222-3333-444455556666')).toBe('3F2A9C1E');
  });
});
 
describe('errorMessage', () => {
  it('maps known API error codes to Thai messages', () => {
    expect(errorMessage({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })).toBe(
      'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    );
  });
 
  it('lists validation details without the body. prefix', () => {
    const err = {
      code: 'VALIDATION_ERROR',
      details: [{ field: 'body.password', message: 'must be at least 8 characters' }],
    };
    expect(errorMessage(err)).toBe('password: must be at least 8 characters');
  });
 
  it('falls back to the API message for unknown codes', () => {
    expect(errorMessage({ code: 'SOMETHING_NEW', message: 'raw message' })).toBe('raw message');
  });
});
 
describe('errorMessage for invalid URL ids', () => {
  it('shows "not found" when only route params failed validation', () => {
    const err = { code: 'VALIDATION_ERROR', details: [{ field: 'params.id', message: 'must be a valid UUID' }] };
    expect(errorMessage(err)).toBe('ไม่พบข้อมูลที่ต้องการ');
  });
});
