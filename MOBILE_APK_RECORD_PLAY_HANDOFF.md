# Mobile APK & Web Record & Play Handoff Documentation

## 1. Overview
The **Record & Play** and **Mobile Testing** modules in AutomatiQA provide comprehensive end-to-end recording, element inspection, locator detection, step sequence playback, and multi-framework code generation for both Web and Mobile (Android APK / iOS) applications.

This handoff documents the modularized structure, event capture hooks, step synchronization, locator geometry calculation, and execution playback pipeline.

---

## 2. Directory Structure & Key Files

### Hooks & State Management
- `hooks/useMobileRecorderState.ts`: Manages live recording state (`isRecording`, `isPaused`, `isPlayingBack`), active step sequence, active device connection, selected application definition, action history, and undo/redo stacks.
- `hooks/useMobileRecordingSync.ts`: Synchronizes live steps across local state, browser `localStorage`, WebSocket stream (`/mobile-agent`), and Firestore database project backups.
- `hooks/useMobileStepCapture.ts`: Intercepts gestures (tap, double-tap, long-press, swipe, scroll, text fill, keypress, back/home buttons, app launch) from screen inspection surfaces and formats them into structured `RecordedStep` objects.

### Utilities & Services
- `utils/mobileRecordingSteps.ts`: Helper functions to format, validate, optimize, and convert mobile steps to Appium / Playwright / UiAutomator / XCUITest code.
- `services/mobileRecordingService.ts`: Core service layer managing mobile recording sessions, screenshot capture, ADB/Appium device bridge calls, and test flow persistence.
- `components/locatorGeometry.ts`: Geometric calculations for element bounding boxes, coordinate scaling, XPath generation, and accessibility ID fallback hierarchies.

### Components
- `components/RecordAndPlay.tsx`: Primary Record & Play view with tabbed Web/Mobile interfaces, live canvas inspector, step editor, playback status, and script generator.
- `components/MobileTesting.tsx`: Full Mobile Testing hub with ADB/Appium device selection, APK uploader, live screen stream, interactive inspector, and test case export.
- `components/MobileRecordingInspector.tsx`: Real-time screen inspector overlay with target highlighting, locator details panel, gesture triggers, and touch ripple effects.
- `components/MobilePlaybackEmulator.tsx`: Playback execution view running recorded steps against simulated or connected mobile devices.

### Test Suites
- `tests/mobile-input-flow.test.mjs`: Test suite covering mobile input event parsing, step sequence building, gesture coordinate mapping, and step serialization.
- `tests/locator-engine.test.mjs`: Test suite covering locator strategy priorities (resource-id > content-desc > accessibility-id > text > xpath).

---

## 3. Supported Mobile Actions & Gestures

| Action | Description | Locators / Attributes Captured |
| :--- | :--- | :--- |
| `click` / `tap` | Single touch tap on an element | `resourceId`, `accessibilityId`, `contentDescription`, `xpath`, `coordinates`, `targetBox` |
| `dblclick` / `double_tap` | Double tap gesture | Same as tap |
| `long_press` | Touch and hold gesture (500ms+) | Same as tap |
| `swipe` / `scroll` | Directional swipe (up, down, left, right) | `deltaX`, `deltaY`, `coordinates`, `direction` |
| `type` / `fill` | Text input into input fields | Target element locators + `value` string |
| `press` | Hardware button press (Back, Home, Enter) | `keyCombo` ('BACK', 'HOME', 'ENTER') |
| `assertion` | Assert element visibility, text, or state | Target element + expected `value` / `condition` |
| `wait` | Pause execution for specified duration | `durationMs` / `value` |

---

## 4. Multi-Framework Export Capabilities

Recorded flows can be exported immediately to:
- **Appium (TypeScript / JavaScript)**
- **Appium (Python - PyTest)**
- **Appium (Java - TestNG / JUnit)**
- **Appium (C# - NUnit)**
- **Playwright Android (TypeScript)**
- **UiAutomator2 (Kotlin / Java)**

---

## 5. Security & Isolation

- All mobile recording components and state hooks operate safely within client and server bounds without modifying standard web test flows or other project modules.
- Non-interfering sync strategies ensure offline availability with fallback to local storage if WebSocket server or Firestore is unavailable.
