export enum TestStatus {
  PASS = 'PASS',
  FAIL = 'FAIL',
  BLOCKED = 'BLOCKED',
  DEFERRED = 'DEFERRED',
  PENDING = 'NOT EXECUTED',
  NOT_EXECUTED = 'NOT EXECUTED',
  NOT_STARTED = 'NOT STARTED',
  DELETED = 'DELETED'
}

export enum TestType {
  FUNCTIONAL = 'Functional',
  NON_FUNCTIONAL = 'Non-Functional',
  UI = 'UI'
}

export enum TestIntent {
  POSITIVE = 'Positive',
  NEGATIVE = 'Negative'
}

export enum TestPriority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low'
}

export enum UserRole {
  SUPER_ADMIN = 'Super Admin',
  ADMIN = 'Admin',
  DELIVERY_MANAGER = 'Delivery Manager',
  SPOC = 'Spoc',
  TEAM_MEMBER = 'Team Member'
}

export enum NotificationType {
  USER_SIGNUP = 'USER_SIGNUP',
  PROJECT_ASSIGNMENT = 'PROJECT_ASSIGNMENT',
  ROLE_UPDATE = 'ROLE_UPDATE',
  PROJECT_CREATION = 'PROJECT_CREATION',
  SYSTEM = 'SYSTEM',
  SUBSCRIPTION_REQUEST = 'SUBSCRIPTION_REQUEST',
  SUBSCRIPTION_APPROVED = 'SUBSCRIPTION_APPROVED'
}

export interface SubscriptionRequest {
  id: string;
  userEmail: string;
  userName: string;
  projectId?: string;
  projectName?: string;
  requestedByUserId?: string;
  requestedByUserEmail?: string;
  planRequested?: 'paid' | 'Paid' | 'trial' | 'Trial';
  currentPlan?: 'Trial' | 'Paid';
  requestedAt: number;
  requestedDateFormatted: string;
  requestedAtFormatted?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'pending' | 'approved' | 'rejected';
  creditsRequested?: number;
  requestedCredits?: number;
  creditsGranted?: number;
  validityDays?: number;
  currentUsedCredits?: number;
  planName?: string;
  approvedAt?: number;
  approvedBy?: string;
  rejectedAt?: number;
  rejectedBy?: string;
  rejectionReason?: string;
  notes?: string;
}

export interface AppNotification {
  id: string;
  recipientEmail: string;
  senderName: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  timestamp: string;
  projectId?: string;
}

export interface User {
  email: string;
  name: string;
  token?: string;
  role?: UserRole;
  assignedProjectIds?: string[];
  status?: string;
  createdAt?: string;
}

export interface ActivityLog {
  id: string;
  userName: string;
  userEmail: string;
  action: string;
  projectId: string;
  projectName: string;
  timestamp: string; // ISO format
}

export interface TestCase {
  id: string;
  testCaseId?: string; // Automatically generated unique ID
  userStoryId?: string; // Inherited parent User Story Number
  title: string;
  description?: string;
  steps: string[];
  expectedResult: string;
  actualResult?: string;
  comments?: string;
  status: TestStatus;
  notes?: string;
  executedAt?: string;
  isApproved?: boolean;
  evidence?: string;
  videoEvidence?: string;
  testType?: TestType;
  testIntent?: TestIntent;
  priority?: TestPriority;
  testData?: string;
  testDataSets?: string[]; // Added to support multiple structured sets
  attachments?: string[]; // Multiple base64 strings/URLs (Images/Videos)
  links?: string[]; // Multiple reference URLs
  source?: string;
  scenarioId?: string;
  isManual?: boolean;
  isUploaded?: boolean;
  scriptGeneratorFolderId?: string;
  scriptGeneratorFolderName?: string;
}

