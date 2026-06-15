/**
 * Test script for AES-256-GCM encryption.
 *
 * Usage:
 *   npx tsx scripts/test-crypto.ts
 *
 * Requires ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 * If not set, the script generates a random one for testing.
 */

import { randomBytes } from "crypto";

// Set a test key if not provided
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
  console.log(`Generated test ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY}\n`);
}

import { encrypt, decrypt } from "../lib/crypto";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

// Test 1: Basic encrypt/decrypt roundtrip
console.log("Test 1 - Basic roundtrip");
const plaintext = "sk-ant-api03-test-key-1234567890";
const encrypted = encrypt(plaintext);
const decrypted = decrypt(encrypted);
assert(decrypted === plaintext, "decrypt(encrypt(x)) === x");
assert(encrypted !== plaintext, "encrypted !== plaintext");

// Test 2: Format check (iv:authTag:ciphertext)
console.log("\nTest 2 - Format check");
const parts = encrypted.split(":");
assert(parts.length === 3, "encrypted has 3 parts separated by ':'");
assert(Buffer.from(parts[0], "base64").length === 12, "IV is 12 bytes");
assert(Buffer.from(parts[1], "base64").length === 16, "Auth tag is 16 bytes");

// Test 3: Different IVs per encryption
console.log("\nTest 3 - Unique IVs");
const encrypted2 = encrypt(plaintext);
assert(encrypted !== encrypted2, "two encryptions produce different ciphertexts");
assert(decrypt(encrypted2) === plaintext, "both decrypt to same plaintext");

// Test 4: Empty string
console.log("\nTest 4 - Empty string");
const emptyEncrypted = encrypt("");
assert(decrypt(emptyEncrypted) === "", "empty string roundtrip works");

// Test 5: Unicode
console.log("\nTest 5 - Unicode");
const unicode = "Clé API avec accents: éàü 🔑";
assert(decrypt(encrypt(unicode)) === unicode, "unicode roundtrip works");

// Test 6: Tamper detection
console.log("\nTest 6 - Tamper detection");
const tampered = encrypted.slice(0, -2) + "AA";
let tamperedFailed = false;
try {
  decrypt(tampered);
} catch {
  tamperedFailed = true;
}
assert(tamperedFailed, "tampered ciphertext throws error");

// Test 7: Invalid format
console.log("\nTest 7 - Invalid format");
let invalidFailed = false;
try {
  decrypt("not-valid-format");
} catch {
  invalidFailed = true;
}
assert(invalidFailed, "invalid format throws error");

// Summary
console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
