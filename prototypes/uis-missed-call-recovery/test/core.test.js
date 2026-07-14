import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCrmPayload,
  buildTelegramMessage,
  eventKey,
  isMissedIncomingCall,
  normalizeCallEvent,
  normalizePhone,
} from "../src/core.js";

test("normalizes common UIS-style callback aliases", () => {
  const call = normalizeCallEvent({
    data: {
      call_session_id: "abc-1",
      call_status: "no_answer",
      call_direction: "inbound",
      caller_number: "8 (999) 123-45-67",
      virtual_number: "+74951234567",
      start_time: "2026-07-14T08:00:00Z",
    },
  });
  assert.equal(call.id, "abc-1");
  assert.equal(call.caller, "+79991234567");
  assert.equal(call.destination, "+74951234567");
  assert.equal(isMissedIncomingCall(call), true);
});

test("does not classify an answered incoming call as missed", () => {
  const call = normalizeCallEvent({ id: "2", direction: "incoming", status: "answered", duration: 45 });
  assert.equal(isMissedIncomingCall(call), false);
});

test("does not classify outbound calls as missed", () => {
  const call = normalizeCallEvent({ id: "3", direction: "outbound", status: "no_answer" });
  assert.equal(isMissedIncomingCall(call), false);
});

test("creates stable event keys with a fallback", () => {
  assert.equal(eventKey({ id: "abc" }), "call:abc");
  assert.match(eventKey({ id: "", caller: "+1", destination: "+2", startedAt: "now" }), /^fallback:/);
});

test("formats Telegram and CRM payloads", () => {
  const call = normalizeCallEvent({
    call_id: "abc-4",
    status: "missed",
    direction: "incoming",
    caller: "+79990000000",
    called_number: "+74950000000",
    started_at: "2026-07-14T08:00:00Z",
  });
  assert.match(buildTelegramMessage(call), /79990000000/);
  const crm = buildCrmPayload(call);
  assert.equal(crm.event, "missed_call");
  assert.equal(crm.externalId, "abc-4");
});

test("normalizes Russian trunk prefix", () => {
  assert.equal(normalizePhone("8 912 345-67-89"), "+79123456789");
});
