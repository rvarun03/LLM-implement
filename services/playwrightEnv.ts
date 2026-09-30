import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { chromium, type Browser } from 'playwright';

// Prefer browsers baked into node_modules. They ship with the app image, so they
// exist on every server instance — unlike a runtime download into /tmp, which is
// lost whenever the instance is replaced. Setting this before any Playwright call
// makes chromium.executablePath() resolve to that copy.
(() => {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return; // respect an explicit setting
  try {
    const local = path.join(process.cwd(), 'node_modules', 'playwright-core', '.local-browsers');
    if (fs.existsSync(local)) {
      const entries = fs.readdirSync(local).filter((f) => f !== '.' && f !== '..');
      if (entries.length > 0) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
        console.log('[Playwright Setup] Using browsers bundled in node_modules.');
      }
    }
  } catch {}
})();

/**
 * Configure Playwright browsers paths and symlinks for container runtime compatibility.
 * Ensures both /tmp/ms-playwright and /root/.cache/ms-playwright point to valid browser binaries.
 */
export function setupPlaywrightBrowsersPath(): void {
  // An explicitly configured browsers path ("0" = browsers installed inside node_modules,
  // which ships with the app image) is authoritative. Never override it with container
  // path guesses, otherwise a baked-in browser becomes invisible at runtime.
  if (process.env.PLAYWRIGHT_BROWSERS_PATH === '0') {
    return;
  }

  try {
    const msPath = '/ms-playwright';
    const tmpPath = '/tmp/ms-playwright';
    const rootCacheDir = '/root/.cache';
    const rootCache = '/root/.cache/ms-playwright';

    // Ensure /root/.cache directory exists
    if (!fs.existsSync(rootCacheDir)) {
      try {
        fs.mkdirSync(rootCacheDir, { recursive: true });
      } catch {}
    }

    // Check /ms-playwright (standard Docker container path)
    let msHasFiles = false;
    try {
      if (fs.existsSync(msPath)) {
        const entries = fs.readdirSync(msPath).filter((f) => f !== '.' && f !== '..');
        msHasFiles = entries.length > 0;
      }
    } catch {}

    // Check /tmp/ms-playwright
    let tmpHasFiles = false;
    try {
      if (fs.existsSync(tmpPath)) {
        const entries = fs.readdirSync(tmpPath).filter((f) => f !== '.' && f !== '..');
        tmpHasFiles = entries.length > 0;
      }
    } catch {}

    // Check /root/.cache/ms-playwright
    let rootHasFiles = false;
    try {
      if (fs.existsSync(rootCache)) {
        const entries = fs.readdirSync(rootCache).filter((f) => f !== '.' && f !== '..');
        rootHasFiles = entries.length > 0;
      }
    } catch {}

    if (msHasFiles) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = msPath;

      // Ensure symlinks from /tmp/ms-playwright and /root/.cache/ms-playwright to /ms-playwright
      try {
        if (!fs.existsSync(tmpPath)) {
          try { fs.symlinkSync(msPath, tmpPath, 'dir'); } catch {}
        }
        if (!fs.existsSync(rootCache)) {
          try { fs.symlinkSync(msPath, rootCache, 'dir'); } catch {}
        }
      } catch {}
    } else if (tmpHasFiles) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = tmpPath;

      // Ensure /root/.cache/ms-playwright points to /tmp/ms-playwright
      try {
        let isGoodSymlink = false;
        try {
          const stat = fs.lstatSync(rootCache);
          if (stat.isSymbolicLink()) {
            const target = fs.readlinkSync(rootCache);
            if (target === tmpPath && fs.existsSync(rootCache)) {
              isGoodSymlink = true;
            } else {
              // Broken or stale symlink - remove it
              fs.unlinkSync(rootCache);
            }
          } else if (stat.isDirectory()) {
            const entries = fs.readdirSync(rootCache);
            if (entries.length === 0) {
              fs.rmdirSync(rootCache);
            }
          }
        } catch (e: any) {
          if (e?.code !== 'ENOENT') {
            try { fs.rmSync(rootCache, { recursive: true, force: true }); } catch {}
          }
        }

        if (!isGoodSymlink && !fs.existsSync(rootCache)) {
          try {
            fs.symlinkSync(tmpPath, rootCache, 'dir');
          } catch {}
        }
      } catch {}
    } else if (rootHasFiles) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = rootCache;

      // Ensure /tmp/ms-playwright points to /root/.cache/ms-playwright
      try {
        let isGoodSymlink = false;
        try {
          const stat = fs.lstatSync(tmpPath);
          if (stat.isSymbolicLink()) {
            const target = fs.readlinkSync(tmpPath);
            if (target === rootCache && fs.existsSync(tmpPath)) {
              isGoodSymlink = true;
            } else {
              fs.unlinkSync(tmpPath);
            }
          } else if (stat.isDirectory()) {
            const entries = fs.readdirSync(tmpPath);
            if (entries.length === 0) {
              fs.rmdirSync(tmpPath);
            }
          }
        } catch (e: any) {
          if (e?.code !== 'ENOENT') {
            try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
          }
        }

        if (!isGoodSymlink && !fs.existsSync(tmpPath)) {
          try {
            fs.symlinkSync(rootCache, tmpPath, 'dir');
          } catch {}
        }
      } catch {}
    } else {
      // Default to /tmp/ms-playwright
      process.env.PLAYWRIGHT_BROWSERS_PATH = tmpPath;
    }
  } catch {
    // Suppress setup errors
  }
}

