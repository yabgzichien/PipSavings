import fs from 'fs';
import path from 'path';

/**
 * Regression Guard: Ensure Android never uses `behavior="height"` on KeyboardAvoidingView.
 *
 * Background:
 * On Android, the app runs with `android:windowSoftInputMode="adjustResize"`, and React Native
 * sets Modal Dialog windows to `SOFT_INPUT_ADJUST_RESIZE`. This means Android OS natively resizes
 * the window when the soft keyboard is displayed or hidden.
 *
 * When `KeyboardAvoidingView` with `behavior="height"` is used on Android:
 * 1. Android's `keyboardDidHide` event reports visible display frame height (which excludes the
 *    ~72px navigation/gesture bar).
 * 2. `_relativeKeyboardHeight()` computes a 72px offset even when the keyboard is completely hidden.
 * 3. Setting this height triggers an Android layout pass, which calculates 0, which triggers another
 *    layout pass calculating 72px, causing an infinite 40-60 FPS flickering/vibration loop
 *    (as captured in pipbug.mp4 and pipbug2.mp4).
 *
 * To avoid this permanently, Android must always have `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`
 * and/or `enabled={Platform.OS === 'ios'}`.
 */
describe('KeyboardAvoidingView Android Behavior Guard', () => {
  const srcDir = path.resolve(__dirname, '../src');

  function collectSourceFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectSourceFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const files = collectSourceFiles(srcDir);

  test('no source file under src/ uses behavior="height" or : "height" on KeyboardAvoidingView', () => {
    const violations: { file: string; line: number; content: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes('KeyboardAvoidingView')) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check for 'height' as a behavior option
        if (
          (line.includes("behavior='height'") ||
            line.includes('behavior="height"') ||
            line.includes(": 'height'") ||
            line.includes(': "height"')) &&
          !line.trim().startsWith('//') &&
          !line.trim().startsWith('*')
        ) {
          violations.push({
            file: path.relative(path.resolve(__dirname, '..'), file),
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('every KeyboardAvoidingView in src/ disables active height-avoidance on Android', () => {
    const invalidUsages: { file: string; line: number; snippet: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes('<KeyboardAvoidingView')) continue;

      // Extract each <KeyboardAvoidingView ...> opening tag
      const tagRegex = /<KeyboardAvoidingView\b([^>]*?)>/gs;
      let match: RegExpExecArray | null;

      while ((match = tagRegex.exec(content)) !== null) {
        const tagAttributes = match[1];
        const line = content.substring(0, match.index).split('\n').length;

        // If behavior is set, ensure it doesn't resolve to 'height' on Android
        if (tagAttributes.includes('behavior=')) {
          const hasHeightOnAndroid =
            tagAttributes.includes(": 'height'") ||
            tagAttributes.includes(': "height"') ||
            tagAttributes.includes('behavior="height"') ||
            tagAttributes.includes("behavior='height'");

          if (hasHeightOnAndroid) {
            invalidUsages.push({
              file: path.relative(path.resolve(__dirname, '..'), file),
              line,
              snippet: match[0].replace(/\s+/g, ' '),
            });
          }
        }
      }
    }

    expect(invalidUsages).toEqual([]);
  });

  test('Expo explicitly configures Android to resize content around the software keyboard', () => {
    const appConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app.json'), 'utf-8'));
    expect(appConfig.expo.android.softwareKeyboardLayoutMode).toBe('resize');
  });
});