export interface TestScenario {
  id: string;
  scenarioId: string; // TS-001, etc.
  title: string;
  type: 'Functional' | 'Non-functional';
  description: string;
  expectedResults: string;
  isApproved: boolean;
  status?: TestStatus;
  testCases: TestCase[];
  moduleName: string;
  batchId?: string;
  createdAt?: string;
  updatedAt?: string;
  memberScenarioIds?: string[];
  appUrl?: string;
  username?: string;
  password?: string;
  isRemovedFromIndividual?: boolean; // Flag to hide from individual list while keeping in folders
  testCaseFolderId?: string; // Links scenario to a test case folder in AI Test Cases
  folderId?: string;
  folderName?: string;
  saved?: boolean;
  priority?: 'High' | 'Medium' | 'Low' | string;
  tags?: string[];
  scenarioCategory?: 'Positive' | 'Negative' | 'Edge' | string;
  isFolder?: boolean;
  folderType?: 'scenario' | 'testcase' | 'manual' | string;
  userStoryNumber?: string;
  userStorySummary?: string;
  userStoryId?: string;
  isApiScenario?: boolean;
  attachments?: string[];
  docContent?: string;
  docFileName?: string;
  videoFileName?: string;
  videoFrames?: any[];
  videoDuration?: number;
  videoUrl?: string;
  videoSize?: number;
}

export interface AutomationScriptFile {
  path: string;
  content: string;
}

export interface AutomationScript {
  id: string;
  content: string;
  files?: AutomationScriptFile[];
  tool: AutomationTool;
  language: ProgrammingLanguage;
  framework?: string;
  testCaseIds?: string[];
  testCaseTitles?: string[];
  testCases?: TestCase[];
  createdAt: string;
  lastExecutionStatus?: 'SUCCESS' | 'FAILURE' | 'RUNNING' | TestStatus;
  lastExecutedAt?: string;
  executionLogs?: string[];
  evidence?: string;
  evidenceUrl?: string;
  attachments?: string[];
  links?: string[];
  comments?: string;
  isApproved?: boolean;
  appPackage?: string;
  appUrl?: string;
  title?: string;
  description?: string;
  folderId?: string;
  folderName?: string;
  scenarioId?: string;
  scenarioTitle?: string;
  lastExecutionNotes?: string;
  contextImages?: string[];
  videoFileName?: string;
  videoFlowId?: string;
  videoUrl?: string;
  videoDuration?: number;
  videoFrames?: any[];
  thumbnailUrl?: string;
  posterUrl?: string;
  source?: 'record_play' | 'script_generator' | 'mobile_app' | 'upload_video';
  platform?: 'web' | 'mobile';
  flowId?: string;
  flowName?: string;
  isImported?: boolean;
  isSaved?: boolean;
  lastRefinementSummary?: string;
  refinedFilePaths?: string[];
  deletedFilePaths?: string[];
  lastRefinedAt?: string;
}

export interface PerformanceScript {
  id: string;
  name: string;
  scenarios: any[];
  jmxContent: string;
  csvData?: string;
  analysisReport?: string;
  trendData?: string; // Stores stringified graph telemetry
  createdAt: string;
  itemResults?: Record<string, TestStatus>; // Restored for granular tracking
  statusUpdateTimestamps?: Record<string, string>; // Tracks when each item status was last updated
  folderId?: string;
  folderName?: string;
}

export interface ApiRequestHeader {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  time: number;
  size: number;
  data: any;
  headers: Record<string, string>;
  testResults?: { name: string; passed: boolean; error?: string }[];
}

export interface ApiAuth {
  type: 'noauth' | 'bearer' | 'basic' | 'apikey' | 'oauth1' | 'oauth2';
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  apiKeyKey?: string;
  apiKeyValue?: string;
  apiKeyLocation?: 'header' | 'query';
  oauth1ConsumerKey?: string;
  oauth1ConsumerSecret?: string;
  oauth1Token?: string;
  oauth1TokenSecret?: string;
  oauth2AccessToken?: string;
  oauth2HeaderPrefix?: string;
  oauth2AddTokenTo?: 'header' | 'query';
}

export interface ApiRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers: ApiRequestHeader[];
  params: ApiRequestHeader[];
  bodyType: 'none' | 'form-data' | 'raw';
  body: string;
  formData?: ApiRequestHeader[];
  rawLanguage?: 'JSON' | 'Text' | 'HTML' | 'XML' | 'JavaScript';
  auth?: ApiAuth;
  preRequestScript?: string;
  postResponseScript?: string;
  name?: string;
  scenarioTitle?: string;
  description?: string;
  expectedResults?: string;
  refineInstructions?: string;
  savedResponse?: ApiResponse;
  createdAt?: string;
}