/**
 * Validates whether a file is an existing, executable binary file.
 */
function isValidBinary(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 10000) return false;
    try {
      fs.chmodSync(filePath, 0o777);
    } catch {}
    return true;
  } catch {
    return false;
  }
}

/**
 * Scans directories dynamically for Chromium browser binaries.
 * Prioritizes standard full Chrome/Chromium over headless shell.
 */
function scanForChromiumBinaries(): string[] {
  let homeCache = '';
  try {
    homeCache = path.join(os.homedir(), '.cache', 'ms-playwright');
  } catch {}

  let nodeModulesBrowsers = '';
  try {
    nodeModulesBrowsers = path.join(
      process.cwd(),
      'node_modules',
      'playwright-core',
      '.local-browsers'
    );
  } catch {}

  const searchDirs = [
    process.env.PLAYWRIGHT_BROWSERS_PATH === '0' ? '' : process.env.PLAYWRIGHT_BROWSERS_PATH,
    nodeModulesBrowsers,
    '/tmp/ms-playwright',
    '/root/.cache/ms-playwright',
    '/ms-playwright',
    '/root/.cache',
    '/var/cache',
    homeCache
  ].filter((d): d is string => Boolean(d && fs.existsSync(d)));

  const fullChromeBinaries: string[] = [];
  const headlessShellBinaries: string[] = [];

  for (const baseDir of searchDirs) {
    try {
      const entries = fs.readdirSync(baseDir);
      for (const entry of entries) {
        const sub = path.join(baseDir, entry);
        try {
          if (!fs.statSync(sub).isDirectory()) continue;
        } catch {
          continue;
        }

        // Check for full Chrome in chromium-* folders
        const chromeCandidates = [
          path.join(sub, 'chrome-linux64', 'chrome'),
          path.join(sub, 'chrome-linux', 'chrome'),
          path.join(sub, 'chrome-win', 'chrome.exe'),
          path.join(sub, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
          path.join(sub, 'chrome'),
          path.join(sub, 'chromium')
        ];
        for (const cand of chromeCandidates) {
          if (isValidBinary(cand) && !fullChromeBinaries.includes(cand)) {
            fullChromeBinaries.push(cand);
          }
        }

        // Check for headless shell as fallback
        const shellCandidates = [
          path.join(sub, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
          path.join(sub, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
          path.join(sub, 'chrome-headless-shell')
        ];
        for (const cand of shellCandidates) {
          if (isValidBinary(cand) && !headlessShellBinaries.includes(cand)) {
            headlessShellBinaries.push(cand);
          }
        }
      }
    } catch {}
  }

  // System binaries
  const systemCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/local/bin/chrome',
    '/usr/local/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  const systemBinaries = systemCandidates.filter(isValidBinary);

  // Return full chrome first, system binaries second, headless shell third
  return [...fullChromeBinaries, ...systemBinaries, ...headlessShellBinaries];
}

/**
 * Searches for any available Chromium or Chrome executable binary across standard locations.
 * Returns the best candidate binary path, or empty string if none found.
 */
export function findChromiumExecutable(): string {
  setupPlaywrightBrowsersPath();

  // 1. Playwright's own internal executablePath discovery
  try {
    const pwPath = chromium.executablePath();
    if (isValidBinary(pwPath)) {
      return pwPath;
    }
  } catch {}

  // 2. Scan for candidate binaries (full Chrome prioritized)
  const candidates = scanForChromiumBinaries();
  if (candidates.length > 0) {
    return candidates[0];
  }

  return '';
}

/**
 * Ensures Playwright browsers are installed and available, downloading/re-verifying them if needed.
 */
export function ensurePlaywrightReady(): string {
  setupPlaywrightBrowsersPath();

  let bin = findChromiumExecutable();
  if (bin) {
    return bin;
  }

  console.log('[Playwright Setup] Browser binary not found. Provisioning Chromium via Playwright...');
  try {
    const isNodeModulesMode = process.env.PLAYWRIGHT_BROWSERS_PATH === '0';
    if (!isNodeModulesMode && !fs.existsSync('/tmp/ms-playwright')) {
      fs.mkdirSync('/tmp/ms-playwright', { recursive: true });
    }
    // Set environment variable explicitly during install
    execSync('npx playwright install chromium', {
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 300000,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: isNodeModulesMode
          ? '0'
          : (process.env.PLAYWRIGHT_BROWSERS_PATH || '/tmp/ms-playwright')
      }
    });
    setupPlaywrightBrowsersPath();
    bin = findChromiumExecutable();
    if (bin) {
      console.log(`[Playwright Setup] Chromium successfully provisioned at: ${bin}`);
      return bin;
    }
  } catch (err: any) {
    console.warn('[Playwright Setup] Automatic download attempt encountered note:', err?.message || err);
    throw new Error(`Chromium provisioning failed: ${err?.message || String(err)}`);
  }

  return findChromiumExecutable();
}

/**
 * Checks whether the required Playwright Chromium browser is ready and available.
 */
export function isPlaywrightBrowserAvailable(): boolean {
  setupPlaywrightBrowsersPath();
  const bin = findChromiumExecutable();
  return Boolean(bin && fs.existsSync(bin));
}

/**
 * Robustly launches a Playwright Chromium browser instance, ensuring browser binaries
 * are detected, verified, or provisioned as needed before launch.
 * Applies container-safe flags and multi-strategy fallbacks.
 */
export async function launchPlaywrightBrowser(launchOptions: any = {}): Promise<Browser> {
  // Ensure paths, symlinks, and environment variables are properly initialized
  setupPlaywrightBrowsersPath();

  let lastLaunchError = '';
  let lastInstallError = '';

  // Container-critical launch arguments that must always be present
  const essentialContainerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-infobars',
    '--window-position=0,0',
    '--ignore-certificate-errors',
    '--ignore-certificate-errors-spki-list',
    '--disable-web-security',
    '--allow-running-insecure-content',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled'
  ];

  const userArgs: string[] = Array.isArray(launchOptions.args) ? launchOptions.args : [];
  const mergedArgs = Array.from(new Set([...essentialContainerArgs, ...userArgs]));

  const baseOptions = {
    headless: true,
    ...launchOptions,
    args: mergedArgs
  };

  // Pre-emptively detect or ensure Chromium binary exists before attempting launch
  let primaryExecutable = findChromiumExecutable();
  if (!primaryExecutable) {
    try {
      primaryExecutable = ensurePlaywrightReady();
    } catch (provErr: any) {
      lastInstallError = provErr?.message || String(provErr);
      primaryExecutable = '';
    }
  }

  // Collect all potential launch candidate paths in order of quality
  const allCandidates = scanForChromiumBinaries();
  if (primaryExecutable && !allCandidates.includes(primaryExecutable)) {
    allCandidates.unshift(primaryExecutable);
  }

  // Strategy 1: Launch with discovered binary candidates
  for (const executablePath of allCandidates) {
    try {
      return await chromium.launch({
        ...baseOptions,
        executablePath
      });
    } catch (execErr: any) {
      lastLaunchError = execErr?.message || String(execErr);
      console.log(`[Playwright Launch] Launch with ${executablePath} note: ${lastLaunchError}`);
    }
  }

  // Strategy 2: Launch using Playwright standard managed resolution (without explicit executablePath)
  try {
    return await chromium.launch(baseOptions);
  } catch (err: any) {
    lastLaunchError = err?.message || String(err);
    console.log(`[Playwright Launch] Standard launch note: ${lastLaunchError}`);
  }

  // Strategy 3: Try single-process mode (handles low-memory or process-limited container environments)
  const singleProcessOptions = {
    ...baseOptions,
    args: Array.from(new Set([...mergedArgs, '--single-process']))
  };

  for (const executablePath of allCandidates) {
    try {
      return await chromium.launch({
        ...singleProcessOptions,
        executablePath
      });
    } catch (spErr: any) {
      lastLaunchError = spErr?.message || String(spErr);
    }
  }

  try {
    return await chromium.launch(singleProcessOptions);
  } catch (spErr: any) {
    lastLaunchError = spErr?.message || String(spErr);
  }

  // Strategy 4: Final provisioning check & retry
  console.log('[Playwright Launch] All preliminary launch strategies exhausted. Provisioning check...');
  try {
    ensurePlaywrightReady();
  } catch (provErr: any) {
    lastInstallError = provErr?.message || String(provErr);
  }

  const refreshedCandidates = scanForChromiumBinaries();
  for (const freshBin of refreshedCandidates) {
    try {
      return await chromium.launch({
        ...baseOptions,
        executablePath: freshBin
      });
    } catch (freshErr: any) {
      lastLaunchError = freshErr?.message || String(freshErr);
    }
  }

  try {
    return await chromium.launch(baseOptions);
  } catch (finalErr: any) {
    lastLaunchError = finalErr?.message || String(finalErr);
  }

  // Final failure: report exactly what was found and what failed, so the cause is diagnosable
  const finalCandidates = scanForChromiumBinaries();
  let tmpWritable = false;
  try {
    fs.accessSync(os.tmpdir(), fs.constants.W_OK);
    tmpWritable = true;
  } catch {}

  const diagnostics = [
    `platform=${process.platform}`,
    `PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH ?? '(unset)'}`,
    `cwd=${process.cwd()}`,
    `tmp writable=${tmpWritable}`,
    `candidates found=${finalCandidates.length}`
  ].join(', ');

  if (finalCandidates.length > 0) {
    throw new Error(
      `Chromium binaries were found but every launch attempt failed. ` +
      `Tried: ${finalCandidates.join(', ')}. ` +
      `Last launch error: ${lastLaunchError || 'unknown'}. [${diagnostics}]`
    );
  }

  throw new Error(
    `No Chromium binary is present on the server and provisioning failed. ` +
    `Add "playwright install chromium" as a build step, or run it on the server. ` +
    `Install error: ${lastInstallError || 'none recorded'}. [${diagnostics}]`
  );
}

// Setup environment immediately on module load
setupPlaywrightBrowsersPath();
