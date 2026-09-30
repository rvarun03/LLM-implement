/**
 * ============================================================================
 * QA COPILOT - VERIFIED AUTOMATIQA KNOWLEDGE BASE & RETRIEVAL ENGINE
 * ============================================================================
 * Comprehensive, extensible knowledge base for AutomatiQA features, workflows,
 * permissions, project-level credit allocations, folder management, and troubleshooting.
 */

export interface QACopilotKnowledgeDoc {
  id: string;
  feature: string;
  page: string;
  route: string;
  purpose: string;
  overview: string;
  workflows: {
    title: string;
    steps: string[];
  }[];
  instructions: string[];
  faq: {
    question: string;
    answer: string;
  }[];
  commonErrors: {
    error: string;
    cause: string;
    solution: string;
  }[];
  troubleshooting: {
    symptom: string;
    resolution: string;
  }[];
  creditInformation: {
    action: string;
    trialCost: string;
    paidCost: string;
    description: string;
  }[];
  permissions: {
    role: string;
    access: string;
  }[];
  relatedFeatures: string[];
  keywords: string[];
  suggestedQuestions: string[];
  navTarget: string; // Internal AutomatiQA activeTab identifier
  version: number;
  active: boolean;
  updatedAt: string;
}

export type CopilotIntent =
  | 'HOW_TO'
  | 'FEATURE_EXPLANATION'
  | 'TROUBLESHOOTING'
  | 'CREDIT_INFORMATION'
  | 'PERMISSION_INFORMATION'
  | 'NAVIGATION'
  | 'GENERATION_HELP'
  | 'FOLDER_HELP'
  | 'APPROVAL_HELP'
  | 'DOWNLOAD_HELP'
  | 'COPY_HELP'
  | 'REPORT_HELP'
  | 'PROJECT_HELP'
  | 'ERROR_EXPLANATION'
  | 'UNKNOWN';

