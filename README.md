# AutomatiQA — Enterprise AI-Powered QA & Test Automation Platform

AutomatiQA is an enterprise-grade, full-stack Quality Assurance and Test Automation platform. Powered by Google Gemini AI, Anthropic Claude, and Playwright, AutomatiQA unifies the entire testing lifecycle into a single operational interface: from requirements parsing, AI user stories, test scenarios, and keyframe-driven test cases, to multi-framework script generation, live web/mobile recording and playback, API testing, performance auditing, and enterprise tool synchronization (Jira, GitHub, Slack).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Feature Catalog & Module Guide](#2-feature-catalog--module-guide)
   - [2.1 Dashboard & Project Management](#21-dashboard--project-management)
   - [2.2 RAG Vector Search & Feasibility Engine](#22-rag-vector-search--feasibility-engine)
   - [2.3 AI User Story Generator](#23-ai-user-story-generator)
   - [2.4 AI Test Scenarios](#24-ai-test-scenarios)
   - [2.5 AI Test Cases & Large Document Decomposition](#25-ai-test-cases--large-document-decomposition)
   - [2.6 Functional / Manual Test Case Manager](#26-functional--manual-test-case-manager)
   - [2.7 Automation Script Generator](#27-automation-script-generator)
   - [2.8 Web & Mobile Record and Play](#28-web--mobile-record-and-play)
   - [2.9 Mobile Testing & Device Agent](#29-mobile-testing--device-agent)
   - [2.10 API Testing](#210-api-testing)
   - [2.11 Performance API Testing](#211-performance-api-testing)
   - [2.12 Web Performance Testing (Lighthouse Core Web Vitals)](#212-web-performance-testing-lighthouse-core-web-vitals)
   - [2.13 Functional Performance Testing](#213-functional-performance-testing)
   - [2.14 Apache JMeter Load Testing Integration](#214-apache-jmeter-load-testing-integration)
   - [2.15 UI Testing & Visual Regression](#215-ui-testing--visual-regression)
   - [2.16 Execution Hub](#216-execution-hub)
   - [2.17 Reports & Analytics](#217-reports--analytics)
   - [2.18 Access Control & User Management](#218-access-control--user-management)
   - [2.19 QA Copilot](#219-qa-copilot)
   - [2.20 Browser Extensions](#220-browser-extensions)
3. [Credit Consumption & Plan Management](#3-credit-consumption--plan-management)
4. [Role-Based Access Control (RBAC)](#4-role-based-access-control-rbac)
5. [Database Architecture & Persistence Strategy](#5-database-architecture--persistence-strategy)
6. [Enterprise Integrations (Jira, GitHub, Slack)](#6-enterprise-integrations)
7. [Environment Configuration & Setup](#7-environment-configuration--setup)
8. [API Reference](#8-api-reference)
9. [Deployment & Containerization (Docker & Cloud Run)](#9-deployment--containerization)
10. [Logging, Telemetry & Observability](#10-logging-telemetry--observability)
11. [Testing & Quality Assurance](#11-testing--quality-assurance)
12. [Troubleshooting & FAQs](#12-troubleshooting--faqs)

---

## 1. Architecture Overview

```
                          ┌────────────────────────────────────────────────────────┐
                          │                 AutomatiQA Web Client                  │
                          │        React 19 + TypeScript + Tailwind CSS v4         │
                          │   Sonner Toasts + Recharts + Lucide + Lucide Icons     │
                          └─────────────────────────┬──────────────────────────────┘
                                                    │ HTTP / WebSocket / Socket.IO
                                                    ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           AutomatiQA Backend Server                               │
│                         Node.js (v22) + Express v5.2.1                            │
├─────────────────────────┬───────────────────────────────┬─────────────────────────┤
│    AI & Intelligence    │     Automation & Engines      │     Data & Storage      │
│  • Google Gemini SDK    │  • Playwright v1.59.1 Engine  │  • Firebase Firestore   │
│  • Central Rate Limiter │  • Chrome Headless / Launcher │  • Firebase Admin SDK   │
│  • Multi-Tier Cache     │  • Mobile ADB / Appium Bridge │  • Local JSON Backups   │
│  • Anthropic Claude SDK │  • Lighthouse Audit Engine    │  • Disk Artifact Store  │
│  • RAG Vector Search    │  • JMeter Engine (JMX Gen)    │  • Encryption Service   │
└─────────────────────────┴───────────────────────────────┴─────────────────────────┘
        │                            │                                 │
        ▼                            ▼                                 ▼
┌──────────────┐             ┌──────────────┐                 ┌─────────────────┐
│ Local Agent  │             │ Chrome Exts  │                 │ External APIs   │
│ (Win/Mac/Lnx)│             │ (QA Recorder/│                 │ • Jira Cloud    │
│  ADB/Appium  │             │  Perf Bridge)│                 │ • GitHub API    │
└──────────────┘             └──────────────┘                 │ • Slack Webhook │
                                                              └─────────────────┘
```

### Core Technologies
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Motion (`motion/react`), Sonner, Recharts, Lucide React icons.
- **Backend**: Node.js 22 LTS, Express 5.2.1, TypeScript (`tsx` execution in dev, bundled with `esbuild` for production).
- **Automation Engines**: Playwright 1.59.1, Chrome Launcher, Lighthouse 13.4.1, custom Apache JMeter JMX generator.
- **AI Models**: Google Gemini 2.5/Flash (`@google/genai`), Anthropic Claude 3.5 Sonnet (`@anthropic-ai/sdk`), text embedding model for RAG.
- **Storage & Databases**: Google Cloud Firestore (primary), Firebase Admin SDK, dual-mode local disk backup (`/data/project_backups/`), artifact media store (`/data/artifacts/`).
- **Networking**: REST API, WebSockets (`ws`), Socket.IO (`socket.io`), reverse proxy streaming.

---

## 2. Feature Catalog & Module Guide

### 2.1 Dashboard & Project Management
- **Central Overview**: Live status cards tracking total projects, test scenarios, automated test cases, active scripts, and overall pass/fail execution metrics.
- **Project Switching**: Global project switcher located in the sidebar navigation with project-specific state scoping.
- **Project CRUD & Metadata**: Create, rename, clone, archive, and manage projects with custom environment URLs, staging endpoints, and team assignments.
- **Automated Backup & Replication**: Instant and scheduled project state serialization to `/data/project_backups/<projectId>.json`.

### 2.2 RAG Vector Search & Feasibility Engine
- **Semantic Test Knowledge Base**: Indexes past test cases, requirements, defect history, and architectural specifications.
- **Feasibility Checker**: Uses vector embeddings to evaluate whether a new user story or feature specification has sufficient testability, unambiguous acceptance criteria, and technical feasibility.
- **Cross-Project Similarity**: Identifies duplicate test cases or reusable automation steps across distinct projects.

### 2.3 AI User Story Generator
- **Multi-Source Ingestion**: Generates structured User Stories from BRDs, PDF/Word documents, text prompts, API specifications, or Figma designs.
- **Format Standardization**: Produces standard Agile user stories (`As a... I want to... So that...`) with formal Gherkin acceptance criteria (`Given... When... Then...`).
- **Jira Export**: Push single or batch stories directly to Jira projects with sprint, epic, and label assignment.

### 2.4 AI Test Scenarios
- **Scenario Synthesis**: Decomposes user stories or technical specifications into comprehensive sets of Functional and Non-Functional test scenarios.
- **Categorization**: Groups scenarios by modules, features, risk rating, and execution priority (High, Medium, Low).
- **Traceability**: Direct linking between User Story IDs, Scenario IDs (`TS-001`), and downstream Test Case IDs (`TC-001`).

### 2.5 AI Test Cases & Large Document Decomposition
- **Step-by-Step Test Generation**: Detailed preconditions, test data sets, atomic procedural steps, and post-conditions with full BDD/Gherkin coverage.
- **Dual-Engine Synthesis Architecture**:
  - **High-Capacity Server Job Engine**: Asynchronously uploads, chunks, and processes large documents on the server with real-time polling updates.
  - **Direct AI Synthesis Fallback**: Automatically extracts text snippets upon upload across all formats (.docx, .pdf, .xlsx, .txt, etc.) and provides instant fallback synthesis through the central Gemini proxy if server background processing encounters timeouts or credit sync delays, ensuring users never face blocked workflows.
- **Resilient Multi-Format Document Parsing Engine (`services/largeFileTestCaseService.ts`)**:
  - Supports `.docx`, `.doc`, `.pdf`, `.xlsx`, `.xls`, `.csv`, `.tsv`, `.txt`, `.md`, `.json`, and `.log` formats up to 150 MB.
  - **ESM-Native Execution**: Eliminates dynamic CommonJS `require()` calls to ensure native compatibility across Node.js 22 ESM runtimes and `esbuild` production bundles.
  - **Word Processing (.docx / .doc)**: Extracts clean raw text via `mammoth.extractRawText` (supporting both disk path and in-memory buffer reads) with automated fallback to `JSZip` for direct `word/document.xml` text parsing when encountering specialized document formats.
  - **PDF Processing (.pdf)**: Hybrid compatibility layer supporting both class-instantiated `PDFParse` (`new PDFParse({ data: buffer }).getText()`) and legacy callable function signatures, with automatic parser instance cleanup (`destroy()`).
  - **Spreadsheet Processing (.xlsx / .xls / .csv)**: Multi-sheet extraction converting each sheet into CSV formatted blocks (`xlsx.utils.sheet_to_csv`) with sheet header delimiters.
  - **Context-Aware Semantic Chunking**: Decomposes large requirements into token-safe chunks (~10,000 characters with 800-character overlap) preserving section headers, User Story IDs, and test directives.
  - **Idempotent Job Lifecycle**: Dispatches background jobs (`/api/ai/testcases/start-job`) tracked via Firestore and disk-backed store (`/data/ai_testcase_jobs.json`), supporting live status polling (`/api/ai/testcases/job-status/:jobId`), error recovery, and resumable execution.
- **Keyframe Video Walkthrough Decomposition**: Accepts uploaded screen walkthrough videos (`.mp4`, `.webm`), extracts keyframes at state transitions, and creates visual test steps mapped to specific video timestamps.

### 2.6 Functional / Manual Test Case Manager
- **Hierarchical Folders**: Organize test cases into multi-level folders (e.g., Regression, Smoke, Sanity, Module-specific).
- **Execution Tracking**: Manual execution state machine: `PASS`, `FAIL`, `BLOCKED`, `DEFERRED`, `NOT EXECUTED`.
- **Evidence Management**: Attach screenshots, video clips, reproduction links, and tester commentary directly to individual step executions.
- **Batch Runs**: Execute entire folders in sequential runs with aggregated pass/fail reporting.

### 2.7 Automation Script Generator
- **Multi-Framework Output**: Generates production-ready Page Object Model (POM) scripts in:
  - Playwright (TypeScript / JavaScript / Python / Java / C#)
  - Selenium WebDriver (Java / Python / C#)
  - Cypress (TypeScript / JavaScript)
- **Script Append & Incremental Extension**:
  - Appends new test methods, steps, and Page Object locators directly into an existing automation script without overwriting previously generated code.
  - Integrates modal scenario selector (`appendModalScript`), AI code synthesis with AST-aware method merging, duplicate locator deduplication, and credit validation.
- **Robust Locators**: Employs priority locator selection (`data-testid` > `id` > accessibility label > structured CSS > normalized XPath).
- **GitHub Push Integration**: Direct commit and push of generated test suites to configured GitHub repositories and branches.

### 2.8 Web & Mobile Record and Play
- **Live In-Browser Recording**: Records browser clicks, input typing, select options, hover actions, and URL navigations.
- **Visual Target Highlighting**: Real-time DOM element bounding box highlighting and locator geometry calculation (`locatorGeometry.ts`).
- **Headless & Headed Playback**: Executes recorded step sequences inside a server-side Playwright Chromium instance with live screenshot feedback and pass/fail step verification.

### 2.9 Mobile Testing & Device Agent
- **Physical Devices & Emulators**: Mirror real Android/iOS devices or emulators directly in the browser.
- **Local Agent Integration (`mobile-agent/` & `automatiqa-agent.js`)**:
  - Connects to local machine via ADB (Android Debug Bridge) or Appium.
  - Streams low-latency screen frames (`/api/device-agent/live-frame`).
  - Transmits touch events: tap, double-tap, long-press, swipe, drag, text fill, hardware keys (Back, Home).
- **APK Management**: Upload Android `.apk` files, auto-extract package metadata (`appPackage`, `appActivity`), install to target devices, and launch test sessions.
- **Appium Code Generation**: Converts mobile recorded sessions into Appium scripts (TypeScript, Python, Java, C#).

### 2.10 API Testing
- **REST Request Builder**: Complete HTTP client supporting `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`.
- **Headers, Auth & Body**: Bearer tokens, Basic Auth, API keys, JSON body editor, query parameters.
- **cURL & OpenAPI Import**: Paste raw cURL commands or Swagger/OpenAPI schemas to auto-generate request suites.
- **Assertion Engine**: Status code checks, response time limits, JSON schema validation, and header assertions.

### 2.11 Performance API Testing
- **Latency & Concurrency Benchmarking**: Multi-iteration concurrent request execution.
- **Metric Collection**: Minimum, Maximum, Average, Median, and 95th percentile response times.
- **Failure Analysis**: Error rate percentages, timeout breakdowns, and throughput (requests/second).

### 2.12 Web Performance Testing (Lighthouse Core Web Vitals)
- **Automated Audit Engine**: Powered by Google Lighthouse 13.4.1.
- **Core Web Vitals**: Measures First Contentful Paint (FCP), Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), Total Blocking Time (TBT), and Speed Index.
- **Performance Diagnostics**: Identifies render-blocking resources, unoptimized images, excessive DOM size, and cache policy issues.

### 2.13 Functional Performance Testing
- **User Journey Stress Testing**: Executes multi-step end-to-end user workflows while applying CPU throttling and network constraints (Fast 3G, Slow 3G, Offline).
- **Step-by-Step Latency Profiling**: Measures individual transition times between navigation events.

### 2.14 Apache JMeter Load Testing Integration
- **Automated JMX Generator**: Converts API collections into sanitized Apache JMeter test plan XML files (`.jmx`) with Thread Groups, HTTP Samplers, Response Assertions, and Summary Listeners.
- **Server-Side Load Execution**: Runs JMeter test suites, captures execution logs, and displays real-time throughput and error curves.

### 2.15 UI Testing & Visual Regression
- **Figma Design-to-Code Comparison**: Ingests Figma design URLs/images and compares them against live application screenshots using AI computer vision.
- **Visual Diff Highlighting**: Identifies color mismatches, font discrepancies, misaligned containers, padding errors, and missing elements.
- **WCAG Accessibility Audit**: Evaluates contrast ratios, ARIA label completeness, heading hierarchies, and keyboard navigability.

### 2.16 Execution Hub
- **Unified Test Runner**: Central cockpit for executing Test Cases, Automation Scripts, API Suites, and Performance Tests.
- **Evidence Management**: Upload screenshots, screen recordings, logs, and comments per executed test item.
- **Direct Jira Bug Logging**: Convert failed executions into Jira defect tickets with attached evidence and environment details with one click.

### 2.17 Reports & Analytics
- **Project Health Metrics**: Visual breakdown of total test cases, execution passes, failures, blockages, and execution velocity.
- **Quality Trends**: Historical tracking of pass rates over time across sprints.
- **Export Capabilities**: Export test reports and execution logs to PDF (`jspdf`), Excel (`exceljs`), and CSV formats.

### 2.18 Access Control & User Management
- **Role-Based Permissions**: Granular authorization across five distinct enterprise roles.
- **Project Membership**: Assign and restrict users to specific client projects.
- **Audit Logging**: Comprehensive logging of user activities, project edits, script executions, and administrative changes (`activityService.ts`).

### 2.19 QA Copilot
- **Context-Aware AI Assistant**: Floating AI assistant available on every screen.
- **Domain Knowledge Grounding**: Pre-loaded with QA methodologies, test case standards, Playwright best practices, and active project state.
- **In-App Navigation**: Can guide users directly to specific features or execute common configuration tasks upon conversational request.

### 2.20 Browser Extensions
- **QA Recorder Extension (`/extension/`)**: Chrome Extension that injects recording scripts directly into external target web pages and streams DOM events back to AutomatiQA.
- **Web Performance Bridge Extension (`/extension-web-perf-bridge/`)**: Chrome Extension for capturing deep browser performance timing metrics, resource watermarking, and network waterfall logs.

---

## 3. Credit Consumption & Plan Management

AutomatiQA employs a centralized, project-level credit accounting engine (`creditConfig.ts` & `creditService.ts`) to manage AI consumption, prevent runaway API costs, and govern user actions.

### 3.1 Plan Tiers & Quotas
| Plan Type | Total Credits | Validity Period | Description |
| :--- | :---: | :---: | :--- |
| **Trial Plan** | **200** | 7 Days | Default plan assigned to all newly provisioned projects. |
| **Paid Plan** | **1,000** | 30 Days | Full-featured enterprise plan with extended credit allocation and monthly renewal. |

### 3.2 Granular Module Credit Rates
Every user action is categorized into **Analysis** (AI generation/execution), **Copy** (clipboard actions), or **Download** (file/code export):

| # | Module / Feature | Trial Analysis | Trial Copy | Trial Download | Paid Analysis | Paid Copy | Paid Download |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | **AI User Stories Generation** | 5 | 10 | 10 | 5 | 10 | 10 |
| 2 | **AI Test Scenario Generation** | 10 | 20 | 20 | 10 | 20 | 20 |
| 3 | **AI Test Cases Generation** | 20 | 20 | 20 | 20 | 20 | 20 |
| 4 | **Automation — Script Generator** | 50 | 50 | 50 | 50 | 50 | 50 |
| 5 | **Automation — Record & Play (Web)** | 50 | 50 | 50 | 50 | 50 | 50 |
| 6 | **Automation — Record & Play (Mobile)** | 100 | 50 | 50 | 100 | 50 | 50 |
| 7 | **UI Testing** | 50 | 50 | 50 | 50 | 50 | 50 |
| 8 | **API Testing** | 50 | 50 | 50 | 50 | 50 | 50 |
| 9 | **API Performance Testing** | 100 | 50 | 50 | 100 | 50 | 50 |
| 10 | **Web Performance Testing** | 100 | 50 | 50 | 100 | 50 | 50 |

### 3.3 Credit Safeguards & Subscription Workflow
- **Pre-Check Enforcement**: Before triggering any AI generation or file export, the frontend checks `/api/credits/check-permission`. If remaining credits are insufficient, the operation is blocked with an informative alert.
- **Deduction Ledger**: Every credit usage is logged with timestamp, user email, module key, action type, and before/after balances (`/api/credits/consumption-records`).
- **Subscription Request & Approval**:
  - Project managers or team members can submit an upgrade/renewal request (`/api/credits/project-plan/:id/request-subscription`).
  - Super Admins review and approve/reject requests via `/api/credits/project-plan/:id/approve-subscription` or the **Credits Consumption** management tab.
- **Credit Alert Banner**: Persistent header indicator showing real-time balance, consumption percentage, and status alerts (e.g., Warning at <20% credits, Critical at 0 credits).

---

## 4. Role-Based Access Control (RBAC)

User authorization is governed by 5 hierarchical roles defined in `types.ts`:

| Role | Scope & Permissions |
| :--- | :--- |
| **Super Admin** | Unrestricted global access across all projects. Full administrative control over user roles, credit allocations, subscription approvals, RAG vector search, JMeter testing, functional performance workflows, and system settings. |
| **Admin** | Manages user access, project assignments, and credit balances across assigned projects. Can view reports, approve subscriptions, and configure integrations. |
| **Delivery Manager** | Oversees test strategy and delivery metrics. Has project-level management permissions, execution reporting, Jira/GitHub integrations, and test suite approvals. |
| **Spoc (Single Point of Contact)** | Project lead managing test cases, scenarios, execution runs, and defect workflows for assigned client projects. |
| **Team Member** | QA Engineer executing manual/automated tests, creating scenarios, recording flows, and logging defects. Restricted from billing and user administration. |

---

## 5. Database Architecture & Persistence Strategy

AutomatiQA implements a dual-tier storage strategy designed for zero data loss, offline availability, and high enterprise resilience:

### 5.1 Primary Cloud Database: Google Cloud Firestore
- **Database ID**: Configured in `firebase-applet-config.json` (e.g., `ai-studio-880ad9a9-93f0-4629-a7b4-349061b6ea24`).
- **Key Collections**:
  - `projects/{projectId}`: Core project configuration, folders, scenarios, test cases, scripts, and suites.
  - `users/{email}`: User accounts, roles, assigned projects, and creation metadata.
  - `project_plans/{projectId}`: Project credit balances, active plans (Trial/Paid), validity dates, and usage counters.
  - `subscription_requests/{requestId}`: Plan upgrade requests, approval status, and reviewer notes.
  - `token_consumption_logs/{logId}`: Audit log of credit expenditures.
  - `notifications/{notificationId}`: In-app user notifications and system alerts.
  - `activities/{activityId}`: User activity stream.

### 5.2 Local Storage & Backup Fallback Engine
- If Firestore is offline or throttled by quota limits, the system triggers graceful local fallback (`firestoreSync.ts`, `storageBackupService.ts`):
  - In-memory & browser `localStorage` caching ensures uninterrupted UI operation.
  - Periodic and on-demand JSON backups are written to `/data/project_backups/<projectId>.json`.
  - Server background replication engine (`backupReplicationService.ts`) reconciles local state with cloud storage upon reconnection.

### 5.3 Local Disk Artifact Store
- Large binary artifacts (e.g., uploaded videos, screen walkthroughs, APK files, and failure screenshots) are preserved on disk at `/data/artifacts/` and `/data/uploads/` to prevent Firestore 1MB document size limit exhaustion.

---

## 6. Enterprise Integrations

### 6.1 Atlassian Jira Cloud & Server
- **Authentication**: Supports Jira Cloud API Tokens (`email:apiToken`) or Server/Data Center Bearer Tokens with encrypted credential storage (`encryptionService.ts`).
- **Capabilities**:
  - Fetch user stories from Jira backlogs into AutomatiQA.
  - Export AI-generated user stories to Jira projects with issue types, acceptance criteria, and priority.
  - Auto-create Jira Bug tickets from failed test executions with reproduction steps, stack traces, and attached screenshots.
  - Synchronize test execution statuses back to Jira test management items.

### 6.2 GitHub
- **Authentication**: GitHub Personal Access Tokens (PAT).
- **Capabilities**:
  - Push generated Page Object Model (POM) Playwright test scripts directly to target repositories and branches (`/api/integration/github/push`).
  - Automated pull request impact analysis (`analyzePrImpact`) to identify existing test cases impacted by code diffs.

### 6.3 Slack
- **Authentication**: Slack Incoming Webhook URLs or Bot User OAuth Tokens (`xoxb-...`).
- **Capabilities**:
  - Automated channel alerts upon test suite completion, critical test failures, or subscription requests.
  - Customizable notification templates for QA teams.

---

## 7. Environment Configuration & Setup

### 7.1 Prerequisites
- **Node.js**: v22.x LTS or higher
- **Package Manager**: npm 10+
- **Operating System**: Linux (Debian 12 / Ubuntu 22.04+ recommended for container deployment), macOS, or Windows 11.
- **System Libraries for Headless Chromium**: `xvfb`, `libnss3`, `libatk1.0-0`, `libasound2`, `libgbm1`, and fonts (pre-packaged in Dockerfile).

### 7.2 Environment Variables
Create a `.env` file in the root directory based on `.env.example`:

```env
# Google Gemini API Key (Required for AI features, test generation, and QA Copilot)
GEMINI_API_KEY=your_gemini_api_key_here

# Anthropic Claude API Key (Optional: for advanced mobile screen understanding)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Encryption Key (Used for encrypting Jira, GitHub, and Slack credentials)
ENCRYPTION_KEY=your_secure_32_character_encryption_key_here

# Port (Defaults to 3000 in dev; 8080 in Cloud Run)
PORT=3000
```

### 7.3 Installation & Local Development

```bash
# 1. Install all dependencies
npm install

# 2. Start development server (boots Express server with Vite middleware on port 3000)
npm run dev

# 3. (Optional) Run the local AutomatiQA mobile/desktop device agent
npm run agent
```

### 7.4 Production Build & Start

```bash
# 1. Compile frontend client (dist/) and bundle backend server into dist/server.cjs
npm run build

# 2. Launch production server
npm start
```

---

## 8. API Reference

AutomatiQA exposes a rich REST and WebSocket API categorized below:

### 8.1 System & Health
- `GET /api/health` — Service health check (returns status, uptime, memory usage, Playwright readiness).
- `POST /api/logs` — Client log aggregation and structured persistence.

### 8.2 AI & Test Generation
- `POST /api/gemini/call` — Proxy for Gemini model queries with central rate-limiting and cache checks.
- `POST /api/gemini/generate-users` — Generates synthetic user personas for testing.
- `POST /api/gemini/generate-user-stories` — Generates Agile user stories from uploaded documents or prompts.
- `POST /api/ai/testcases/upload-file` — Uploads large requirements document (PDF/Word/Excel) for async processing.
- `POST /api/ai/testcases/start-job` — Starts an idempotent chunked test case generation background job.
- `GET /api/ai/testcases/job-status/:jobId` — Polls status of a long-running test generation job.
- `POST /api/ai/testcases/resume-job/:jobId` — Resumes an interrupted or rate-limited generation job.
- `POST /api/rag/embed` — Generates vector embeddings for test artifacts.
- `POST /api/rag/feasibility-check` — Evaluates requirements feasibility against the vector store.

### 8.3 Automation & Recording
- `POST /api/start-recording` — Initializes a Playwright recording session on target URL.
- `POST /api/record-event` — Appends user interactions (click, input, scroll) to active recording.
- `POST /api/stop-recording` — Finalizes recording session and formats test steps.
- `POST /api/run-playback` — Executes recorded step sequence in headless Chromium and captures screenshots.
- `POST /api/record-play/inspect-dom` — Retrieves DOM tree and computes optimal structured locators.
- `POST /api/parse-playwright` — Parses raw Playwright test script into visual step cards.

### 8.4 Mobile Testing & Local Agent
- `GET /api/mobile/devices` — Lists connected physical Android/iOS devices and active emulators.
- `POST /api/mobile/app/upload` — Uploads `.apk` application file and parses manifest package metadata.
- `POST /api/mobile/app/install` — Installs uploaded APK to selected device via ADB.
- `POST /api/mobile/app/launch` — Launches application package on device.
- `GET /api/mobile/agent/live-frame` — Streams real-time device screen JPEG frames.
- `POST /api/mobile/agent/perform-action` — Dispatches touch tap, swipe, keypress, or text input to device.
- `GET /api/mobile/device-logs` — Retrieves streaming logcat device logs for debugging.
- `GET /api/download-agent` — Serves cross-platform local agent bundles (Linux, Mac, Windows).

### 8.5 Performance & Load Testing
- `POST /api/web-performance/validate` — Executes full Lighthouse audit and returns Core Web Vitals.
- `POST /api/jmeter-performance/execute` — Generates JMX test plan and runs Apache JMeter load tests.

### 8.6 Integrations (Jira, GitHub, Slack)
- `POST /api/integration/jira/test` — Verifies Jira connection credentials.
- `POST /api/integration/jira/save` — Stores encrypted Jira settings for the project.
- `POST /api/integration/jira/stories` — Imports issues/stories from Jira query.
- `POST /api/integration/jira/post-bug` — Creates Jira bug with reproduction steps and attachments.
- `POST /api/integration/github/test` — Validates GitHub repository and PAT access.
- `POST /api/integration/github/push` — Commits generated test code to GitHub branch.
- `POST /api/integration/slack/test` — Sends verification message to Slack webhook or channel.

### 8.7 Credit & Subscription Management
- `GET /api/credits/project-plan/:projectId` — Retrieves project plan, remaining credits, and validity dates.
- `POST /api/credits/check-permission` — Validates if project has sufficient credits for an action.
- `POST /api/credits/deduct` — Deducts credits according to module rate table and logs transaction.
- `GET /api/credits/consumption-records` — Queries audit logs of credit usage.
- `POST /api/credits/project-plan/:projectId/request-subscription` — Submits plan upgrade request.
- `POST /api/credits/project-plan/:projectId/approve-subscription` — Admin approval of subscription request.

---

## 9. Deployment & Containerization

AutomatiQA is fully containerized and production-ready for Google Cloud Run, AWS ECS, Kubernetes, or standalone Docker engines.

### 9.1 Container Features (`Dockerfile`)
- **Base Image**: `node:22-bookworm-slim` (Debian 12).
- **Pre-installed Headless Browsers**: Playwright Chromium and `chromium-headless-shell` pre-installed to `/ms-playwright` during build to eliminate cold-start download delays.
- **Xvfb & Font Packages**: Complete virtual framebuffer and international font support (Noto Emoji, Liberation, CJK) for accurate visual rendering.
- **Multi-Stage Build**: Compiles Vite SPA and bundles Express server with `esbuild`, stripping all dev dependencies in the runner stage.
- **Self-Healing Health Check**: Docker `HEALTHCHECK` probing `http://127.0.0.1:8080/api/health`.

### 9.2 Running with Docker

```bash
# Build production Docker image
docker build -t automatiqa:latest .

# Run container exposing port 8080
docker run -d \
  -p 8080:8080 \
  -e PORT=8080 \
  -e GEMINI_API_KEY="your_api_key" \
  -e ENCRYPTION_KEY="your_encryption_key" \
  --name automatiqa-app \
  automatiqa:latest
```

### 9.3 Cloud Run Specifications
- **Port**: Bound to `0.0.0.0:8080` (or dynamic `process.env.PORT`).
- **Memory Recommendation**: Minimum 2GiB (4GiB recommended for concurrent Playwright/Lighthouse sessions).
- **CPU**: 2 vCPUs recommended.
- **Concurrency**: 80 requests per instance.

---

## 10. Logging, Telemetry & Observability

AutomatiQA features a unified, enterprise-grade logging and observability architecture (`services/appLogger.ts`, `services/firestoreSync.ts`, and `server.ts`) designed for end-to-end trace tracking across browser frontend clients, Express API endpoints, backend services, Firestore database operations, and Cloud Run execution logs.

### Key Capabilities

1. **Unique Trace ID / Request ID Propagation**:
   - Every user action generates or reuses a unique Trace ID (`trc_<timestamp>_<random>`) stored in `sessionStorage` and attached to client log entries.
   - Client `window.fetch` calls automatically intercept `/api/*` endpoints to inject the `X-Trace-ID` header.
   - The Express backend reads `X-Trace-ID` or generates a request ID, binds it to request/response execution context, and returns it in response headers.

2. **Standardized Lifecycle States**:
   - Tracks explicit lifecycle states: `STARTED`, `PROCESSING`, `SUCCESS`, `FAILED`, and `COMPLETED`.
   - Action context handles (`logger.startAction()`) provide duration calculation, performance monitoring, and unified error logging.

3. **Complete Error Details & Privacy Safeguards**:
   - Captures error name, message, stack trace, diagnostic code, feature context, action step, and active Trace ID.
   - **Sensitive Data Masking**: Automatically sanitizes sensitive keys (`password`, `pass`, `token`, `bearer`, `apikey`, `secret`, `credentials`, `authorization`, `cookie`, `jwt`, `privatekey`) replacing values with `[REDACTED_SENSITIVE_DATA]`.
   - Truncates base64 data URLs (>500 characters) and oversized string payloads (>2000 characters).

4. **Firestore Observability & Adaptive Timeout/Retry Engine (`services/firestoreSync.ts`)**:
   - `withAdaptiveTimeoutAndRetry`: Replaces naive static timeouts with adaptive retries (e.g. 3500ms initial + exponential backoff up to 2 retries).
   - Logs collection and document paths, operation types (`CREATE`, `READ`, `UPDATE`, `DELETE`), durationMs, retryCount, timeoutMs, and traceId.
   - Prevents unhandled promise rejections by catching timeouts and safely falling back to local memory and server disk backup stores (`/api/projects/backup`).

5. **Performance Threshold Logging**:
   - Emits `[SLOW_OPERATION_WARNING]` logs whenever an operation exceeds target performance thresholds (e.g., >1500ms for HTTP and Firestore operations, >3000ms for AI generation and document chunking).

6. **Project Document Pruning & Recovery Logging**:
   - Logs document size estimates before and after pruning (`pruneProjectData`).
   - Detailed log traces during 1MB Firestore limit enforcement, emergency ultra-pruning (`pruneProjectDataUltra`), and fallback to minimal core document skeletons while heavy data remains preserved on server disk.

7. **Dual-Target Log Stream (Browser Console & Cloud Run stdout)**:
   - Client-side logs render in browser developer console with styled color badges.
   - Browser logs are buffered and periodically sent via `navigator.sendBeacon` or `fetch` to `/api/logs`, outputting structured JSON logs directly to Cloud Run stdout/stderr for Google Cloud Logging dashboard queries.

---

## 11. Testing & Quality Assurance

AutomatiQA contains automated test suites to ensure system integrity:

```bash
# Type check and lint codebase
npm run lint

# Run locator engine tests (verifies locator stability and XPath/CSS prioritization)
node tests/locator-engine.test.mjs

# Run mobile gesture and step flow tests
node tests/mobile-input-flow.test.mjs
```

---

## 12. Troubleshooting & FAQs

### 1. "Firestore Operating in Offline Mode" / Quota Exceeded
- **Symptom**: Console logs `Firestore operating in offline/cached mode` or `Resource Exhausted`.
- **Cause**: Project has reached the daily free tier Firestore quota limit.
- **Resolution**: AutomatiQA automatically activates its internal local persistence fallback (`/data/project_backups/`), ensuring that testing, recording, and script generation continue uninterrupted. Changes synchronize once the quota resets or upon upgrading the database.

### 2. Playwright Chromium Browser Launch Failure
- **Symptom**: `browserType.launch: Executable doesn't exist at /ms-playwright/...`
- **Resolution**: Run `npx playwright install chromium` or set `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`. In Docker, browser binaries are already pre-baked into the image.

### 3. Chrome Extension Not Connecting
- **Symptom**: Extension shows "Connecting to AutomatiQA..." or handshake fails.
- **Resolution**: Verify that the application backend is reachable on port 3000 (or the deployed Cloud Run domain). Ensure the target webpage is served over HTTPS or localhost to avoid browser mixed-content restrictions.

### 4. Mobile Device / Emulator Not Detected
- **Symptom**: `No connected devices found` in Mobile Testing.
- **Resolution**:
  1. Ensure USB Debugging is enabled on the Android device (`Developer Options > USB Debugging`).
  2. Launch the local agent using `npm run agent` or execute the downloaded `automatiqa-agent` binary.
  3. Verify ADB detects the device by running `adb devices` in a local terminal.

### 5. Large File Upload Times Out
- **Symptom**: Large PDF/BRD requirements upload stalls or returns HTTP 413.
- **Resolution**: AutomatiQA's large file test case service decomposes files larger than 5MB into sequential background chunks. Ensure files do not exceed the 25MB maximum limit.

### 6. "Unable to extract content from the uploaded file" During AI Test Case Generation
- **Symptom**: Toast error stating `Unable to extract content from the uploaded file (<filename>): require is not defined` or parser failure.
- **Cause**: Dynamic CommonJS `require()` calls inside document extraction routines in Node.js 22 ESM environment, or library API mismatches across document parsers.
- **Resolution**: Fixed in `services/largeFileTestCaseService.ts`. The parser engine uses top-level ESM module imports (`mammoth`, `xlsx`, `jszip`, and `pdf-parse`), dual-mode path/buffer reads, a `JSZip` XML fallback parser for `.docx`, and a polymorphic parser wrapper for `pdf-parse` supporting both class and function invocations. All document formats (.docx, .pdf, .xlsx, .txt, .csv, .md, .json) are verified and operational.

---

## Maintenance & Update Policy

> **Directive**: Whenever any new feature, fix, enhancement, integration, or architectural configuration is implemented in AutomatiQA, this `README.md` must be updated with the corresponding details, updated API routes, credit policies, and operational instructions.