export interface ApiFolder {
  id: string;
  name: string;
  requests: ApiRequest[];
  isOpen?: boolean;
}

export interface ApiCollection {
  id: string;
  name: string;
  requests: ApiRequest[];
  folders?: ApiFolder[];
  isOpen?: boolean;
}

export interface ApiWorkspace {
  id: string;
  name: string;
  requests: ApiRequest[];
  collections: ApiCollection[];
  createdAt: string;
  isOpen?: boolean;
}

export interface ApiTestSuiteEvidence {
  comment?: string;
  links?: string[]; // Renamed from link to links for consistency and array support
  attachments?: string[];
}

export interface ApiTestSuite {
  id: string;
  name: string;
  targetFolderId: string;
  targetFolderName: string;
  status: 'In Progress' | 'Completed' | 'Blocked' | 'Not Started';
  lastRun?: string;
  evidence?: ApiTestSuiteEvidence;
  scenarioResults?: Record<string, { status: string, evidence?: ApiTestSuiteEvidence }>;
}

export interface Locator {
  id: string;
  name: string;
  strategy: 'getByRole' | 'getByText' | 'getByLabel' | 'getByTestId' | 'id' | 'css' | 'xpath';
  value: string;
  description?: string;
}

export type RequirementFormatType = 'text' | 'document' | 'screenshot' | 'video';

export interface StandardRequirementData {
  type: RequirementFormatType;
  text: string;
  document?: {
    name: string;
    size: string;
    content: string;
    type?: string;
  } | null;
  image?: {
    name: string;
    size: string;
    dataUrl: string;
    type?: string;
  } | null;
  video?: {
    name: string;
    size: string;
    url?: string;
    frames: { timestamp: string; image: string }[];
  } | null;
}

export interface UITestingInput {
  id: string;
  appName?: string;
  name: string;
  screenshots: string[];
  appUrl: string;
  designLink: string;
  promptInputs?: string;
  companyStandards?: string;
  standardRequirement?: StandardRequirementData;
  timestamp: string;
  folderId?: string;
  docs?: { name: string; content: string }[];
  videos?: { id: string; name: string; url?: string; blob?: any; dataUrl?: string; size?: string; type?: string; frames: { timestamp: string; image: string }[] }[];
}

export interface UITestingReport {
  id: string;
  appName?: string;
  name: string;
  report: string;
  highlightedScreenshots: string[];
  visualDefectsScreenshots?: string[];
  correctedReport: string | null;
  correctedImage?: string | null;
  correctedScreenshots?: Array<{ id: string; pageTitle: string; originalImage: string; correctedImage: string }>;
  screenshots?: string[];
  appUrl?: string;
  companyStandards?: string;
  standardRequirement?: StandardRequirementData;
  docs?: { name: string; content: string }[];
  videos?: { id: string; name: string; url?: string; blob?: any; dataUrl?: string; size?: string; type?: string; frames: { timestamp: string; image: string }[] }[];
  category?: 'APP UI REVIEW' | 'FIGMA DESIGN REVIEW' | 'FIGMA VS COMPARISON' | string;
  timestamp: string;
  folderId?: string;
  inputId?: string;
}

export interface UITestingFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface FigmaDesignReview {
  id: string;
  appName?: string;
  name: string;
  images?: string[];
  docs?: { name: string; content: string }[];
  figmaUrl?: string;
  companyStandards?: string;
  standardRequirement?: StandardRequirementData;
  analysisReport: string;
  highlightedScreenshots?: string[];
  visualDefectsScreenshots?: string[];
  correctedReport?: string | null;
  correctedImage?: string | null;
  timestamp: string;
  folderId?: string;
}

export interface UIComparisonReport {
  id: string;
  appName?: string;
  name: string;
  appScreenshots?: string[];
  appUrl?: string;
  appVideos?: { id: string; name: string; url?: string; blob?: any; dataUrl?: string; size?: string; type?: string; frames: { timestamp: string; image: string }[] }[];
  figmaImages?: string[];
  figmaDocs?: { name: string; content: string }[];
  figmaUrl?: string;
  companyStandards?: string;
  standardRequirement?: StandardRequirementData;
  comparisonReport: string;
  highlightedScreenshots?: string[];
  visualDefectsScreenshots?: string[];
  resolutionGuide?: string | null;
  correctedImage?: string | null;
  timestamp: string;
  folderId?: string;
}

