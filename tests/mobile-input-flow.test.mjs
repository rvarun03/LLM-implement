import assert from 'node:assert';
import { 
  formatMobileStepDescription, 
  validateMobileStep, 
  optimizeMobileStepSequence,
  convertMobileStepsToAppiumCode 
} from '../utils/mobileRecordingSteps.ts';

console.log('🧪 Running Mobile Input Flow Unit Tests...');

// Test 1: Step formatting
const sampleStep = {
  id: 'step_1',
  action: 'click',
  elementName: 'Login Button',
  locator: {
    primary: { type: 'accessibility-id', value: 'btn_login' },
    alternatives: []
  },
  screen: 'Login Screen',
  platform: 'mobile',
  timestamp: Date.now()
};

const desc = formatMobileStepDescription(sampleStep);
assert.strictEqual(desc, 'Tap on "Login Button"', 'Format description should match tap text');

// Test 2: Step validation
const validRes = validateMobileStep(sampleStep);
assert.strictEqual(validRes.valid, true, 'Sample step should be valid');

const invalidStep = { id: 'invalid', action: 'click', platform: 'mobile', timestamp: Date.now() };
const invalidRes = validateMobileStep(invalidStep);
assert.strictEqual(invalidRes.valid, false, 'Step without locator or coordinates should be invalid');

// Test 3: Step optimization
const rawSteps = [
  { ...sampleStep, id: '1', action: 'type', value: 'u', locator: { primary: { type: 'resource-id', value: 'username' }, alternatives: [] } },
  { ...sampleStep, id: '2', action: 'type', value: 'user', locator: { primary: { type: 'resource-id', value: 'username' }, alternatives: [] } },
  { ...sampleStep, id: '3', action: 'type', value: 'username123', locator: { primary: { type: 'resource-id', value: 'username' }, alternatives: [] } }
];

const optimized = optimizeMobileStepSequence(rawSteps);
assert.strictEqual(optimized.length, 1, 'Consecutive type actions on same element should collapse into 1 step');
assert.strictEqual(optimized[0].value, 'username123', 'Collapsed step should hold latest full input value');

// Test 4: Appium Code Conversion
const generatedCode = convertMobileStepsToAppiumCode(optimized, 'com.test.app', '.MainActivity');
assert.ok(generatedCode.includes('com.test.app'), 'Appium script should contain target app package');
assert.ok(generatedCode.includes('setValue'), 'Appium script should include setValue method');

console.log('✅ All Mobile Input Flow tests passed successfully!');
