const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePayload } = require("../src/validation");

test("accepts a valid event payload", () => {
  const result = validatePayload({
    eventId: "evt_123",
    payload: { event: "user.signup", userId: "usr_999" }
  });
  assert.equal(result.eventId, "evt_123");
  assert.equal(result.payload.userId, "usr_999");
});

test("rejects missing eventId", () => {
  assert.throws(() => validatePayload({ payload: {} }), /eventId is required/);
});

test("rejects missing payload", () => {
  assert.throws(() => validatePayload({ eventId: "evt_1" }), /payload is required/);
});

test("rejects non-object request body", () => {
  assert.throws(() => validatePayload([]), /JSON object/);
});