export type LaunchDiagnosticCode =
  | 'NETWORK_ERROR'
  | 'DNS_ERROR'
  | 'TIMEOUT'
  | 'SSL_CERTIFICATE_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'BROWSER_PERMISSION_REQUIRED'
  | 'POPUP_BLOCKED'
  | 'NEW_WINDOW_BLOCKED'
  | 'REDIRECT_FAILURE'
  | 'IFRAME_CONTENT'
  | 'MIXED_CONTENT'
  | 'PAGE_CRASH'
  | 'UNSUPPORTED_BROWSER_FEATURE'
  | 'UNKNOWN_ERROR';

export interface LaunchDiagnostic {
  code: LaunchDiagnosticCode;
  title: string;
  message: string;
  details?: string;
  suggestedAction?: string;
  targetUrl?: string;
  timestamp: number;
  recoverable?: boolean;
  permissions?: string[];
}

export interface BrowserPermissionRequest {
  sessionId: string;
  permissions: Array<'camera' | 'microphone' | 'geolocation' | 'notifications' | 'clipboard' | 'downloads' | 'popups' | string>;
  origin: string;
  reason?: string;
  timestamp: number;
}

export interface FrameInfo {
  frameId?: string;
  frameName?: string;
  frameUrl?: string;
  frameSelector?: string;
  isIframe?: boolean;
}

export interface StructuredLocatorEvidence {
  tagName: string;
  id?: string;
  className?: string;
  name?: string;
  role?: string;
  accessibleName?: string;
  placeholder?: string;
  type?: string;
  href?: string;
  text?: string;
  fullText?: string;
  normalizedText?: string;
  dataTestId?: string;
  outerHTML?: string;
  attributes?: Record<string, string>;
  ancestorInfo?: string;
  domPath?: string;
}

export interface StructuredLocator {
  strategy: 'testid' | 'id' | 'role' | 'label' | 'placeholder' | 'name' | 'href' | 'attribute' | 'scope' | 'text' | 'css' | 'xpath';
  role?: string;
  name?: string;
  exact?: boolean;
  scope?: string | null;
  scopeStrategy?: string;
  scopeValue?: string;
  childStrategy?: string;
  childValue?: string;
  nthIndex?: number | null;
  matchCount?: number;
  frameChain?: string[];
  shadowPath?: string[];
  value?: string;
  evidence?: StructuredLocatorEvidence;
}

export interface StepLocator {
  type: 'id' | 'name' | 'role' | 'text' | 'css' | 'xpath' | 'accessibility-id' | 'resource-id' | 'content-desc' | 'data-testid' | 'placeholder' | 'url' | 'shadow-pierce' | 'scope';
  value: string;
  playwright?: string;
  structuredLocator?: StructuredLocator;
}

export interface UniversalLocator {
  primary: StepLocator;
  alternatives: StepLocator[];
  fallbacks?: Array<string | { type: string; value: string }>;
  scopedLocator?: string;
  structuredLocator?: StructuredLocator;
}

export interface RecordedStep {
  id: string;
  action: 'click' | 'dblclick' | 'type' | 'fill' | 'select' | 'selectOption' | 'check' | 'uncheck' | 'hover' | 'scroll' | 'swipe' | 'long_press' | 'drag' | 'drop' | 'assertion' | 'navigate' | 'wait' | 'press' | 'upload' | 'focus' | 'blur' | 'visibility' | 'submit' | 'dialog' | 'open_tab' | 'close_tab' | 'switch_tab' | 'shortcut';
  locator: UniversalLocator;
  structuredLocator?: StructuredLocator;
  elementName?: string;
  value?: string;
  url?: string;
  expectedUrl?: string;
  expectedOrigin?: string;
  pageId?: string | number;
  tabId?: string | number;
  frameUrl?: string;
  scopedLocator?: string;
  screen: string;
  platform: 'web' | 'mobile';
  timestamp: number;
  /** Server-assigned order within a recording session. Playback must use this, never wall-clock time. */
  sequenceNumber?: number;
  /** Audit metadata only; it is deliberately not used as a playback delay. */
  recordedAt?: string;
  relativeTime?: number;
  sessionId?: string;
  skipped?: boolean;
  screenshot?: string;
  contextImage?: string;
  state?: string;
  masked?: boolean;
  placeholder?: string;
  originalValue?: string;
  x?: number;
  y?: number;
  viewportX?: number;
  viewportY?: number;
  recordedViewport?: { width: number; height: number };
  warning?: string;
  coordinates?: { x: number; y: number };
  targetBox?: { x: number; y: number; width: number; height: number };
  frameInfo?: FrameInfo;
  pageIndex?: number;
  tabTitle?: string;
  deltaX?: number;
  deltaY?: number;
  scrollX?: number;
  scrollY?: number;
  keyCombo?: string;
}

