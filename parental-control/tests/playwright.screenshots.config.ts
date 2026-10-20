import { defineConfig, devices } from '@playwright/test';

const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

// Visual review only: captures land in test-results/screenshots. Not part of `npm test`.
export default defineConfig({
    testDir: './specs',
    testMatch: '**/screenshots.spec.ts',
    reporter: 'list',
    use: { viewport: { width: 1280, height: 900 } },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } }]
});
