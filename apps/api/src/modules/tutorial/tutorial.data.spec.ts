import { TUTORIAL_FLOWS } from './tutorial.data';

describe('TUTORIAL_FLOWS', () => {
  it('is non-empty', () => {
    expect(TUTORIAL_FLOWS.length).toBeGreaterThan(0);
  });

  it('every flow has a unique id', () => {
    const ids = TUTORIAL_FLOWS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every flow has at least one step, and every step has a unique id within its flow', () => {
    for (const flow of TUTORIAL_FLOWS) {
      expect(flow.steps.length).toBeGreaterThan(0);
      const stepIds = flow.steps.map((s) => s.id);
      expect(new Set(stepIds).size).toBe(stepIds.length);
    }
  });

  it('every step id is globally unique across all flows (stable anchor keys)', () => {
    const allStepIds = TUTORIAL_FLOWS.flatMap((f) => f.steps.map((s) => s.id));
    expect(new Set(allStepIds).size).toBe(allStepIds.length);
  });

  it('every flow declares at least one platform', () => {
    for (const flow of TUTORIAL_FLOWS) {
      expect(flow.platforms.length).toBeGreaterThan(0);
    }
  });

  it('every flow/step has non-empty title and body text', () => {
    for (const flow of TUTORIAL_FLOWS) {
      expect(flow.title.trim().length).toBeGreaterThan(0);
      for (const step of flow.steps) {
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.body.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