export interface RecordedFlow {
  id: string;
  name: string;
  description?: string;
  refineInstructions?: string;
  steps: RecordedStep[];
  createdAt: string;
  isApproved: boolean;
  folderId?: string;
  folderName?: string;
  platform: 'web' | 'mobile';
  recordingMode?: 'manual' | 'extension' | 'codegen' | 'in-app';
  videoUrl?: string;
  initialUrl?: string;
  screenshots?: string[];
  mobilePackageName?: string;
  mobileAppName?: string;
  stepScreenshots?: Record<string, string>;
  generatedScript?: string;
  scriptFiles?: AutomationScriptFile[];
  scriptId?: string;
  tool?: AutomationTool;
  language?: ProgrammingLanguage;
  framework?: string;
  generatedProject?: {
    files: AutomationScriptFile[];
    explanation?: string;
  };
}

export interface UploadVideoFlow {
  id: string;
  name: string;
  description?: string;
  videoUrl?: string;
  inputVideoUrl?: string;
  videoFileName?: string;
  videoDuration?: number;
  steps: RecordedStep[];
  generatedScript?: string;
  scriptFiles?: AutomationScriptFile[];
  tool: AutomationTool;
  language: ProgrammingLanguage;
  framework?: string;
  targetUrl?: string;
  createdAt: string;
  isApproved: boolean; // Review & Approval toggle
  folderId?: string;
  folderName?: string;
  platform: 'web' | 'mobile';
  hasDataDriven?: boolean;
  thumbnailUrl?: string;
  posterUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'Active' | 'Inactive';
  ownerEmail: string;
  ownerName?: string;
  allocatedUserEmails?: string[];
  projectRoles?: Record<string, 'Admin' | 'Team Member'>;
  scenarios: TestScenario[];
  manualTestCases?: TestCase[];
  automationScripts: AutomationScript[];
  performanceScripts?: PerformanceScript[];
  apiHistory?: ApiRequest[];
  apiWorkspaces?: ApiWorkspace[];
  apiTestSuites?: ApiTestSuite[];
  apiScenarios?: TestScenario[];
  automationExecutionIds?: string[];
  automationFolders?: { id: string; name: string; description?: string; isImported?: boolean; type?: 'flow' | 'script' | 'script_generator' | 'upload_video'; platform?: 'web' | 'mobile' }[];
  importedPerformanceArtifactIds?: string[]; // Restored for execution hub persistence
  excludedFromExecutionIds?: string[]; // Tracks items hidden ONLY in Manual Test Case Execution
  activeExecutionFolderIds?: string[]; // Tracks folders added to execution hub via "Run Folder"
  scenarioModuleMapping?: Record<string, string>; // Tracks AI scenario to Base Module mapping
  locators?: Locator[];
  uiTestingInputs?: UITestingInput[];
  uiTestingReports?: UITestingReport[];
  uiTestingFolders?: UITestingFolder[];
  figmaDesignReviews?: FigmaDesignReview[];
  uiComparisonReports?: UIComparisonReport[];
  recordedFlows?: RecordedFlow[];
  uploadVideoFlows?: UploadVideoFlow[];
  syntheticUsers?: SyntheticUser[];
  userStories?: UserStory[];
  lastUserStoryIdSeq?: number;
  createdAt: string;
  appUrl?: string;
  url?: string;
  jiraConfig?: {
    jiraUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
  };
  githubConfig?: {
    repositoryOwner: string;
    repositoryName: string;
    personalAccessToken: string;
    branchName: string;
  };
  slackConfig?: {
    workspaceName: string;
    channelName: string;
    webhookUrl?: string;
    botToken?: string;
    enabled: boolean;
  };
  deletedItemIds?: string[];
}