export const QA_COPILOT_KNOWLEDGE_BASE: QACopilotKnowledgeDoc[] = [
  // 1. DASHBOARD
  {
    id: 'dashboard',
    feature: 'Dashboard',
    page: 'Dashboard',
    route: '/dashboard',
    purpose: 'Centralized command center for test automation metrics, active project status, generation summaries, and quick action shortcuts.',
    overview: 'The AutomatiQA Dashboard gives teams high-level visibility across all QA assets including User Stories, Scenarios, Test Cases, Automation Scripts, API tests, and Execution Reports.',
    workflows: [
      {
        title: 'Switching Active Projects from Dashboard',
        steps: [
          'Locate the project selector dropdown at the top navigation bar.',
          'Choose the desired project from the dropdown.',
          'All metric tiles, counts, and recent activities immediately refresh to reflect the chosen project.'
        ]
      },
      {
        title: 'Using Quick Actions',
        steps: [
          'Review the quick action cards in the center of the dashboard.',
          'Click any quick action (e.g., "Create User Stories", "Generate Test Cases", "New API Suite").',
          'AutomatiQA navigates you straight to the corresponding workflow.'
        ]
      }
    ],
    instructions: [
      'Use the project switcher at the top header to isolate metrics per project.',
      'Check the Token/Credit widget to verify current project credit health before launching large generation runs.'
    ],
    faq: [
      {
        question: 'What do the metrics on the dashboard represent?',
        answer: 'They reflect the counts of generated and approved assets for the currently selected project, including total scenarios, test cases, automation scripts, and pass/fail execution stats.'
      }
    ],
    commonErrors: [
      {
        error: 'No data visible on dashboard',
        cause: 'No project is selected or the active project has no generated assets yet.',
        solution: 'Select an active project from the top dropdown or navigate to Projects to create one.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Dashboard numbers not updating after generating test cases',
        resolution: 'Refresh the page or switch projects back and forth to force a real-time Firestore sync.'
      }
    ],
    creditInformation: [
      {
        action: 'Viewing Dashboard',
        trialCost: '0 Credits',
        paidCost: '0 Credits',
        description: 'Dashboard navigation and viewing metrics is completely free.'
      }
    ],
    permissions: [
      { role: 'Super Admin', access: 'Can see cross-organization metrics and all projects.' },
      { role: 'Admin / DM / Spoc', access: 'Can see metrics for assigned projects.' },
      { role: 'Team Member', access: 'Can see metrics for projects they are assigned to.' }
    ],
    relatedFeatures: ['Projects', 'AI User Stories', 'AI Test Cases', 'Reports'],
    keywords: ['dashboard', 'home', 'metrics', 'overview', 'summary', 'quick actions', 'stats'],
    suggestedQuestions: [
      'What can I do from the Dashboard?',
      'How do I switch the active project?',
      'Where can I see my project test execution summary?'
    ],
    navTarget: 'dashboard',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 2. PROJECTS
  {
    id: 'projects',
    feature: 'Projects',
    page: 'Projects',
    route: '/projects',
    purpose: 'Manage test repositories, member allocations, project roles, and shared credit pools.',
    overview: 'Projects in AutomatiQA provide strict data isolation. Every user story, scenario, test case, script, API suite, and credit pool belongs strictly to a specific project.',
    workflows: [
      {
        title: 'Creating a New Project',
        steps: [
          'Navigate to Projects from the left sidebar.',
          'Click the "+ New Project" button.',
          'Provide a Project Name, optional Description, and select members to assign.',
          'Click "Create Project". The new project is assigned an automatic Trial credit plan (100 credits, 7 days validity).'
        ]
      },
      {
        title: 'Assigning Team Members to a Project',
        steps: [
          'Open the Projects page.',
          'Find the project card and click "Edit" or "Manage Members".',
          'Check the email addresses of the users you want to allocate.',
          'Assign project roles: "Admin" or "Team Member".',
          'Save changes. Members will immediately see this project in their project switcher.'
        ]
      }
    ],
    instructions: [
      'Admins and Super Admins can create and archive projects.',
      'Only assigned members can view or execute tests in a project.',
      'Credits belong to the PROJECT, not to individual users.'
    ],
    faq: [
      {
        question: 'Are credits shared among all project members?',
        answer: 'Yes! AutomatiQA uses Project-Level Credit Pools. When any assigned member generates, copies, or downloads tests, credits are deducted from the shared project pool.'
      }
    ],
    commonErrors: [
      {
        error: 'You do not have access to this project',
        cause: 'The current user is not assigned to the project.',
        solution: 'Ask your Project Admin or Super Admin to assign your email on the Projects page.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Newly created project not appearing in dropdown',
        resolution: 'Check if you are assigned as an owner or member of that project, or refresh the page.'
      }
    ],
    creditInformation: [
      {
        action: 'Project Creation',
        trialCost: '0 Credits (Grants 100 Trial pool)',
        paidCost: '0 Credits (Grants 1,000 Paid pool when activated)',
        description: 'Creating and managing projects does not consume credits.'
      }
    ],
    permissions: [
      { role: 'Super Admin / Admin', access: 'Full CRUD on all projects and member assignments.' },
      { role: 'Delivery Manager / Spoc', access: 'Create and manage assigned projects.' },
      { role: 'Team Member', access: 'Read and work within assigned projects only.' }
    ],
    relatedFeatures: ['Access Control', 'Credits Consumption', 'AI User Stories'],
    keywords: ['project', 'projects', 'create project', 'members', 'assign member', 'repository', 'workspace'],
    suggestedQuestions: [
      'How do I create a new project?',
      'How do I add team members to a project?',
      'How are credits shared between project members?'
    ],
    navTarget: 'projects',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 3. ACCESS CONTROL & USER MANAGEMENT
  {
    id: 'user_management',
    feature: 'Access Control',
    page: 'Access Control',
    route: '/user-management',
    purpose: 'Manage organizational user accounts, assign global roles, configure permissions, and reset credentials.',
    overview: 'AutomatiQA features a granular 5-tier Role-Based Access Control (RBAC) model: Super Admin, Admin, Delivery Manager, Spoc, and Team Member.',
    workflows: [
      {
        title: 'Inviting or Creating a New User',
        steps: [
          'Navigate to Access Control from the sidebar.',
          'Click the "+ Add User" button.',
          'Enter the user Full Name, Email Address, default password, and select their Role.',
          'Click "Create User". The user can now log into AutomatiQA with their credentials.'
        ]
      },
      {
        title: 'Updating User Role',
        steps: [
          'Find the user row in the user table.',
          'Click the edit icon or change the Role dropdown directly.',
          'Confirm the role change. The user permissions update in real-time.'
        ]
      }
    ],
    instructions: [
      'Only Super Admins and Admins have access to the Access Control page.',
      'Super Admin has unrestricted organization-wide access, including subscription approval and user deletion.'
    ],
    faq: [
      {
        question: 'What is the difference between Super Admin and Admin?',
        answer: 'Super Admin can approve paid subscription requests, manage all users, and delete projects. Admins manage assigned projects, members, and test workflows.'
      }
    ],
    commonErrors: [
      {
        error: 'Access Denied: Only Admins can access User Management',
        cause: 'User role is Team Member, Spoc, or Delivery Manager without admin privileges.',
        solution: 'Contact a Super Admin to elevate your privileges.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'User cannot log in after creation',
        resolution: 'Ensure the email address matches exactly (case-insensitive) and reset the password if necessary.'
      }
    ],
    creditInformation: [
      {
        action: 'User Management Operations',
        trialCost: '0 Credits',
        paidCost: '0 Credits',
        description: 'Managing users, roles, and permissions never consumes credits.'
      }
    ],
    permissions: [
      { role: 'Super Admin', access: 'Full control over all users, roles, and security policies.' },
      { role: 'Admin', access: 'Manage team members and project assignments.' },
      { role: 'Other Roles', access: 'No access to Access Control.' }
    ],
    relatedFeatures: ['Projects', 'Settings', 'Credits Consumption'],
    keywords: ['users', 'roles', 'permissions', 'access control', 'super admin', 'admin', 'team member', 'rbac'],
    suggestedQuestions: [
      'What are the different roles in AutomatiQA?',
      'How do I add a new team member?',
      'Who can approve subscription requests?'
    ],
    navTarget: 'user_management',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 4. AI USER STORIES
  {
    id: 'ai_user_stories',
    feature: 'AI User Stories',
    page: 'AI User Stories',
    route: '/ai-user-stories',
    purpose: 'Transform unstructured requirements, PRDs, BRD documents, wireframes, and screenshots into structured, standardized Agile User Stories with Gherkin acceptance criteria.',
    overview: 'The AI User Stories module parses text, uploaded files (PDF, DOCX, XLSX, TXT), images, and web URLs into comprehensive Agile stories categorized by priority, complexity, and acceptance criteria.',
    workflows: [
      {
        title: 'Generating User Stories from Document',
        steps: [
          'Navigate to AI User Stories.',
          'Choose your input method: "Upload Document", "Paste Text / PRD", "Screenshot / Image", or "Website URL".',
          'Upload your file or paste your requirement specifications.',
          'Provide optional context or focus areas in the context field.',
          'Click the "Generate User Stories" button.',
          'Review the synthesized stories, acceptance criteria, and priority tags.',
          'Click "Approve" on valid stories or "Save to Folder" to organize them.'
        ]
      },
      {
        title: 'Saving User Stories to Folders',
        steps: [
          'Select one or more generated user stories using the checkboxes.',
          'Click the "Save to Folder" button.',
          'Choose an existing folder from the dropdown or click "+ New Folder".',
          'Click "Save". The stories are stored permanently in the project folder.'
        ]
      }
    ],
    instructions: [
      'Accepted file types: PDF, DOCX, XLSX, PNG, JPG, WebP, TXT, Markdown.',
      'Stories must be approved before synthesizing AI Test Scenarios in downstream workflows.',
      'You can edit story titles, summaries, and acceptance criteria before approving.'
    ],
    faq: [
      {
        question: 'How many credits does generating User Stories cost?',
        answer: 'Generation (Analysis) costs 5 credits per run on both Trial and Paid plans. Copying costs 20 credits (Trial) or 10 credits (Paid). Downloading costs 10 credits.'
      },
      {
        question: 'Do I need to approve User Stories to use them in Test Scenarios?',
        answer: 'Yes! AI Test Scenarios generation requires approved user stories to ensure test quality.'
      }
    ],
    commonErrors: [
      {
        error: 'Insufficient project credits to generate user stories',
        cause: 'The active project has fewer than 5 credits remaining.',
        solution: 'Renew the project plan or submit a subscription request via the Credits Consumption page.'
      },
      {
        error: 'Failed to parse uploaded document',
        cause: 'File is corrupted, password-protected, or exceeding 25MB.',
        solution: 'Export the file as a clean PDF or plain text and try again.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Generation button is disabled',
        resolution: 'Ensure an active project is selected and at least one requirement input is provided.'
      }
    ],
    creditInformation: [
      { action: 'AI Generation (Analysis)', trialCost: '5 Credits', paidCost: '5 Credits', description: 'Charged per generation run.' },
      { action: 'Copy to Clipboard', trialCost: '20 Credits', paidCost: '10 Credits', description: 'Charged when using the official Copy button.' },
      { action: 'Download / Export', trialCost: '10 Credits', paidCost: '10 Credits', description: 'Export to CSV, Excel, or JSON.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can generate, review, and organize user stories within their project.' }
    ],
    relatedFeatures: ['AI Test Scenarios', 'AI Test Cases', 'Folders', 'Credits Consumption'],
    keywords: ['user stories', 'prd', 'requirements', 'brd', 'acceptance criteria', 'generate stories', 'gherkin'],
    suggestedQuestions: [
      'How do I generate User Stories from a PRD document?',
      'How do I approve User Stories?',
      'How many credits are consumed when generating user stories?'
    ],
    navTarget: 'ai_user_generator',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 5. AI TEST SCENARIOS
  {
    id: 'ai_scenarios',
    feature: 'AI Test Scenarios',
    page: 'AI Test Scenarios',
    route: '/ai-test-scenarios',
    purpose: 'Synthesize comprehensive positive, negative, edge-case, and security test scenarios from approved User Stories.',
    overview: 'AI Test Scenarios bridges requirements and test execution by transforming approved user stories into functional, edge, and integration test scenarios ready for test case elaboration.',
    workflows: [
      {
        title: 'Generating Test Scenarios from User Stories',
        steps: [
          'Navigate to AI Test Scenarios from the sidebar.',
          'Select the Approved User Stories you want to cover using the story selection picker.',
          'Configure scenario types: Positive, Negative, Boundary/Edge, and Security.',
          'Click "Generate Scenarios".',
          'Review the generated scenario list, descriptions, and coverage tags.',
          'Toggle "Approve" on valid scenarios so they become available in AI Test Cases.',
          'Click "Save to Folder" to organize your scenarios.'
        ]
      }
    ],
    instructions: [
      'Ensure you have approved User Stories first; unapproved stories cannot be converted into scenarios.',
      'Use the Review & Approval toggle to validate scenarios before test case generation.',
      'Scenarios can be filtered by type (Positive, Negative, Edge Case).'
    ],
    faq: [
      {
        question: 'Why are no user stories showing up to select?',
        answer: 'You must first generate and click "Approve" on user stories in the AI User Stories module.'
      },
      {
        question: 'How many credits does scenario generation consume?',
        answer: 'Analysis costs 10 credits. Copy and Download actions consume 20 credits.'
      }
    ],
    commonErrors: [
      {
        error: 'No approved user stories available',
        cause: 'User stories exist but none have been marked as Approved.',
        solution: 'Open AI User Stories and toggle the Approval checkbox on at least one story.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Cannot proceed to AI Test Cases',
        resolution: 'Mark at least one scenario as Approved by toggling its approval switch.'
      }
    ],
    creditInformation: [
      { action: 'AI Generation (Analysis)', trialCost: '10 Credits', paidCost: '10 Credits', description: 'Charged per scenario generation batch.' },
      { action: 'Copy Scenarios', trialCost: '20 Credits', paidCost: '20 Credits', description: 'Official copy button.' },
      { action: 'Download Scenarios', trialCost: '20 Credits', paidCost: '20 Credits', description: 'Export to CSV / Excel.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can generate, approve, and export test scenarios.' }
    ],
    relatedFeatures: ['AI User Stories', 'AI Test Cases', 'Folders'],
    keywords: ['scenarios', 'test scenarios', 'positive scenarios', 'negative scenarios', 'edge cases', 'approve scenarios'],
    suggestedQuestions: [
      'How do I generate test scenarios from user stories?',
      'Why do I need to approve scenarios?',
      'How do I filter between positive and negative scenarios?'
    ],
    navTarget: 'scenarios',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 6. AI TEST CASES
  {
    id: 'ai_test_cases',
    feature: 'AI Test Cases',
    page: 'AI Test Cases',
    route: '/ai-test-cases',
    purpose: 'Generate detailed, step-by-step manual and automated test cases complete with preconditions, test steps, test data, and expected results.',
    overview: 'AI Test Cases turns approved scenarios into production-grade QA test specifications with Given/When/Then steps, expected assertions, severity ratings, and automated execution readiness.',
    workflows: [
      {
        title: 'Generating Test Cases',
        steps: [
          'Navigate to AI Test Cases.',
          'Select the Approved Scenarios you want to elaborate into test cases.',
          'Choose your desired test format: Manual Step-by-Step or BDD Gherkin.',
          'Click the "Generate Test Cases" button.',
          'Review each generated test case: Preconditions, Action Steps, Expected Results, and Severity.',
          'Toggle "Approve" on the test cases.',
          'Save them to an existing folder or export them to Jira/CSV.'
        ]
      },
      {
        title: 'Approving and Organizing Test Cases',
        steps: [
          'Click the checkmark / approval badge on each verified test case.',
          'Select the approved test cases using bulk checkboxes.',
          'Click "Save to Folder" to store them in your project hierarchy.'
        ]
      }
    ],
    instructions: [
      'Only approved test scenarios appear in the scenario selection drawer.',
      'Approved test cases can be directly forwarded to the Automation Script Generator for Page Object Model code synthesis.'
    ],
    faq: [
      {
        question: 'How do I approve test cases?',
        answer: 'Each test case card has an "Approve" toggle or badge. Click it to mark the test case as verified. Approved test cases have a green badge and are ready for script generation.'
      },
      {
        question: 'How many credits are consumed by AI Test Cases?',
        answer: 'Generation costs 20 credits. Copy and Download cost 20 credits each.'
      }
    ],
    commonErrors: [
      {
        error: 'Please select at least one approved scenario',
        cause: 'No scenarios were selected or scenarios have not been approved yet.',
        solution: 'Navigate to AI Test Scenarios, approve the scenarios, then return and select them.'
      },
      {
        error: 'Project credit balance insufficient (needs 20 credits)',
        cause: 'Active project has fewer than 20 credits remaining.',
        solution: 'Renew plan or request more credits from the Credits Consumption tab.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Test cases not saving to folder',
        resolution: 'Ensure a folder is selected or create a new folder with a unique name.'
      }
    ],
    creditInformation: [
      { action: 'AI Generation (Analysis)', trialCost: '20 Credits', paidCost: '20 Credits', description: 'Per test case synthesis run.' },
      { action: 'Copy Test Cases', trialCost: '20 Credits', paidCost: '20 Credits', description: 'Official copy button.' },
      { action: 'Download Test Cases', trialCost: '20 Credits', paidCost: '20 Credits', description: 'Export to Excel, CSV, or PDF.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can generate, approve, edit, and organize test cases.' }
    ],
    relatedFeatures: ['AI Test Scenarios', 'Automation Script Generator', 'Folders', 'Credits Consumption'],
    keywords: ['test cases', 'generate test cases', 'approve test cases', 'manual cases', 'preconditions', 'test steps', 'expected results'],
    suggestedQuestions: [
      'How do I generate test cases?',
      'How do I approve test cases?',
      'How do I save test cases to a folder?',
      'How many credits does test case generation cost?'
    ],
    navTarget: 'cases',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 7. AUTOMATION SCRIPT GENERATOR
  {
    id: 'automation_script',
    feature: 'Automation Script Generator',
    page: 'Script Generator',
    route: '/scripts',
    purpose: 'Automatically generate production-grade Page Object Model (POM) test automation code in Playwright, Cypress, Selenium, or Appium.',
    overview: 'The Script Generator converts approved test cases or user prompts into modular automation suites with separated Page Objects, locators, test specs, configuration files, and runner scripts.',
    workflows: [
      {
        title: 'Generating an Automation Suite from Test Cases',
        steps: [
          'Navigate to Automation -> Script Generator from the sidebar.',
          'Select your target framework: Playwright (TypeScript/JavaScript), Cypress, Selenium (Java/Python/C#), or Appium.',
          'Select the approved Test Cases you want to automate.',
          'Provide the Target Application URL.',
          'Click "Generate Automation Script".',
          'Browse the generated files in the interactive file explorer: Page Objects, Spec files, and playwright.config.ts / package.json.',
          'Click "Download ZIP" to download the complete standalone project, or copy individual files.'
        ]
      }
    ],
    instructions: [
      'Select Page Object Model (POM) architecture for modular, enterprise-ready code.',
      'Download ZIP contains all dependencies, runners, and configuration ready to execute via npm test.'
    ],
    faq: [
      {
        question: 'Which frameworks and languages are supported?',
        answer: 'Playwright (TypeScript & JavaScript), Cypress, Selenium (Java, Python, C#), and Appium (Mobile TypeScript/Java).'
      },
      {
        question: 'How many credits does script generation consume?',
        answer: 'Generation costs 50 credits. Copy and Download actions cost 50 credits.'
      }
    ],
    commonErrors: [
      {
        error: 'Target URL is required for POM script generation',
        cause: 'The target application URL was left blank.',
        solution: 'Enter the base URL of the application you are automating (e.g. https://example.com).'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Download ZIP does not trigger',
        resolution: 'Ensure popups are allowed in your browser, or use the individual file Copy button.'
      }
    ],
    creditInformation: [
      { action: 'AI Script Generation', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Generates full multi-file POM suite.' },
      { action: 'Copy Script Content', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Official copy button in editor.' },
      { action: 'Download ZIP / Script', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Bundles complete npm project.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can generate and download automation scripts.' }
    ],
    relatedFeatures: ['AI Test Cases', 'Record & Play', 'Folders'],
    keywords: ['automation script', 'playwright', 'cypress', 'selenium', 'appium', 'page object model', 'pom', 'generate script'],
    suggestedQuestions: [
      'How do I generate Playwright Page Object Model scripts?',
      'Which testing frameworks are supported?',
      'How do I download the generated automation suite as a ZIP?'
    ],
    navTarget: 'scripts',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 8. RECORD & PLAY - WEB APP
  {
    id: 'record_play_web',
    feature: 'Record & Play - Web App',
    page: 'Record & Play Web',
    route: '/record-play',
    purpose: 'Record real user interactions on any live web application or upload screen recordings to synthesize Playwright test scripts automatically.',
    overview: 'Record & Play records clicks, text typing, navigation, and assertions directly in the browser, or extracts user actions from an uploaded MP4/WebM video, translating them into executable Playwright scripts.',
    workflows: [
      {
        title: 'Recording a Live Web Session',
        steps: [
          'Navigate to Automation -> Record & Play -> Web App.',
          'Enter the Target URL you want to record.',
          'Click "Start Recording".',
          'Perform user actions on the target site (clicks, form fills, navigations).',
          'Click "Stop Recording".',
          'Review the recorded action timeline.',
          'Click "Generate Playwright Script" to convert recorded actions into code.'
        ]
      },
      {
        title: 'Uploading a Video Recording',
        steps: [
          'Click "Upload Video Recording".',
          'Select an MP4, WebM, or MOV video demonstrating user interactions.',
          'Wait for AI vision analysis to recognize steps and DOM elements.',
          'Review recognized steps and export the Playwright script.'
        ]
      }
    ],
    instructions: [
      'Ensure the target site is reachable over HTTP/HTTPS.',
      'Video uploads should have clear cursor visibility for optimal step recognition.'
    ],
    faq: [
      {
        question: 'How are credits consumed for Record & Play?',
        answer: 'Analysis/Script generation consumes 100 credits. Copy and Download consume 50 credits each.'
      }
    ],
    commonErrors: [
      {
        error: 'Cannot connect to target URL',
        cause: 'Target URL is blocked by CORS or internal network firewall.',
        solution: 'Use the AutomatiQA Desktop Agent or test with a publicly reachable URL.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Video upload processing takes a long time',
        resolution: 'Compress the video below 50MB and ensure high resolution (720p or 1080p).'
      }
    ],
    creditInformation: [
      { action: 'Session Analysis & Script Synthesis', trialCost: '100 Credits', paidCost: '100 Credits', description: 'Translates video/events into scripts.' },
      { action: 'Copy Generated Script', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Official copy button.' },
      { action: 'Download Script', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Export as .spec.ts file.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can record, upload video, and generate scripts.' }
    ],
    relatedFeatures: ['Automation Script Generator', 'UI Testing', 'Record & Play Mobile'],
    keywords: ['record and play', 'web recording', 'video upload', 'event capture', 'playwright recorder', 'playback'],
    suggestedQuestions: [
      'How do I record a web session?',
      'How does video-to-script synthesis work?',
      'How many credits does Web Record & Play consume?'
    ],
    navTarget: 'record_play',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 9. RECORD & PLAY - MOBILE APP
  {
    id: 'record_play_mobile',
    feature: 'Record & Play - Mobile App',
    page: 'Mobile Testing',
    route: '/mobile-testing',
    purpose: 'Inspect mobile APK applications, capture UI element locators (XPath, ID, Accessibility ID), and generate Appium automation scripts.',
    overview: 'Mobile Testing provides an interactive APK element inspector and test generator compatible with Android Appium runners and the AutomatiQA local device agent.',
    workflows: [
      {
        title: 'Uploading an APK and Inspecting UI',
        steps: [
          'Navigate to Automation -> Record & Play -> Mobile App.',
          'Drag and drop an Android APK file into the upload zone.',
          'Launch the AutomatiQA Agent (automatiqa-agent.js) on your local machine with an active ADB connection.',
          'Click elements on the mobile screen to inspect XPath, resource ID, and text attributes.',
          'Click "Generate Appium Script" to synthesize automated test code.'
        ]
      }
    ],
    instructions: [
      'Requires an active Android device or emulator running locally if executing real-time tests.',
      'Download automatiqa-agent.js directly from the Mobile Testing page to bridge browser with local ADB.'
    ],
    faq: [
      {
        question: 'What is the AutomatiQA Agent?',
        answer: 'A lightweight Node.js script that connects your local ADB / Appium server to the AutomatiQA web interface for direct device inspection and execution.'
      }
    ],
    commonErrors: [
      {
        error: 'Device agent not detected',
        cause: 'automatiqa-agent.js is not running in your terminal.',
        solution: 'Download automatiqa-agent.js, run `node automatiqa-agent.js` in terminal, and ensure ADB sees your device.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'APK upload fails',
        resolution: 'Ensure the file has a valid .apk extension and is under 200MB.'
      }
    ],
    creditInformation: [
      { action: 'Mobile Analysis & Script Synthesis', trialCost: '100 Credits', paidCost: '100 Credits', description: 'Per Appium script generation.' },
      { action: 'Copy / Download', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Official copy or export.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can upload APKs, inspect elements, and generate Appium scripts.' }
    ],
    relatedFeatures: ['Record & Play Web', 'Automation Script Generator'],
    keywords: ['mobile testing', 'apk', 'appium', 'adb', 'android', 'inspector', 'xpath', 'device agent'],
    suggestedQuestions: [
      'How do I inspect mobile APK elements?',
      'How do I run the AutomatiQA local device agent?',
      'How do I generate Appium scripts?'
    ],
    navTarget: 'mobile_testing',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 10. UI TESTING
  {
    id: 'ui_testing',
    feature: 'UI Testing',
    page: 'UI Testing',
    route: '/ui-testing',
    purpose: 'Perform automated visual regression testing, multi-viewport layout validation, and self-healing element verification across target URLs.',
    overview: 'UI Testing captures live website DOM snapshots and screenshots across Desktop, Tablet, and Mobile viewports, highlighting visual diffs, missing elements, and broken layouts.',
    workflows: [
      {
        title: 'Running a UI Visual Test',
        steps: [
          'Navigate to UI Testing.',
          'Enter the Target URL to test.',
          'Choose viewports: Desktop (1920x1080), Tablet (768x1024), or Mobile (375x812).',
          'Configure baseline comparison options.',
          'Click "Run UI Inspection & Analysis".',
          'Inspect highlighted visual diffs, element health scores, and recommended locator fixes.'
        ]
      }
    ],
    instructions: [
      'Ensure the target URL is accessible without internal VPN restrictions.',
      'Use the self-healing locator suggestions to update brittle XPath/CSS selectors in your test suites.'
    ],
    faq: [
      {
        question: 'How many credits does UI Testing consume?',
        answer: 'Analysis costs 50 credits per run. Copy and Download cost 50 credits each.'
      }
    ],
    commonErrors: [
      {
        error: 'URL unreachable or DNS error',
        cause: 'The target website cannot be loaded or blocked the headless scraper.',
        solution: 'Check URL spelling, verify SSL certificates, or test a different page.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Screenshots appear blank or white',
        resolution: 'Target page may have aggressive bot protection or require heavy client-side JavaScript rendering.'
      }
    ],
    creditInformation: [
      { action: 'UI Inspection & Visual Diff', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Full DOM and visual regression analysis.' },
      { action: 'Copy / Download Report', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Export visual audit report.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can run UI tests and view visual regression reports.' }
    ],
    relatedFeatures: ['Web Performance Testing', 'Record & Play Web', 'Reports'],
    keywords: ['ui testing', 'visual regression', 'viewport', 'dom inspection', 'self-healing', 'screenshots'],
    suggestedQuestions: [
      'How does visual regression testing work?',
      'What viewports are tested in UI Testing?',
      'How do I inspect self-healing locator suggestions?'
    ],
    navTarget: 'ui_testing',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 11. API TESTING
  {
    id: 'api_testing',
    feature: 'API Testing',
    page: 'API Testing',
    route: '/api-testing',
    purpose: 'Design, configure, execute, and assert REST API requests with headers, query parameters, auth tokens, and response validators.',
    overview: 'The API Testing suite allows QA engineers to execute HTTP requests (GET, POST, PUT, DELETE, PATCH), validate status codes, assert JSON schema and body contents, and chain test suites.',
    workflows: [
      {
        title: 'Creating and Executing an API Test',
        steps: [
          'Navigate to API Testing.',
          'Click "+ New Request" or "+ New Suite".',
          'Select HTTP Method (GET, POST, PUT, DELETE).',
          'Enter the endpoint URL.',
          'Configure Headers, Authentication (Bearer Token, Basic Auth), Query Parameters, and Body (JSON).',
          'Add Assertions: Status Code (e.g. 200 OK), Response Time (<500ms), and JSON path checks.',
          'Click "Send Request" to execute.',
          'Inspect the formatted JSON response, status code, latency, and assertion pass/fail results.'
        ]
      }
    ],
    instructions: [
      'Save frequently used requests into test suites for batch execution.',
      'Use environment variables in double curly braces (e.g. {{baseUrl}}) for dynamic execution across environments.'
    ],
    faq: [
      {
        question: 'Can I test protected APIs requiring Bearer tokens?',
        answer: 'Yes! In the Headers tab, add "Authorization: Bearer <your-token>" or select the Auth tab and choose Bearer Token.'
      },
      {
        question: 'How many credits does API Testing consume?',
        answer: 'AI Analysis/Assertion synthesis consumes 50 credits. Copy and Download consume 50 credits each.'
      }
    ],
    commonErrors: [
      {
        error: 'CORS policy blocked request',
        cause: 'Target API does not allow browser-based cross-origin calls.',
        solution: 'AutomatiQA automatically routes API calls through its backend proxy to bypass CORS restrictions.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Assertion failed: Response time exceeded threshold',
        resolution: 'Target server is responding slower than configured SLA; increase threshold or investigate server latency.'
      }
    ],
    creditInformation: [
      { action: 'API Suite Analysis & AI Assertion Synthesis', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Per AI suite generation.' },
      { action: 'Copy / Download API Tests', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Export to Postman collection or JSON.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can build, execute, and export API test suites.' }
    ],
    relatedFeatures: ['API Performance Testing', 'Reports', 'Automation Script Generator'],
    keywords: ['api testing', 'rest api', 'http requests', 'json assertion', 'postman', 'endpoints', 'headers'],
    suggestedQuestions: [
      'How do I create and execute an API test?',
      'How do I add assertions to an API response?',
      'Can I export API test suites to Postman?'
    ],
    navTarget: 'api',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 12. API PERFORMANCE TESTING
  {
    id: 'api_performance',
    feature: 'API Performance Testing',
    page: 'API Performance',
    route: '/api-performance',
    purpose: 'Simulate concurrent user traffic, analyze throughput (req/s), latency distributions, and synthesize Apache JMeter (.jmx) or k6 performance test plans.',
    overview: 'API Performance Testing stress-tests backend endpoints under configurable virtual user concurrency, measuring 90th/95th/99th percentile response times, error rates, and generating JMeter and k6 execution scripts.',
    workflows: [
      {
        title: 'Configuring and Generating a JMeter Performance Test',
        steps: [
          'Navigate to API Performance Testing from the sidebar.',
          'Enter the Target API URL and HTTP method.',
          'Set Virtual Users (Threads), Ramp-up Time (seconds), and Duration or Loop count.',
          'Click "Generate Performance Test Plan".',
          'Review the synthesized JMeter XML (.jmx) plan and k6 JavaScript script.',
          'Click "Download .jmx" to execute in Apache JMeter or run directly in AutomatiQA.'
        ]
      }
    ],
    instructions: [
      'Keep ramp-up time realistic (e.g. 10 users over 10 seconds) to avoid slamming target servers instantly.',
      'Review the latency percentiles (P90, P95, P99) to identify tail-latency bottlenecks.'
    ],
    faq: [
      {
        question: 'How are credits charged for Performance Testing?',
        answer: 'Analysis/Test Plan synthesis costs 100 credits. Copy and Download cost 50 credits each.'
      }
    ],
    commonErrors: [
      {
        error: 'Connection timeout during load execution',
        cause: 'The target server reached maximum connection capacity or rate-limited requests.',
        solution: 'Reduce virtual user count or extend ramp-up time.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'High error rate (>5%) in performance report',
        resolution: 'Inspect response codes: 429 indicates rate limiting; 502/503 indicates server overload.'
      }
    ],
    creditInformation: [
      { action: 'Performance Plan Analysis & JMeter/k6 Generation', trialCost: '100 Credits', paidCost: '100 Credits', description: 'Generates full load test configuration.' },
      { action: 'Copy / Download Script', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Download .jmx or k6 script.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can generate performance test plans and execute load tests.' }
    ],
    relatedFeatures: ['API Testing', 'Web Performance Testing', 'Reports'],
    keywords: ['performance testing', 'jmeter', 'k6', 'load testing', 'stress testing', 'virtual users', 'throughput', 'latency'],
    suggestedQuestions: [
      'How do I generate a JMeter test plan (.jmx)?',
      'How do I configure virtual users and ramp-up time?',
      'How are credits consumed for performance testing?'
    ],
    navTarget: 'performance',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 13. WEB PERFORMANCE TESTING
  {
    id: 'web_performance',
    feature: 'Web Performance Testing',
    page: 'Web Performance',
    route: '/web-performance',
    purpose: 'Audit website speed and Core Web Vitals (FCP, LCP, CLS, TBT, Speed Index) and obtain actionable AI-driven performance optimization recommendations.',
    overview: 'Web Performance Testing runs automated Lighthouse audits on any public URL, scoring Performance, Accessibility, Best Practices, and SEO, and diagnosing rendering bottlenecks.',
    workflows: [
      {
        title: 'Running a Web Performance Audit',
        steps: [
          'Navigate to Web Performance from the sidebar.',
          'Enter the Target Website URL (e.g. https://my-app.com).',
          'Select Device Emulation: Mobile or Desktop.',
          'Click "Run Performance Audit".',
          'Review Core Web Vitals: First Contentful Paint (FCP), Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Total Blocking Time (TBT).',
          'Examine the AI Diagnostics section for specific optimization fixes.'
        ]
      }
    ],
    instructions: [
      'Test both Mobile and Desktop profiles; mobile scores are typically more constrained by CPU and network throttling.',
      'Focus on Largest Contentful Paint (LCP) and Total Blocking Time (TBT) to improve real-world user experience.'
    ],
    faq: [
      {
        question: 'What is a good Core Web Vitals score?',
        answer: 'LCP under 2.5s, CLS under 0.1, and FID/TBT under 200ms are considered "Good" by Google standards.'
      }
    ],
    commonErrors: [
      {
        error: 'Target URL is unreachable or requires authentication',
        cause: 'Lighthouse runner cannot bypass login forms or internal VPNs.',
        solution: 'Provide a publicly accessible landing page URL or configure authentication tokens.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Performance score fluctuates across runs',
        resolution: 'Network variability and third-party scripts (ads/trackers) cause variance; run 3 audits and take the average.'
      }
    ],
    creditInformation: [
      { action: 'Audit Analysis & AI Diagnostics', trialCost: '100 Credits', paidCost: '100 Credits', description: 'Full Lighthouse and Core Web Vitals audit.' },
      { action: 'Copy / Download Report', trialCost: '50 Credits', paidCost: '50 Credits', description: 'Export performance report.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can run web performance audits and view reports.' }
    ],
    relatedFeatures: ['UI Testing', 'API Performance Testing', 'Reports'],
    keywords: ['web performance', 'lighthouse', 'core web vitals', 'lcp', 'cls', 'tbt', 'speed index', 'fcp', 'page speed'],
    suggestedQuestions: [
      'How do I run a Core Web Vitals audit?',
      'What do LCP and CLS mean in Web Performance?',
      'How many credits are consumed by Web Performance testing?'
    ],
    navTarget: 'web_performance',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 14. REPORTS
  {
    id: 'reports',
    feature: 'Reports',
    page: 'Reports',
    route: '/reports',
    purpose: 'Aggregated test execution reports, historical pass/fail trends, duration analytics, and compliance audit exports.',
    overview: 'The Reports module gives QA managers and engineers unified telemetry on all test execution runs, defect densities, automated suite runs, and exportable PDF/Excel summaries.',
    workflows: [
      {
        title: 'Viewing and Exporting Test Reports',
        steps: [
          'Navigate to Reports from the sidebar.',
          'Filter by Project, Test Type (Manual, Automation, API, Performance), or Date Range.',
          'Review the Pass vs. Fail distribution chart.',
          'Click on any execution run to view detailed step-by-step logs and screenshots.',
          'Click "Export Report" to download a formatted PDF, Excel, or CSV report.'
        ]
      }
    ],
    instructions: [
      'Use the date range filter to track sprint-over-sprint quality trends.',
      'Click any failed test in the report to see the failure reason, stack trace, and attached screenshot evidence.'
    ],
    faq: [
      {
        question: 'Can I export reports for stakeholders?',
        answer: 'Yes! You can export executive summaries as PDF or detailed tabular data as Excel/CSV.'
      }
    ],
    commonErrors: [
      {
        error: 'No test runs found for the selected filter',
        cause: 'Date range or filter criteria excluded all recorded runs.',
        solution: 'Broaden the date filter or select "All Test Types".'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Execution run not appearing in reports',
        resolution: 'Ensure the execution finished completely before checking reports; in-progress runs update upon completion.'
      }
    ],
    creditInformation: [
      { action: 'Viewing and Exporting Reports', trialCost: '0 Credits', paidCost: '0 Credits', description: 'Generating and downloading reports is completely free.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can view reports for their assigned projects.' },
      { role: 'Super Admin', access: 'Can view reports across all projects.' }
    ],
    relatedFeatures: ['Dashboard', 'UI Testing', 'API Testing', 'Automation Script Generator'],
    keywords: ['reports', 'execution report', 'test results', 'pass fail', 'audit', 'pdf export', 'analytics'],
    suggestedQuestions: [
      'How do I export a test execution report?',
      'How do I view failed test details and screenshots in Reports?',
      'Do reports consume credits?'
    ],
    navTarget: 'reports',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 15. CREDITS CONSUMPTION & SUBSCRIPTIONS
  {
    id: 'token_consumption',
    feature: 'Credits Consumption',
    page: 'Credits Consumption',
    route: '/credits',
    purpose: 'Real-time project-level credit tracking, consumption audit logs, plan validity management, and subscription upgrade workflows.',
    overview: 'AutomatiQA operates on a transparent Project-Level Credit Pool system. Credits are allocated per project and shared among all assigned members. Features deduct credits for AI Analysis, Copy, and Download actions.',
    workflows: [
      {
        title: 'Reviewing Project Credit Balances and History',
        steps: [
          'Navigate to Credits Consumption from the sidebar.',
          'Review the Active Project Plan card: Total Pool, Used Credits, Remaining Credits, and Validity Expiry Date.',
          'Inspect the "Member Contribution" table to see how much each team member has consumed.',
          'Review the detailed audit log table with timestamps, features, item counts, and action types (Analysis vs Copy/Download).'
        ]
      },
      {
        title: 'Requesting a Subscription / Renewing Credits',
        steps: [
          'If credits are exhausted or expiring, click "Request Paid Subscription" or "Renew Plan".',
          'Fill in the request details and click "Submit Request".',
          'The request is transmitted to the Super Admin.',
          'Once approved by a Super Admin, the project plan is immediately credited with 1,000 credits valid for 30 days.'
        ]
      }
    ],
    instructions: [
      'Trial Plan: 100 credits with 7 days validity.',
      'Paid Plan: 1,000 credits with 30 days validity.',
      'Credits belong to the PROJECT pool; when any member uses AI or exports, it deducts from the project.',
      'Super Admins can directly approve or reject subscription requests from this page.'
    ],
    faq: [
      {
        question: 'Why did my credits decrease when I did not generate anything?',
        answer: 'Credits are shared across all members of the active project. Another team member may have run AI generation or copied/downloaded assets. Check the Member Contribution breakdown table to see exact usage per member.'
      },
      {
        question: 'Are Copy and Download actions charged?',
        answer: 'Yes. Official Copy and Download buttons consume credits according to the feature rules (e.g. 20 credits for User Stories/Scenarios/Cases; 50 credits for Scripts/Performance/UI).'
      },
      {
        question: 'What happens when project credits reach 0?',
        answer: 'AI generation, Copy, and Download actions are blocked until the plan is renewed or upgraded to Paid.'
      }
    ],
    commonErrors: [
      {
        error: 'Project Credit Exhausted: 0 credits remaining',
        cause: 'The active project has used its full allocation.',
        solution: 'Click "Request Paid Subscription" to have a Super Admin grant 1,000 fresh credits.'
      },
      {
        error: 'Subscription Expired',
        cause: 'The plan validity period (7 days for Trial, 30 days for Paid) has passed.',
        solution: 'Click "Renew Plan" to re-activate the project plan.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Subscription request pending for a long time',
        resolution: 'Contact your organization Super Admin (e.g. automatiqa@qaoncloud.com) to approve the request.'
      }
    ],
    creditInformation: [
      { action: 'Trial Plan Allocation', trialCost: '100 Credits Total', paidCost: '-', description: '7 Days validity period.' },
      { action: 'Paid Plan Allocation', trialCost: '-', paidCost: '1,000 Credits Total', description: '30 Days validity period.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can view their active project credit balance and member breakdown.' },
      { role: 'Project Admin', access: 'Can submit subscription requests for their project.' },
      { role: 'Super Admin', access: 'Can approve/reject subscription requests and grant credit top-ups.' }
    ],
    relatedFeatures: ['Projects', 'AI User Stories', 'AI Test Cases', 'Automation Script Generator'],
    keywords: ['credits', 'token consumption', 'credit balance', 'trial plan', 'paid plan', 'subscription', 'renew plan', 'exhausted'],
    suggestedQuestions: [
      'How are credits consumed across AutomatiQA?',
      'Why did my project credits decrease?',
      'How do I request a Paid subscription upgrade?',
      'Who can see project credits?'
    ],
    navTarget: 'token_consumption',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 16. SETTINGS & INTEGRATIONS
  {
    id: 'settings',
    feature: 'Settings & Integrations',
    page: 'Settings',
    route: '/settings',
    purpose: 'Configure external integrations (Jira, GitHub, Slack), set up notification webhooks, and toggle the zero-credit AI Cache.',
    overview: 'The Settings hub connects AutomatiQA with your existing engineering toolchain. Push bugs and test cases directly to Jira, commit scripts to GitHub, send alerts to Slack, and configure AI response caching.',
    workflows: [
      {
        title: 'Configuring Jira Integration',
        steps: [
          'Navigate to Settings -> Jira Integration.',
          'Enter your Jira Domain URL (e.g. https://your-company.atlassian.net).',
          'Provide your Jira account Email and API Token.',
          'Click "Test Connection".',
          'Once connected, you can file bugs and push test cases directly to Jira from any AutomatiQA screen.'
        ]
      },
      {
        title: 'Enabling AI Cache for Zero-Credit Instant Responses',
        steps: [
          'Navigate to Settings -> AI Cache & Performance.',
          'Toggle "Enable AI Semantic Cache" to ON.',
          'Identical or near-identical generation requests will be served from cache instantly with 0 credit deduction.'
        ]
      }
    ],
    instructions: [
      'Jira API tokens can be created in your Atlassian account security settings.',
      'The AI Cache significantly reduces credit consumption during iterative testing.'
    ],
    faq: [
      {
        question: 'Does using cached AI results consume credits?',
        answer: 'No! When a request hits the AI Cache, it consumes 0 credits and returns the synthesized response in under 50 milliseconds.'
      }
    ],
    commonErrors: [
      {
        error: 'Jira authentication failed (401 Unauthorized)',
        cause: 'Invalid Jira API token or email address.',
        solution: 'Generate a new API token from id.atlassian.com/manage-profile/security/api-tokens.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Slack notifications not arriving in channel',
        resolution: 'Ensure the Incoming Webhook URL is valid and the bot has permission to post in the designated channel.'
      }
    ],
    creditInformation: [
      { action: 'Configuring Settings', trialCost: '0 Credits', paidCost: '0 Credits', description: 'Settings configuration is free.' }
    ],
    permissions: [
      { role: 'Admin / Super Admin', access: 'Can configure organizational Jira, GitHub, and Slack integrations.' },
      { role: 'Team Member', access: 'Can view configured integrations and use Jira export.' }
    ],
    relatedFeatures: ['AI Test Cases', 'Automation Script Generator', 'Reports'],
    keywords: ['settings', 'jira', 'github', 'slack', 'ai cache', 'integrations', 'api token', 'webhooks'],
    suggestedQuestions: [
      'How do I connect AutomatiQA to Jira?',
      'How does the AI Cache save project credits?',
      'How do I set up Slack notifications?'
    ],
    navTarget: 'settings_jira',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 17. FOLDERS & TEST ASSET ORGANIZATION
  {
    id: 'folders',
    feature: 'Folders & Organization',
    page: 'Folders',
    route: '/folders',
    purpose: 'Organize user stories, test scenarios, test cases, and scripts into structured, hierarchical project folders.',
    overview: 'Folders in AutomatiQA provide organized test suite structure per project. Save generated items to folders, execute full folder suites in bulk, and filter test cases by module or sprint.',
    workflows: [
      {
        title: 'Saving Assets to a Folder',
        steps: [
          'On any generation page (User Stories, Scenarios, or Test Cases), select items using checkboxes.',
          'Click the "Save to Folder" button.',
          'Select an existing folder from the dropdown or click "+ Create New Folder".',
          'Enter folder name and confirm.',
          'All selected items are linked to that folder and stored permanently in Firestore.'
        ]
      },
      {
        title: 'Executing a Folder Suite',
        steps: [
          'Navigate to Execution Hub -> Manual or Automated Test Cases.',
          'Select the Folder from the folder filter sidebar.',
          'Click "Run Folder Suite" to execute all tests in that folder sequentially.'
        ]
      }
    ],
    instructions: [
      'Folders belong strictly to their parent project.',
      'You can filter by folder in AI Test Cases, Scenarios, and Execution Hub.'
    ],
    faq: [
      {
        question: 'Can I move test cases between folders?',
        answer: 'Yes! Select the test cases, click "Save to Folder", and select the new destination folder.'
      }
    ],
    commonErrors: [
      {
        error: 'Folder name already exists',
        cause: 'A folder with the same name already exists in this project.',
        solution: 'Choose a different name or select the existing folder.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Folder not appearing after saving',
        resolution: 'Refresh the page or switch the folder dropdown to "All Folders" then back to your new folder.'
      }
    ],
    creditInformation: [
      { action: 'Folder Management', trialCost: '0 Credits', paidCost: '0 Credits', description: 'Creating and organizing folders consumes 0 credits.' }
    ],
    permissions: [
      { role: 'All Assigned Members', access: 'Can create folders and organize test assets.' }
    ],
    relatedFeatures: ['AI Test Cases', 'AI Test Scenarios', 'AI User Stories'],
    keywords: ['folder', 'folders', 'save to folder', 'organization', 'test suite', 'bulk save', 'hierarchy'],
    suggestedQuestions: [
      'How do I save test cases to a folder?',
      'How do I create a new folder?',
      'Can I execute all test cases in a folder at once?'
    ],
    navTarget: 'cases',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  },

  // 18. COMMON ERRORS & TROUBLESHOOTING
  {
    id: 'common_errors',
    feature: 'Common Errors & Troubleshooting',
    page: 'Troubleshooting',
    route: '/troubleshooting',
    purpose: 'Comprehensive reference for resolving common AutomatiQA system, permission, network, and credit errors.',
    overview: 'Guidance and immediate resolutions for errors encountered during generation, test execution, folder persistence, or subscription workflows.',
    workflows: [],
    instructions: [],
    faq: [
      {
        question: 'What should I do if generation fails with a credit error?',
        answer: 'Check the Credits Consumption page. If the active project has 0 credits or the subscription has expired, ask a Project Admin to submit a subscription request or renew the plan.'
      },
      {
        question: 'Why do I see "Unauthorized" or "Access Denied"?',
        answer: 'Your user account may not be assigned to the current project or may lack the required role privileges (e.g. only Admins can access Access Control).'
      },
      {
        question: 'Why does copy/cut from keyboard not work on test cases?',
        answer: 'AutomatiQA features a global data protection system to protect proprietary test data. Keyboard shortcuts like Ctrl+C and right-click copy are blocked. Please use the official application [Copy] button provided on the screen.'
      }
    ],
    commonErrors: [
      {
        error: 'Insufficient project credits',
        cause: 'Project credit pool is below the required feature threshold.',
        solution: 'Renew plan or request more credits from Credits Consumption.'
      },
      {
        error: 'Subscription Expired',
        cause: 'Plan validity has lapsed (7 days for Trial, 30 days for Paid).',
        solution: 'Click Renew Plan on the Credits Consumption page.'
      },
      {
        error: 'Please select approved items first',
        cause: 'Downstream generation requires approved prerequisite assets (e.g. approved stories for scenarios, approved scenarios for test cases).',
        solution: 'Toggle the Approval switch on the parent items.'
      }
    ],
    troubleshooting: [
      {
        symptom: 'Clipboard write blocked',
        resolution: 'Use the official on-screen [Copy] button instead of keyboard shortcuts.'
      }
    ],
    creditInformation: [],
    permissions: [
      { role: 'All Users', access: 'Can review troubleshooting guidance.' }
    ],
    relatedFeatures: ['Credits Consumption', 'AI Test Cases', 'Projects'],
    keywords: ['error', 'troubleshooting', 'failed', 'issue', 'problem', 'unauthorized', 'permission', 'copy blocked', 'fix'],
    suggestedQuestions: [
      'Why is keyboard Ctrl+C copying blocked?',
      'What should I do if I get an insufficient credits error?',
      'Why am I getting an Access Denied message?'
    ],
    navTarget: 'token_consumption',
    version: 1,
    active: true,
    updatedAt: '2026-09-12'
  }
];

/**
 * Detect user intent based on query text and context.
 */
export function detectCopilotIntent(query: string): CopilotIntent {
  const q = (query || '').toLowerCase().trim();

  if (q.includes('error') || q.includes('fail') || q.includes('why is') || q.includes('problem') || q.includes('not working') || q.includes('broken')) {
    return 'ERROR_EXPLANATION';
  }
  if (q.includes('credit') || q.includes('token') || q.includes('trial') || q.includes('paid') || q.includes('subscription') || q.includes('renew') || q.includes('exhaust')) {
    return 'CREDIT_INFORMATION';
  }
  if (q.includes('approve') || q.includes('approval')) {
    return 'APPROVAL_HELP';
  }
  if (q.includes('folder') || q.includes('save to')) {
    return 'FOLDER_HELP';
  }
  if (q.includes('copy') || q.includes('clipboard') || q.includes('ctrl+c')) {
    return 'COPY_HELP';
  }
  if (q.includes('download') || q.includes('export') || q.includes('zip') || q.includes('csv') || q.includes('excel')) {
    return 'DOWNLOAD_HELP';
  }
  if (q.includes('generate') || q.includes('create') || q.includes('how to make')) {
    return 'GENERATION_HELP';
  }
  if (q.includes('where is') || q.includes('how do i get to') || q.includes('navigate') || q.includes('open')) {
    return 'NAVIGATION';
  }
  if (q.includes('role') || q.includes('permission') || q.includes('admin') || q.includes('access control') || q.includes('access denied')) {
    return 'PERMISSION_INFORMATION';
  }
  if (q.includes('report') || q.includes('analytics') || q.includes('metric')) {
    return 'REPORT_HELP';
  }
  if (q.includes('project') || q.includes('member')) {
    return 'PROJECT_HELP';
  }
  if (q.startsWith('how') || q.includes('how do i') || q.includes('steps')) {
    return 'HOW_TO';
  }
  if (q.startsWith('what is') || q.includes('tell me about') || q.includes('overview') || q.includes('explain')) {
    return 'FEATURE_EXPLANATION';
  }
  return 'UNKNOWN';
}

/**
 * Maps tab names to active feature knowledge IDs.
 */
export function mapTabToFeatureId(tab: string): string {
  const t = (tab || '').toLowerCase().trim();
  if (t === 'dashboard') return 'dashboard';
  if (t === 'projects') return 'projects';
  if (t === 'user_management') return 'user_management';
  if (t === 'ai_user_generator') return 'ai_user_stories';
  if (t === 'scenarios') return 'ai_scenarios';
  if (t === 'cases' || t === 'manual') return 'ai_test_cases';
  if (t === 'scripts') return 'automation_script';
  if (t === 'record_play') return 'record_play_web';
  if (t === 'mobile_testing') return 'record_play_mobile';
  if (t === 'ui_testing') return 'ui_testing';
  if (t === 'api' || t.startsWith('execution_api')) return 'api_testing';
  if (t === 'performance' || t === 'jmeter_performance' || t === 'functional_performance') return 'api_performance';
  if (t === 'web_performance') return 'web_performance';
  if (t === 'reports') return 'reports';
  if (t === 'token_consumption' || t === 'settings_credits') return 'token_consumption';
  if (t.startsWith('settings')) return 'settings';
  if (t.startsWith('execution')) return 'ai_test_cases';
  return 'dashboard';
}

/**
 * Retrieve the most relevant knowledge documents for a query and context.
 */
export function retrieveRelevantKnowledge(
  query: string,
  currentPage: string,
  currentFeature?: string,
  userRole?: string
): { docs: QACopilotKnowledgeDoc[]; intent: CopilotIntent } {
  const intent = detectCopilotIntent(query);
  const q = (query || '').toLowerCase();
  const activeFeatureId = mapTabToFeatureId(currentPage || currentFeature || '');

  // Score docs
  const scored = QA_COPILOT_KNOWLEDGE_BASE.map(doc => {
    let score = 0;

    // Direct feature match from current page
    if (doc.id === activeFeatureId) {
      score += 35;
    }

    // Name or feature mentioned in query
    if (q.includes(doc.feature.toLowerCase()) || q.includes(doc.page.toLowerCase())) {
      score += 40;
    }

    // Keyword matching
    for (const kw of doc.keywords) {
      if (q.includes(kw.toLowerCase())) {
        score += 15;
      }
    }

    // Intent specific boosting
    if (intent === 'CREDIT_INFORMATION' && doc.id === 'token_consumption') score += 40;
    if (intent === 'PERMISSION_INFORMATION' && doc.id === 'user_management') score += 35;
    if (intent === 'FOLDER_HELP' && doc.id === 'folders') score += 35;
    if (intent === 'REPORT_HELP' && doc.id === 'reports') score += 35;
    if (intent === 'PROJECT_HELP' && doc.id === 'projects') score += 35;
    if (intent === 'ERROR_EXPLANATION' && doc.id === 'common_errors') score += 30;

    // FAQ match
    for (const f of doc.faq) {
      if (q.includes(f.question.toLowerCase().slice(0, 20))) {
        score += 25;
      }
    }

    return { doc, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Return top 2 or 3 records
  const topDocs = scored.filter(s => s.score > 0).slice(0, 3).map(s => s.doc);

  // If no match scored > 0, fallback to current page feature or dashboard
  if (topDocs.length === 0) {
    const fallback = QA_COPILOT_KNOWLEDGE_BASE.find(d => d.id === activeFeatureId) || QA_COPILOT_KNOWLEDGE_BASE[0];
    return { docs: [fallback], intent };
  }

  return { docs: topDocs, intent };
}

/**
 * Get tailored suggested questions based on the active tab/feature.
 */
export function getPageSuggestions(activeTabOrPage: string): string[] {
  const featureId = mapTabToFeatureId(activeTabOrPage);
  const doc = QA_COPILOT_KNOWLEDGE_BASE.find(d => d.id === featureId);
  if (doc && doc.suggestedQuestions.length > 0) {
    return doc.suggestedQuestions;
  }
  return [
    'How do I generate test cases?',
    'How are project credits consumed?',
    'How do I save assets to a folder?',
    'How do I export to Jira?'
  ];
}

/**
 * Build concise, high-signal knowledge context for Gemini prompt injection.
 */
export function buildCopilotPromptContext(
  docs: QACopilotKnowledgeDoc[],
  context: {
    currentPage: string;
    currentRoute: string;
    currentFeature: string;
    userRole: string;
    projectName: string;
    creditInfo?: {
      planType: string;
      remainingCredits: number;
      totalCredits: number;
      status: string;
    };
    lastError?: {
      code?: string;
      message?: string;
    };
  }
): string {
  let contextText = `=== CURRENT APPLICATION CONTEXT ===\n`;
  contextText += `Current Page: ${context.currentPage || 'Unknown'}\n`;
  contextText += `Current Route: ${context.currentRoute || '/'}\n`;
  contextText += `Active Feature: ${context.currentFeature || context.currentPage || 'AutomatiQA'}\n`;
  contextText += `User Role: ${context.userRole || 'Team Member'}\n`;
  contextText += `Active Project: ${context.projectName || 'Default Project'}\n`;

  if (context.creditInfo) {
    contextText += `Project Credit Status: Plan: ${context.creditInfo.planType}, Remaining: ${context.creditInfo.remainingCredits} / ${context.creditInfo.totalCredits}, Status: ${context.creditInfo.status}\n`;
  }

  if (context.lastError && context.lastError.message) {
    contextText += `Recent Application Error: [${context.lastError.code || 'ERROR'}] ${context.lastError.message}\n`;
  }

  contextText += `\n=== VERIFIED AUTOMATIQA KNOWLEDGE ===\n`;
  for (const doc of docs) {
    contextText += `\n--- Feature: ${doc.feature} (${doc.page}) ---\n`;
    contextText += `Purpose: ${doc.purpose}\n`;
    contextText += `Overview: ${doc.overview}\n`;

    if (doc.workflows && doc.workflows.length > 0) {
      contextText += `Workflows:\n`;
      for (const wf of doc.workflows) {
        contextText += `* ${wf.title}:\n`;
        wf.steps.forEach((s, idx) => {
          contextText += `  ${idx + 1}. ${s}\n`;
        });
      }
    }

    if (doc.creditInformation && doc.creditInformation.length > 0) {
      contextText += `Credit Rules:\n`;
      for (const cr of doc.creditInformation) {
        contextText += `* ${cr.action}: Trial ${cr.trialCost} | Paid ${cr.paidCost} (${cr.description})\n`;
      }
    }

    if (doc.commonErrors && doc.commonErrors.length > 0) {
      contextText += `Common Errors:\n`;
      for (const err of doc.commonErrors) {
        contextText += `* Error: "${err.error}" -> Cause: ${err.cause} -> Solution: ${err.solution}\n`;
      }
    }

    if (doc.faq && doc.faq.length > 0) {
      contextText += `Key FAQs:\n`;
      for (const f of doc.faq) {
        contextText += `* Q: ${f.question}\n  A: ${f.answer}\n`;
      }
    }

    if (doc.navTarget) {
      contextText += `Navigation Target Key: "${doc.navTarget}"\n`;
    }
  }

  return contextText;
}

/**
 * Detect which AutomatiQA tab is referenced in an answer to provide a navigation action button.
 */
export function extractNavigationTarget(text: string): { label: string; tab: string } | null {
  const lower = (text || '').toLowerCase();
  
  if (lower.includes('open ai test cases') || lower.includes('go to ai test cases') || lower.includes('navigate to ai test cases')) {
    return { label: 'Open AI Test Cases', tab: 'cases' };
  }
  if (lower.includes('open ai test scenarios') || lower.includes('go to ai test scenarios') || lower.includes('navigate to ai test scenarios')) {
    return { label: 'Open AI Test Scenarios', tab: 'scenarios' };
  }
  if (lower.includes('open ai user stories') || lower.includes('go to ai user stories') || lower.includes('navigate to ai user stories')) {
    return { label: 'Open AI User Stories', tab: 'ai_user_generator' };
  }
  if (lower.includes('open script generator') || lower.includes('go to script generator') || lower.includes('open automation script')) {
    return { label: 'Open Script Generator', tab: 'scripts' };
  }
  if (lower.includes('open record & play') || lower.includes('open web recording')) {
    return { label: 'Open Record & Play Web', tab: 'record_play' };
  }
  if (lower.includes('open mobile testing') || lower.includes('open mobile app')) {
    return { label: 'Open Mobile Testing', tab: 'mobile_testing' };
  }
  if (lower.includes('open ui testing') || lower.includes('go to ui testing')) {
    return { label: 'Open UI Testing', tab: 'ui_testing' };
  }
  if (lower.includes('open api testing') || lower.includes('go to api testing')) {
    return { label: 'Open API Testing', tab: 'api' };
  }
  if (lower.includes('open api performance') || lower.includes('open jmeter')) {
    return { label: 'Open API Performance', tab: 'performance' };
  }
  if (lower.includes('open web performance')) {
    return { label: 'Open Web Performance', tab: 'web_performance' };
  }
  if (lower.includes('open credits') || lower.includes('go to credits') || lower.includes('open credits consumption')) {
    return { label: 'Open Credits Consumption', tab: 'token_consumption' };
  }
  if (lower.includes('open reports') || lower.includes('go to reports')) {
    return { label: 'Open Reports', tab: 'reports' };
  }
  if (lower.includes('open access control') || lower.includes('go to user management')) {
    return { label: 'Open Access Control', tab: 'user_management' };
  }
  if (lower.includes('open projects') || lower.includes('go to projects')) {
    return { label: 'Open Projects', tab: 'projects' };
  }
  if (lower.includes('open settings') || lower.includes('open jira settings')) {
    return { label: 'Open Jira Settings', tab: 'settings_jira' };
  }

  return null;
}
