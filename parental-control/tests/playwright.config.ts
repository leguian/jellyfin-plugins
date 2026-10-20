import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM: path of a Chromium to use instead of the one Playwright downloads (offline machines).
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

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
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } }]
});
