import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

export interface KitConfigOptions {
  /** URL the app is served on. `E2E_BASE_URL` overrides it, e.g. to point a run at staging. */
  baseURL: string;
  /** Command that starts the app locally. Skipped when `E2E_BASE_URL` is set. */
  webServer?: { command: string; env?: Record<string, string>; timeout?: number };
  /**
   * Pinned so text and role locators don't change with the machine's language.
   * Multilingual apps should test other locales in dedicated projects.
   */
  locale?: string;
  timezoneId?: string;
  /** Service workers cache aggressively and make runs order-dependent. Block unless testing offline behaviour. */
  serviceWorkers?: 'allow' | 'block';
  /** Add a phone-sized project next to desktop Chromium. */
  mobile?: boolean;
  testDir?: string;
  /** Escape hatch for anything the kit doesn't model. Shallow-merged last. */
  overrides?: PlaywrightTestConfig;
}

export function defineKitConfig(options: KitConfigOptions): PlaywrightTestConfig {
  const ci = !!process.env.CI;
  const remote = process.env.E2E_BASE_URL;
  const baseURL = remote ?? options.baseURL;

  return defineConfig({
    testDir: options.testDir ?? './e2e/specs',
    fullyParallel: true,
    forbidOnly: ci,
    // One retry in CI only, and the report marks retried tests as flaky.
    // Retries exist to collect a trace, not to make a red build green.
    retries: ci ? 1 : 0,
    reporter: [
      [ci ? 'github' : 'list'],
      ['html', { open: 'never', outputFolder: 'playwright-report' }],
      // Machine-readable results: the healer agent reads this to find what failed.
      ['json', { outputFile: 'test-results/results.json' }],
    ],
    use: {
      baseURL,
      locale: options.locale ?? 'en-US',
      timezoneId: options.timezoneId ?? 'UTC',
      serviceWorkers: options.serviceWorkers ?? 'block',
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
    },
    projects: [
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      ...(options.mobile ? [{ name: 'mobile', use: { ...devices['Pixel 7'] } }] : []),
    ],
    webServer:
      options.webServer && !remote
        ? {
            command: options.webServer.command,
            url: baseURL,
            env: options.webServer.env,
            timeout: options.webServer.timeout ?? 60_000,
            reuseExistingServer: !ci,
          }
        : undefined,
    ...options.overrides,
  });
}
