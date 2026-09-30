# AutomatiQA Mobile Execution Agent

Companion agent script for AutomatiQA to bridge local Android SDK, ADB, Android Studio Emulators, and Appium with the AutomatiQA Web Application.

## Requirements

- Node.js (v18+)
- Android SDK & Platform Tools (`adb`, `emulator`, `aapt`)
- Appium (v2.x with `uiautomator2` driver)

## Quick Start Instructions

1. Open a Command Prompt / Terminal on your machine containing Android SDK.
2. Navigate to this directory:
   ```bash
   cd mobile-agent
   ```
3. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
4. Start the agent:
   ```bash
   npm start -- --user=your-email@example.com --server=https://your-automatiqa-app.run.app
   ```
   Or from the root directory of the repository:
   ```bash
   npm run agent
   ```

5. Go to AutomatiQA -> Mobile Testing and click **Check Agent Connection**.
