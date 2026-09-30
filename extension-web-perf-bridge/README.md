# AutomatiQA Web Performance Agent Bridge (Chrome Extension)

A dedicated, lightweight Chrome/Chromium extension that connects the **Google AI Studio Web Performance Testing UI** to your local **AutomatiQA Recording Agent** (`wss://localhost:9334`).

## Architecture

```
Google AI Studio Web Performance UI
        ↓ (window.postMessage: namespace 'automatiqa-web-performance')
AutomatiQA Web Performance Agent Bridge (Content Script & Background Service Worker)
        ↓ (wss://localhost:9334)
Existing AutomatiQA Local Recording Agent (Playwright / Chromium Engine)
```

---

## How to Load as an Unpacked Extension in Chrome

1. Open Google Chrome or any Chromium-based browser (Brave, Edge, Opera).
2. Navigate to: `chrome://extensions`
3. In the top-right corner of the Extensions page, enable **"Developer mode"** (toggle switch).
4. Click the **"Load unpacked"** button in the top-left corner.
5. Select the `extension-web-perf-bridge` folder (or unzip `automatiqa-web-perf-bridge.zip` and select that folder).
6. The extension **"AutomatiQA Web Performance Agent Bridge"** will now appear in your active extensions list!

---

## How to Test

1. Start your local AutomatiQA Recording Agent (`node automatiqa-agent.cjs` or `./start-agent.bat` / `./start-agent.command`).
2. Open the **Web Performance Testing** page in AutomatiQA / Google AI Studio.
3. The page will immediately detect the bridge extension and show:
   - **Bridge Extension**: `Active (v1.0.0)`
   - **Local Agent**: `Connected (wss://localhost:9334)`
4. Enter any target website URL (e.g., `https://adactinhotelapp.com` or your test website) and click **Start Record**.
5. Perform your user workflow (Login → Search → Select Hotel → Book → Payment).
6. Click **Stop Record** to review the automatically detected scenarios and generate the JMeter `.jmx` test plan.
