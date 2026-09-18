import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './specs',
    testIgnore: '**/screenshots.spec.ts',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        viewport: { width: 1280, height: 900 },
        trace: 'retain-on-failure'
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