export interface SyntheticUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  status: 'Active' | 'Inactive' | 'Pending';
  credentials?: {
    username?: string;
    password?: string;
    apiToken?: string;
  };
  notes?: string;
  createdAt: string;
  customAttributes?: { key: string; value: string }[];
}

export type AutomationTool = 
  | 'Playwright' 
  | 'Playwright (BDD/Cucumber)' 
  | 'Cucumber (BDD)' 
  | 'Selenium' 
  | 'Selenium (BDD/Cucumber)' 
  | 'Cypress' 
  | 'Cypress (BDD/Cucumber)' 
  | 'Appium'
  | 'Puppeteer'
  | 'RestAssured (API)'
  | string;
export type ProgrammingLanguage = 'TypeScript' | 'JavaScript' | 'Python' | 'Java' | 'C#' | string;

export interface ScriptConfig {
  tool: AutomationTool;
  language: ProgrammingLanguage;
}

export interface UserStory {
  id: string;
  summary: string;
  description: string;
  acceptanceCriteria: string;
  createdAt: string;
  updatedAt?: string;
  storyId?: string; // US-001, USERSTORY_FOLDER, INPUT_SOURCE, etc.
  folderId?: string;
  parentFolderId?: string;
  memberStoryIds?: string[];
  isRemovedFromIndividual?: boolean;
  userStoryId?: string;
  attachments?: string[];
  screenshots?: any[];
  fileTextContent?: string;
  fileBase64?: string;
  fileName?: string;
}

export type VectorDistanceMetric = 'cosine' | 'euclidean' | 'dotProduct';

