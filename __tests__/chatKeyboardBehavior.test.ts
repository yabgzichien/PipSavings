import { chatKeyboardAvoidingBehavior } from '../src/lib/chatKeyboard';

describe('chatKeyboardAvoidingBehavior', () => {
  it('actively lifts the composer above Android and iOS keyboards', () => {
    expect(chatKeyboardAvoidingBehavior('android')).toBe('padding');
    expect(chatKeyboardAvoidingBehavior('ios')).toBe('padding');
  });

  it('does not add native keyboard padding on web', () => {
    expect(chatKeyboardAvoidingBehavior('web')).toBeUndefined();
  });
});
