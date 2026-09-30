import assert from 'node:assert';
import { resolveStepTargetMetrics } from '../components/locatorGeometry.ts';

console.log('🧪 Running Locator Engine Unit Tests...');

// Test 1: Step object with targetBox
const mockStep = {
  id: 'step_101',
  action: 'click',
  elementName: 'Submit Button',
  targetBox: { x: 20, y: 30, width: 40, height: 10 },
  coordinates: { x: 40, y: 35 },
  locator: {
    primary: { type: 'accessibility-id', value: 'btn_submit' },
    alternatives: []
  },
  screen: 'Checkout Screen',
  platform: 'mobile',
  timestamp: Date.now()
};

const metrics = resolveStepTargetMetrics(mockStep, 0, 1, 'mobile');

assert.ok(metrics, 'Metrics should be successfully calculated');
assert.strictEqual(metrics.targetBox.x, 20, 'Target box X should match');
assert.strictEqual(metrics.targetBox.y, 30, 'Target box Y should match');
assert.strictEqual(metrics.coordinates.x, 40, 'Center coordinate X should match');
assert.strictEqual(metrics.coordinates.y, 35, 'Center coordinate Y should match');

// Test 2: Fallback step without targetBox
const fallbackStep = {
  id: 'step_102',
  action: 'type',
  elementName: 'Email Input',
  value: 'test@example.com',
  coordinates: { x: 50, y: 60 },
  platform: 'mobile',
  timestamp: Date.now()
};

const fallbackMetrics = resolveStepTargetMetrics(fallbackStep, 0, 1, 'mobile');
assert.ok(fallbackMetrics, 'Fallback metrics should be resolved');
assert.strictEqual(fallbackMetrics.coordinates.x, 50, 'Coordinates X should match');

console.log('✅ All Locator Engine tests passed successfully!');

