const dns = require("node:dns/promises");
const net = require("node:net");
const config = require("./config");

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224;
}

function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase().split("%")[0];
  return normalized === "::1" || normalized === "::" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.");
}

function isPrivateAddress(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

async function validateDestinationUrl(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error("destinationUrl must be a string no longer than 2048 characters");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("destinationUrl must be a valid URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("destinationUrl must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("destinationUrl must not contain embedded credentials");
  }
  if (!url.hostname) throw new Error("destinationUrl must include a hostname");

  if (!config.allowPrivateDestinations) {
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
      throw new Error("Private/local destinations are not allowed");
    }

    if (net.isIP(hostname)) {
      if (isPrivateAddress(hostname)) throw new Error("Private IP destinations are not allowed");
    } else {
      let records;
      try {
        records = await dns.lookup(hostname, { all: true, verbatim: true });
      } catch {
        throw new Error("destinationUrl hostname could not be resolved");
      }
      if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
        throw new Error("destinationUrl must resolve only to public IP addresses");
      }
    }
  }

  return url;
}

function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object");
  }
  if (typeof body.eventId !== "string" || body.eventId.trim().length === 0 || body.eventId.length > 200) {
    throw new Error("eventId is required and must be a string of 1-200 characters");
  }
  if (!Object.prototype.hasOwnProperty.call(body, "payload")) {
    throw new Error("payload is required");
  }
  if (body.payload === undefined) throw new Error("payload is required");
  return { eventId: body.eventId.trim(), payload: body.payload };
}

module.exports = { validateDestinationUrl, validatePayload };
