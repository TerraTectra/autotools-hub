import assert from "node:assert/strict";
import test from "node:test";
import {
  appendIncidents,
  buildIncident,
  incidentsToCsv,
  summarizeIncidents,
} from "../src/incident-core.js";

const now = new Date("2026-07-14T12:00:00Z");
const order = {
  id: 42,
  number: "A-42",
  extendedStatus: "assembling",
  statusUpdatedAt: "2026-07-14T10:00:00Z",
  firstName: "Иван",
  lastName: "Петров",
  totalSumm: 12500,
};

test("builds a privacy-safe SLA incident", () => {
  const incident = buildIncident(order, now);
  assert.equal(incident.orderNumber, "A-42");
  assert.equal(incident.status, "assembling");
  assert.equal(incident.staleMinutes, 120);
  assert.equal(Object.hasOwn(incident, "firstName"), false);
  assert.equal(Object.hasOwn(incident, "totalSumm"), false);
});

test("deduplicates and bounds incident history", () => {
  const first = appendIncidents([], [order], now, 2);
  assert.equal(first.length, 1);
  assert.equal(appendIncidents(first, [order], now, 2).length, 1);
  const secondOrder = { ...order, id: 43, number: "A-43" };
  const thirdOrder = { ...order, id: 44, number: "=A-44" };
  const bounded = appendIncidents(first, [secondOrder, thirdOrder], now, 2);
  assert.equal(bounded.length, 2);
  assert.equal(bounded[0].orderNumber, "=A-44");
});

test("summarizes SLA incidents for an operational review", () => {
  const incidents = [
    {
      key: "1",
      status: "assembling",
      staleMinutes: 120,
      detectedAt: "2026-07-14T11:00:00Z",
    },
    {
      key: "2",
      status: "assembling",
      staleMinutes: 180,
      detectedAt: "2026-07-13T13:00:00Z",
    },
    {
      key: "3",
      status: "new",
      staleMinutes: 60,
      detectedAt: "2026-07-06T12:00:00Z",
    },
  ];

  const summary = summarizeIncidents(incidents, now);
  assert.equal(summary.total, 3);
  assert.equal(summary.last24Hours, 2);
  assert.equal(summary.last7Days, 2);
  assert.equal(summary.averageDelayMinutes, 120);
  assert.equal(summary.maxDelayMinutes, 180);
  assert.equal(summary.topStatus, "assembling");
  assert.deepEqual(summary.byStatus[0], {
    status: "assembling",
    count: 2,
    maxDelayMinutes: 180,
    averageDelayMinutes: 150,
  });
});

test("exports incidents as spreadsheet-safe CSV", () => {
  const incidents = appendIncidents([], [{ ...order, number: "=2+2" }], now);
  const csv = incidentsToCsv(incidents);
  assert.match(csv, /orderNumber/);
  assert.match(csv, /'=2\+2/);
  assert.doesNotMatch(csv, /Иван|12500/);
});
