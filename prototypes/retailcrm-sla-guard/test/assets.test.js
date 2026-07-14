import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const logoUrl = new URL("../assets/logo.svg", import.meta.url);

test("Marketplace logo is a self-contained accessible SVG", async () => {
  const svg = await readFile(logoUrl, "utf8");

  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(svg, /<svg[^>]+viewBox="0 0 512 512"/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /<title id="title">RetailCRM SLA Guard<\/title>/);
  assert.match(svg, /<desc id="desc">/);
  assert.doesNotMatch(svg, /<script\b/i);
  assert.doesNotMatch(svg, /<image\b/i);
  assert.doesNotMatch(svg, /(?:href|xlink:href)="https?:/i);
  assert.doesNotMatch(svg, /retailcrm\.(?:ru|pro|tech)/i);
});
