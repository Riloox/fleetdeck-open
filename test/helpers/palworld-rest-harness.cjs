'use strict';

const fs = require('fs');

function headers(values = {}) {
  const normalized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  return { get: (name) => normalized[String(name).toLowerCase()] || null };
}

function loadFixture(file) {
  const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!fixture || fixture.format !== 'fleetdeck-palworld-rest-fixture' || fixture.version !== 1) {
    throw new Error('Unsupported Palworld REST fixture');
  }
  if (!Array.isArray(fixture.steps)) throw new Error('Palworld REST fixture must contain steps');
  return fixture;
}

function createRestHarness(input, options = {}) {
  const fixture = typeof input === 'string' ? loadFixture(input) : input;
  const wait = options.wait || (() => Promise.resolve());
  let position = 0;
  const requests = [];

  async function fetch(url, request = {}) {
    const step = fixture.steps[position++];
    if (!step) throw new Error(`Unexpected Palworld REST request: ${request.method || 'GET'} ${url}`);
    const parsed = new URL(url);
    const actual = { method: request.method || 'GET', path: parsed.pathname };
    requests.push(actual);
    if (step.method && step.method !== actual.method) {
      throw new Error(`Expected ${step.method}, received ${actual.method}`);
    }
    if (step.path && step.path !== actual.path) {
      throw new Error(`Expected ${step.path}, received ${actual.path}`);
    }
    if (step.delayMs) await wait(step.delayMs);
    if (step.disconnect) {
      const error = new Error('Fixture connection closed');
      error.code = 'ECONNRESET';
      throw error;
    }
    if (step.timeout) {
      const error = new Error('Fixture request timed out');
      error.name = 'TimeoutError';
      throw error;
    }
    const status = step.status || 200;
    const text = step.invalidJson
      ? '{"fixture":'
      : step.body === undefined ? '' : JSON.stringify(step.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: headers({ 'content-length': Buffer.byteLength(text), ...step.headers }),
      text: async () => text,
    };
  }

  return {
    fetch,
    requests,
    remaining: () => fixture.steps.length - position,
    assertComplete() {
      if (position !== fixture.steps.length) {
        throw new Error(`${fixture.steps.length - position} Palworld REST fixture step(s) were not replayed`);
      }
    },
  };
}

module.exports = { createRestHarness, loadFixture };