export interface RagChunk {
  id: string;
  projectId?: string;
  projectName?: string;
  title: string;
  content: string;
  chunkIndex?: number;
  embedding: number[];
  vectorDimension: number;
  metadata: {
    type: 'scenario' | 'testcase' | 'userstory' | 'requirement' | 'doc' | 'bug' | 'custom';
    source?: string;
    tags?: string[];
    author?: string;
    targetUrl?: string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface VectorSearchResult {
  chunk: RagChunk;
  similarityScore: number; // 0.0 to 1.0 (or percentage)
  distance: number;
  metricUsed: VectorDistanceMetric;
}

export interface RagFeasibilityStatus {
  isImplemented: boolean;
  firestoreConnected: boolean;
  databaseId: string;
  vectorIndexCollection: string;
  indexedCount: number;
  vectorDimension: number;
  embeddingModel: string;
  embeddingApiStatus: 'active' | 'fallback' | 'offline';
  averageSearchLatencyMs: number;
  lastDiagnosticTimestamp: string;
  diagnosticChecks: {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
    latencyMs: number;
  }[];
}

export interface TokenLog {
  id: string;
  transactionId?: string;
  operationId?: string;
  action?: string;
  date: string;
  timestamp: number;
  user: string;
  userEmail?: string;
  workspace?: string;
  project: string;
  projectId?: string;
  userId?: string;
  planType?: 'Trial' | 'Paid';
  cycleStartTimestamp?: number;
  cycleStartDateFormatted?: string;
  cycleEndTimestamp?: number;
  cycleEndDateFormatted?: string;
  remainingCreditsAfter?: number;
  actionType?: 'analysis' | 'export' | 'copy' | 'download' | string;
  userStoryId?: string;
  feature: string;
  inputModality?: 'Text' | 'Screenshot' | 'Video' | 'Document' | 'URL' | 'Multimodal';
  inputModalityDetails?: string;
  inputCount?: number;
  tier?: 'Small' | 'Medium' | 'High';
  outputType?: string;
  itemsGenerated?: number;
  creditsConsumed?: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  responseTimeSeconds: number;
  cached: boolean;
}

export type PlanType = 'Trial' | 'Paid';

export interface ProjectPlan {
  projectId: string;
  projectName: string;
  planType: PlanType;
  creditPlan?: 'trial' | 'paid' | 'Trial' | 'Paid';
  allocatedCredits: number; // 200 for Trial, 1000 for Paid
  totalCredits?: number; // 200 for Trial, 1000 for Paid
  remainingCredits?: number;
  consumedCredits?: number;
  validityDays: number; // 7 for Trial, 30 for Paid
  cycleStartTimestamp: number;
  cycleStartDateFormatted: string;
  subscriptionStartDate?: number;
  cycleEndTimestamp: number;
  cycleEndDateFormatted: string;
  subscriptionExpiryDate?: number;
  status: 'active' | 'expired' | 'exhausted' | 'pending' | 'disabled';
  subscriptionStatus?: 'active' | 'exhausted' | 'expired' | 'pending' | 'disabled';
  subscriptionRequestStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  lastRenewedAt?: number;
  lastRenewedBy?: string;
}

export interface ProjectMemberCreditContribution {
  userEmail: string;
  userName: string;
  consumedCredits: number;
  percentageOfProjectUsed: number;
  generationsCount: number;
  lifetimeConsumed: number;
  lastActivity?: string;
}

export interface ProjectCreditSummary {
  projectId: string;
  projectName: string;
  planType: PlanType;
  totalPool: number; // 200 or 1,000
  validityDays: number;
  usedCredits: number; // strictly MIN(actualCurrentCycleRaw, totalPool)
  remainingCredits: number; // MAX(totalPool - usedCredits, 0)
  percentageUsed: number; // MIN((usedCredits / totalPool) * 100, 100)
  actualCurrentCycleRaw: number;
  historicalLifetimeUsed: number; // uncapped lifetime sum across all cycles
  isExpired: boolean;
  isGated: boolean; // remainingCredits <= 0 || isExpired
  daysRemaining: number;
  daysElapsed: number;
  cycleStartTimestamp: number;
  cycleStartDateFormatted: string;
  cycleEndTimestamp: number;
  cycleEndDateFormatted: string;
  memberBreakdown: ProjectMemberCreditContribution[];
}

export interface FeaturePricingRate {
  feature: string;
  model: string;
  inputCostPer1K: number;
  outputCostPer1K: number;
  cachedInputCostPer1K: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgCostPerCallUsd: number;
  inputTypes?: string[];
  outputType?: string;
  description: string;
}

// Helpers to identify API testing scenarios and test cases across the application
export const isApiTestingScenario = (s: any): boolean => {
  if (!s) return false;
  if (s.isApiScenario) return true;
  if (s.moduleName === 'API Testing') return true;
  if (typeof s.moduleName === 'string' && s.moduleName.toLowerCase().trim() === 'api testing') return true;
  if (typeof s.scenarioId === 'string' && (s.scenarioId.startsWith('API-') || s.scenarioId.startsWith('TS-API-') || s.scenarioId.startsWith('API_') || s.scenarioId.includes('-API-'))) return true;
  if (typeof s.id === 'string' && (s.id.startsWith('api-') || s.id.startsWith('api_') || s.id.startsWith('API-') || s.id.includes('_api_'))) return true;
  if (typeof s.folderName === 'string' && s.folderName.toLowerCase().includes('ai scenarios -')) return true;
  if (s.appUrl && typeof s.description === 'string' && (s.description.startsWith('[GET ') || s.description.startsWith('[POST ') || s.description.startsWith('[PUT ') || s.description.startsWith('[DELETE ') || s.description.startsWith('[PATCH '))) return true;
  return false;
};

export const isApiTestingCase = (tc: any): boolean => {
  if (!tc) return false;
  if (tc.isManual || tc.isUploaded) return false;
  if (tc.isApiCase || tc.isApiScenario) return true;
  if (tc.moduleName === 'API Testing' || (typeof tc.moduleName === 'string' && tc.moduleName.toLowerCase().trim() === 'api testing')) return true;
  if (typeof tc.testCaseId === 'string' && (tc.testCaseId.startsWith('API-') || tc.testCaseId.startsWith('TC-API-') || tc.testCaseId.startsWith('TC-api-'))) return true;
  if (typeof tc.id === 'string' && (tc.id.startsWith('API-') || tc.id.startsWith('tc_approved_API-') || tc.id.includes('_api_') || tc.id.startsWith('api-'))) return true;
  if (tc.scenarioId && (tc.scenarioId.startsWith('API-') || tc.scenarioId.startsWith('api-'))) return true;
  return false;
};

