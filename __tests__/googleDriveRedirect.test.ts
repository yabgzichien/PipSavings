import fs from 'fs';
import path from 'path';
import { GOOGLE_DRIVE_REDIRECT_URI, GOOGLE_DRIVE_SCOPES } from '../src/lib/cloudBackup/googleAuth';
import appJson from '../app.json';

// Google rejects the authorization request outright (redirect_uri_mismatch) unless an Android
// OAuth client's redirect uses the app's package name as its scheme. The scheme also has to be
// registered in `expo.scheme` or Android has no intent filter to route the redirect back with.
describe('Google Drive OAuth redirect', () => {
  const pkg = appJson.expo.android.package;

  it('uses the Android package name as its custom scheme', () => {
    expect(GOOGLE_DRIVE_REDIRECT_URI).toBe(`${pkg}:/oauth2redirect`);
  });

  it('registers that scheme in app.json so the redirect can reach the app', () => {
    const schemes = appJson.expo.scheme;
    expect(Array.isArray(schemes) ? schemes : [schemes]).toContain(pkg);
  });

  // android/ is gitignored and hand-maintained, so app.json can silently drift from the package
  // actually shipped to Play. Only assert when the folder is present (CI checkouts lack it).
  it('matches the applicationId actually built into the APK', () => {
    const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
    if (!fs.existsSync(gradlePath)) return;
    const applicationId = /applicationId ['"]([^'"]+)['"]/.exec(fs.readFileSync(gradlePath, 'utf8'))?.[1];
    expect(applicationId).toBe(pkg);
  });

  it('asks only for the hidden app-data folder, never the user visible Drive', () => {
    expect(GOOGLE_DRIVE_SCOPES).toContain('https://www.googleapis.com/auth/drive.appdata');
    expect(GOOGLE_DRIVE_SCOPES.some((s) => s === 'https://www.googleapis.com/auth/drive')).toBe(false);
  });

  it('tells the builder to register a Web OAuth client and the Play App Signing SHA-1', () => {
    const example = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
    expect(example).toMatch(/Web application/i);
    expect(example).toMatch(/App signing key/i);
    expect(example).toMatch(/webClientId/);
  });
});
