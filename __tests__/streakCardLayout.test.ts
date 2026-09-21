import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dashboardSource = readFileSync(resolve(__dirname, '../src/screens/DashboardScreen.tsx'), 'utf8');

describe('dashboard streak week alignment', () => {
  it('uses matching seven-cell grids for weekday letters and activity dots', () => {
    expect(dashboardSource).toMatch(/<View\s+key=\{i\}\s+style=\{styles\.dotCell\}\s*>/);
    expect(dashboardSource).toContain('dotCell: { flex: 1, alignItems: \'center\', justifyContent: \'center\' }');
  });
});
