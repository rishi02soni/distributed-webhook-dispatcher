
const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const { authenticate } = require("../src/auth");

test("authentication accepts original and reviewer keys", () => {
  const original = config.apiKey;
  const reviewer = config.reviewerApiKey;
  const environment = config.nodeEnv;

  try {
    config.apiKey = "original-test-key";
    config.reviewerApiKey = "reviewer-test-key";
    config.nodeEnv = "production";

    function check(token) {
      let status = 200;
      let allowed = false;

      const req = {
        get: () => `Bearer ${token}`
      };

      const res = {
        status(code) {
          status = code;
          return this;
        },
        json() {}
      };

      authenticate(req, res, () => {
        allowed = true;
      });

      return allowed ? 200 : status;
    }

    assert.equal(check("original-test-key"), 200);
    assert.equal(check("reviewer-test-key"), 200);
    assert.equal(check("wrong-key"), 401);
  } finally {
    config.apiKey = original;
    config.reviewerApiKey = reviewer;
    config.nodeEnv = environment;
  }
});
