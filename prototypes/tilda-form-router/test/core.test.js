import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCrmPayload,
  buildTelegramMessage,
  normalizePhone,
  normalizeTildaSubmission,
  parseUrlEncoded,
  submissionKey,
} from "../src/core.js";

test("parses URL-encoded Tilda payloads and repeated fields", () => {
  const payload = parseUrlEncoded("Name=Ivan+Petrov&Phone=8+999+123-45-67&Tag=one&Tag=two");
  assert.equal(payload.Name, "Ivan Petrov");
  assert.deepEqual(payload.Tag, ["one", "two"]);
});

test("normalizes common Tilda fields", () => {
  const submission = normalizeTildaSubmission({
    tranid: "467251:8442970",
    formid: "form48844953",
    "tildaspec-formname": "Запрос консультации",
    Name: " Иван ",
    Phone: "8 (999) 123-45-67",
    Email: "USER@EXAMPLE.COM",
    Comments: "Нужна интеграция",
    "tildaspec-referer": "https://example.test/service",
    COOKIES: "private-cookie-data",
    utm_source: "search",
  });

  assert.equal(submission.leadId, "467251:8442970");
  assert.equal(submission.formId, "form48844953");
  assert.equal(submission.formName, "Запрос консультации");
  assert.equal(submission.phone, "+79991234567");
  assert.equal(submission.email, "user@example.com");
  assert.equal(submission.sourceUrl, "https://example.test/service");
  assert.equal(submission.fields.utm_source, "search");
  assert.equal(Object.hasOwn(submission.fields, "COOKIES"), false);
});

test("uses Tilda lead id for idempotency", () => {
  const submission = normalizeTildaSubmission({ tranid: "lead-42", Name: "Test" });
  assert.equal(submissionKey(submission), "tilda:lead-42");
});

test("creates a stable fallback key without a lead id", () => {
  const first = normalizeTildaSubmission({ formid: "f1", Email: "a@example.com", Comments: "Hello" });
  const second = normalizeTildaSubmission({ formid: "f1", Email: "a@example.com", Comments: "Hello" });
  assert.equal(submissionKey(first), submissionKey(second));
  assert.match(submissionKey(first), /^hash:/);
});

test("formats Telegram and generic CRM payloads", () => {
  const submission = normalizeTildaSubmission({
    tranid: "lead-7",
    formid: "form7",
    Name: "Анна",
    Phone: "+7 999 000-00-00",
    Email: "anna@example.com",
    Comments: "Перезвонить после 18:00",
  });

  assert.match(buildTelegramMessage(submission), /Анна/);
  assert.match(buildTelegramMessage(submission), /lead-7/);
  const crm = buildCrmPayload(submission);
  assert.equal(crm.event, "tilda_form_submission");
  assert.equal(crm.externalId, "lead-7");
  assert.equal(crm.contact.phone, "+79990000000");
});

test("normalizes Russian trunk prefix", () => {
  assert.equal(normalizePhone("8 912 345-67-89"), "+79123456789");
});
