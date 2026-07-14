import test from "node:test";
import assert from "node:assert/strict";
import {
  alertKey,
  buildTask,
  isLeadBreached,
  normalizeLeads,
  parseRules,
  thresholdForLead,
} from "../src/core.js";

test("parseRules validates and adds default", () => {
  assert.deepEqual(parseRules('{"100:200":900}', 1800), { "100:200": 900, default: 1800 });
  assert.throws(() => parseRules("not-json"), /valid JSON/);
});

test("threshold prioritizes pipeline and status", () => {
  const lead = { pipeline_id: 10, status_id: 20 };
  assert.equal(thresholdForLead(lead, { "10:20": 60, "20": 120, default: 300 }), 60);
  assert.equal(thresholdForLead({ ...lead, pipeline_id: 11 }, { "20": 120, default: 300 }), 120);
});

test("detects stale lead without a future task", () => {
  const base = { id: 1, pipeline_id: 10, status_id: 20, updated_at: 100, closest_task_at: null };
  const options = { nowSeconds: 1000, rules: { default: 600 }, closedStatusIds: new Set() };
  assert.equal(isLeadBreached(base, options), true);
  assert.equal(isLeadBreached({ ...base, closest_task_at: 1100 }, options), false);
  assert.equal(isLeadBreached({ ...base, updated_at: 700 }, options), false);
});

test("closed statuses never trigger", () => {
  const lead = { id: 1, pipeline_id: 10, status_id: 142, updated_at: 100, closest_task_at: null };
  assert.equal(isLeadBreached(lead, {
    nowSeconds: 1000,
    rules: { default: 60 },
    closedStatusIds: new Set([142]),
  }), false);
});

test("buildTask creates a lead task with deterministic request id", () => {
  const task = buildTask({ id: 42, name: "Новая заявка", responsible_user_id: 7, updated_at: 900 }, 1000, 15);
  assert.equal(task.entity_type, "leads");
  assert.equal(task.entity_id, 42);
  assert.equal(task.responsible_user_id, 7);
  assert.equal(task.complete_till, 1900);
  assert.equal(task.request_id, "sla-42-900");
});

test("alertKey changes after lead update and payload normalization is safe", () => {
  assert.notEqual(alertKey({ id: 5, updated_at: 10 }), alertKey({ id: 5, updated_at: 11 }));
  assert.deepEqual(normalizeLeads({ _embedded: { leads: [{ id: 1 }] } }), [{ id: 1 }]);
  assert.deepEqual(normalizeLeads({}), []);
});
