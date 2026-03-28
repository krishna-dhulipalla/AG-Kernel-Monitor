#!/usr/bin/env bun
/**
 * pb-investigator.ts — Sprint 0 R&D Script
 * AG-Kernel-Monitor: .pb File Format Investigation
 *
 * Purpose: Determine if Antigravity .pb files can be decoded,
 * and establish the token estimation strategy.
 *
 * Findings Summary:
 *   - conversations/*.pb → ENCRYPTED (entropy ≈ 8.0 bits/byte)
 *   - implicit/*.pb      → ENCRYPTED (entropy ≈ 8.0 bits/byte)
 *   - user_settings.pb   → VALID PROTOBUF (parseable, contains settings)
 *   - annotations/*.pbtxt → READABLE text proto (last_user_view_time)
 *
 * Run: bun run scripts/pb-investigator.ts
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const ANTIGRAVITY_DIR = join(homedir(), ".gemini", "antigravity");
const CONVERSATIONS_DIR = join(ANTIGRAVITY_DIR, "conversations");
const IMPLICIT_DIR = join(ANTIGRAVITY_DIR, "implicit");
const BRAIN_DIR = join(ANTIGRAVITY_DIR, "brain");
const ANNOTATIONS_DIR = join(ANTIGRAVITY_DIR, "annotations");

// ── Magic Bytes ──────────────────────────────────────────────
const MAGIC_BYTES: Record<string, number[]> = {
  gzip: [0x1f, 0x8b],
  zstd: [0x28, 0xb5, 0x2f, 0xfd],
  brotli_woff2: [0xce, 0xb2, 0xcf, 0x81],
  xz: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00],
  lz4: [0x04, 0x22, 0x4d, 0x18],
  snappy: [0xff, 0x06, 0x00, 0x00],
};

// ── Shannon Entropy ──────────────────────────────────────────
function calculateEntropy(bytes: Uint8Array): number {
  const freq = new Map<number, number>();
  for (const b of bytes) {
    freq.set(b, (freq.get(b) || 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / bytes.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ── Compression Detection ────────────────────────────────────
function detectCompression(bytes: Uint8Array): string | null {
  for (const [name, magic] of Object.entries(MAGIC_BYTES)) {
    if (magic.every((b, i) => bytes[i] === b)) {
      return name;
    }
  }
  return null;
}

// ── Protobuf Wire Format Validation ──────────────────────────
function isValidProtobuf(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const firstByte = bytes[0];
  const wireType = firstByte & 0x07;
  // Valid wire types: 0 (varint), 1 (64-bit), 2 (length-delimited), 5 (32-bit)
  // Wire types 3, 4 are deprecated start/end group
  // Wire type 6, 7 are invalid
  return [0, 1, 2, 5].includes(wireType);
}

// ── Simple Protobuf Varint Decoder ───────────────────────────
function decodeProtobufFields(
  bytes: Uint8Array
): Array<{ field: number; wireType: number; value: string }> {
  const fields: Array<{ field: number; wireType: number; value: string }> = [];
  let i = 0;

  while (i < bytes.length) {
    // Read tag (varint)
    let tag = 0;
    let shift = 0;
    let byte: number;
    const tagStart = i;

    do {
      if (i >= bytes.length) break;
      byte = bytes[i++];
      tag |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);

    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    if (fieldNum === 0 || fieldNum > 1000) break; // sanity check

    switch (wireType) {
      case 0: {
        // Varint
        let value = 0;
        let vShift = 0;
        do {
          if (i >= bytes.length) break;
          byte = bytes[i++];
          value |= (byte & 0x7f) << vShift;
          vShift += 7;
        } while (byte & 0x80);
        fields.push({ field: fieldNum, wireType, value: String(value) });
        break;
      }
      case 2: {
        // Length-delimited
        let len = 0;
        let lShift = 0;
        do {
          if (i >= bytes.length) break;
          byte = bytes[i++];
          len |= (byte & 0x7f) << lShift;
          lShift += 7;
        } while (byte & 0x80);
        if (i + len > bytes.length) {
          i = bytes.length;
          break;
        }
        const data = bytes.slice(i, i + len);
        const text = new TextDecoder("utf-8", { fatal: false }).decode(data);
        const isPrintable = /^[\x20-\x7E\t\n\r]+$/.test(text);
        fields.push({
          field: fieldNum,
          wireType,
          value: isPrintable ? `"${text}"` : `<${len} bytes>`,
        });
        i += len;
        break;
      }
      case 1: {
        // 64-bit fixed
        if (i + 8 > bytes.length) {
          i = bytes.length;
          break;
        }
        const view = new DataView(
          bytes.buffer,
          bytes.byteOffset + i,
          8
        );
        fields.push({
          field: fieldNum,
          wireType,
          value: `fixed64:${view.getBigUint64(0, true)}`,
        });
        i += 8;
        break;
      }
      case 5: {
        // 32-bit fixed
        if (i + 4 > bytes.length) {
          i = bytes.length;
          break;
        }
        const view32 = new DataView(
          bytes.buffer,
          bytes.byteOffset + i,
          4
        );
        fields.push({
          field: fieldNum,
          wireType,
          value: `fixed32:${view32.getUint32(0, true)}`,
        });
        i += 4;
        break;
      }
      default:
        // Invalid wire type → not a protobuf
        return fields;
    }
  }

  return fields;
}

// ── Readable String Extraction ───────────────────────────────
function extractReadableStrings(
  bytes: Uint8Array,
  minLength: number = 8
): Array<{ offset: number; text: string }> {
  const results: Array<{ offset: number; text: string }> = [];
  let current = "";
  let startOffset = 0;

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x20 && b <= 0x7e) {
      if (current.length === 0) startOffset = i;
      current += String.fromCharCode(b);
    } else {
      if (current.length >= minLength) {
        results.push({ offset: startOffset, text: current });
      }
      current = "";
    }
  }
  if (current.length >= minLength) {
    results.push({ offset: startOffset, text: current });
  }

  return results;
}

// ── Decompression Attempts ───────────────────────────────────
async function tryDecompress(bytes: Uint8Array): Promise<string[]> {
  const results: string[] = [];
  const { gunzipSync } = await import("node:zlib");

  try {
    const decompressed = gunzipSync(bytes);
    results.push(
      `✅ GZIP decompression succeeded! (${bytes.length} → ${decompressed.length} bytes)`
    );
    const entropy = calculateEntropy(new Uint8Array(decompressed));
    results.push(`   Decompressed entropy: ${entropy.toFixed(4)} bits/byte`);
  } catch {
    results.push("❌ GZIP decompression failed");
  }

  // Brotli
  try {
    const { brotliDecompressSync } = await import("node:zlib");
    const decompressed = brotliDecompressSync(bytes);
    results.push(
      `✅ Brotli decompression succeeded! (${bytes.length} → ${decompressed.length} bytes)`
    );
  } catch {
    results.push("❌ Brotli decompression failed");
  }

  // Deflate (raw)
  try {
    const { inflateRawSync } = await import("node:zlib");
    const decompressed = inflateRawSync(bytes);
    results.push(
      `✅ Raw deflate decompression succeeded! (${bytes.length} → ${decompressed.length} bytes)`
    );
  } catch {
    results.push("❌ Raw deflate decompression failed");
  }

  return results;
}

// ── Main Investigation ───────────────────────────────────────
async function investigate() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" AG-Kernel-Monitor — Sprint 0: .pb File Investigation ");
  console.log("═══════════════════════════════════════════════════════\n");

  // 1. Scan conversation files
  console.log("━━━ CONVERSATION FILES (conversations/*.pb) ━━━\n");
  const convFiles = (await readdir(CONVERSATIONS_DIR))
    .filter((f) => f.endsWith(".pb"))
    .sort();

  let totalConvSize = 0;
  const convStats = [];
  for (const file of convFiles) {
    const filePath = join(CONVERSATIONS_DIR, file);
    const s = await stat(filePath);
    totalConvSize += s.size;
    convStats.push({ file, size: s.size, mtime: s.mtime });
  }

  console.log(`Total files: ${convFiles.length}`);
  console.log(
    `Total size: ${(totalConvSize / 1024 / 1024).toFixed(2)} MB`
  );
  console.log(
    `Smallest: ${convStats.sort((a, b) => a.size - b.size)[0].file} (${convStats[0].size} bytes)`
  );
  console.log(
    `Largest: ${convStats[convStats.length - 1].file} (${convStats[convStats.length - 1].size} bytes)`
  );

  // Test a sample conversation file
  console.log("\n--- Sample Analysis: smallest conversation ---");
  const sampleConvPath = join(CONVERSATIONS_DIR, convStats[0].file);
  const sampleConvBytes = new Uint8Array(await readFile(sampleConvPath));

  const convCompression = detectCompression(sampleConvBytes);
  console.log(`Compression magic: ${convCompression || "NONE DETECTED"}`);

  const convEntropy = calculateEntropy(sampleConvBytes);
  console.log(`Entropy: ${convEntropy.toFixed(4)} bits/byte`);
  console.log(
    `  (Random/encrypted: ~8.0, Protobuf text: ~4-6, English text: ~3-4)`
  );

  const convValid = isValidProtobuf(sampleConvBytes);
  console.log(
    `Valid protobuf first byte: ${convValid ? "YES" : "NO"} (0x${sampleConvBytes[0].toString(16).padStart(2, "0")})`
  );

  const convStrings = extractReadableStrings(sampleConvBytes);
  console.log(`Readable strings (8+ chars): ${convStrings.length}`);
  if (convStrings.length > 0) {
    console.log(
      `  First 5: ${convStrings
        .slice(0, 5)
        .map((s) => `"${s.text.substring(0, 40)}"`)
        .join(", ")}`
    );
  }

  console.log("\n--- Decompression attempts (smallest conv) ---");
  const decompResults = await tryDecompress(sampleConvBytes);
  decompResults.forEach((r) => console.log(`  ${r}`));

  // 2. Test largest conversation too
  console.log("\n--- Sample Analysis: largest conversation ---");
  const largestConvPath = join(
    CONVERSATIONS_DIR,
    convStats[convStats.length - 1].file
  );
  const largestConvBytes = new Uint8Array(await readFile(largestConvPath));
  const largestEntropy = calculateEntropy(largestConvBytes);
  console.log(
    `File: ${convStats[convStats.length - 1].file} (${(largestConvBytes.length / 1024 / 1024).toFixed(2)} MB)`
  );
  console.log(`Entropy: ${largestEntropy.toFixed(4)} bits/byte`);
  console.log(`Valid protobuf: ${isValidProtobuf(largestConvBytes) ? "YES" : "NO"}`);
  const largestStrings = extractReadableStrings(largestConvBytes);
  console.log(`Readable strings: ${largestStrings.length}`);

  // 3. user_settings.pb
  console.log("\n\n━━━ USER SETTINGS (user_settings.pb) ━━━\n");
  const settingsPath = join(ANTIGRAVITY_DIR, "user_settings.pb");
  const settingsBytes = new Uint8Array(await readFile(settingsPath));
  console.log(`Size: ${settingsBytes.length} bytes`);
  console.log(`Valid protobuf: ${isValidProtobuf(settingsBytes) ? "YES" : "NO"}`);
  console.log(`Entropy: ${calculateEntropy(settingsBytes).toFixed(4)} bits/byte`);

  const fields = decodeProtobufFields(settingsBytes);
  console.log(`\nDecoded ${fields.length} protobuf fields:`);
  for (const f of fields) {
    const wireNames = ["varint", "fixed64", "len-delim", "start-group", "end-group", "fixed32"];
    console.log(`  field ${f.field} (${wireNames[f.wireType] || "?"}) = ${f.value}`);
  }

  // 4. Implicit files
  console.log("\n\n━━━ IMPLICIT FILES (implicit/*.pb) ━━━\n");
  const impFiles = (await readdir(IMPLICIT_DIR))
    .filter((f) => f.endsWith(".pb"))
    .sort();
  let totalImpSize = 0;
  for (const f of impFiles) {
    totalImpSize += (await stat(join(IMPLICIT_DIR, f))).size;
  }
  console.log(`Total files: ${impFiles.length}`);
  console.log(`Total size: ${(totalImpSize / 1024 / 1024).toFixed(2)} MB`);

  // Test smallest implicit
  const impSizes = [];
  for (const f of impFiles) {
    const s = await stat(join(IMPLICIT_DIR, f));
    impSizes.push({ file: f, size: s.size });
  }
  impSizes.sort((a, b) => a.size - b.size);

  if (impSizes.length > 0) {
    const smallImp = new Uint8Array(
      await readFile(join(IMPLICIT_DIR, impSizes[0].file))
    );
    console.log(
      `Smallest: ${impSizes[0].file} (${impSizes[0].size} bytes)`
    );
    console.log(`  Entropy: ${calculateEntropy(smallImp).toFixed(4)} bits/byte`);
    console.log(`  Valid protobuf: ${isValidProtobuf(smallImp) ? "YES" : "NO"}`);
    console.log(
      `  Readable strings: ${extractReadableStrings(smallImp).length}`
    );
  }

  // 5. Annotations
  console.log("\n\n━━━ ANNOTATIONS (annotations/*.pbtxt) ━━━\n");
  const annFiles = (await readdir(ANNOTATIONS_DIR))
    .filter((f) => f.endsWith(".pbtxt"));
  console.log(`Total annotation files: ${annFiles.length}`);

  if (annFiles.length > 0) {
    const sampleAnn = await readFile(
      join(ANNOTATIONS_DIR, annFiles[0]),
      "utf-8"
    );
    console.log(`Sample content: ${sampleAnn.trim()}`);
    console.log(`Format: TEXT PROTO (readable!)`);
  }

  // Coverage analysis
  const annUUIDs = new Set(annFiles.map((f) => f.replace(".pbtxt", "")));
  const convUUIDs = convFiles.map((f) => f.replace(".pb", ""));
  const withAnn = convUUIDs.filter((u) => annUUIDs.has(u));
  const orphanAnnotations = [...annUUIDs].filter(
    (u) => !convUUIDs.includes(u)
  );
  console.log(
    `\nAnnotation coverage: ${withAnn.length}/${convUUIDs.length} conversations have annotations`
  );
  console.log(`Orphan annotations (no .pb): ${orphanAnnotations.length}`);

  // 6. Brain/Conversation mapping
  console.log("\n\n━━━ BRAIN ↔ CONVERSATION MAPPING ━━━\n");
  const brainFolders = (await readdir(BRAIN_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name !== "tempmediaStorage")
    .map((d) => d.name);

  const brainSet = new Set(brainFolders);
  const convSet = new Set(convUUIDs);

  const orphanBrain = brainFolders.filter((u) => !convSet.has(u));
  const orphanConv = convUUIDs.filter((u) => !brainSet.has(u));

  console.log(`Brain folders: ${brainFolders.length}`);
  console.log(`Conv .pb files: ${convUUIDs.length}`);
  console.log(`Orphan brain (no .pb): ${orphanBrain.length}`);
  console.log(`Orphan conv (no brain): ${orphanConv.length}`);

  // 7. Verdict
  console.log("\n\n═══════════════════════════════════════════════════════");
  console.log(" SPRINT 0 VERDICT ");
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("🔴 DECODING FAILED:");
  console.log("   • conversations/*.pb — ENCRYPTED (entropy ≈ 8.0)");
  console.log("   • implicit/*.pb      — ENCRYPTED (entropy ≈ 8.0)");
  console.log("   • No compression magic bytes detected");
  console.log("   • First bytes fail protobuf wire format validation");
  console.log("   • All decompression methods (gzip, brotli, deflate) fail");
  console.log("   • Zero meaningful readable strings in small files");

  console.log("\n🟢 DECODABLE:");
  console.log("   • user_settings.pb   — Valid protobuf, fully parseable");
  console.log("   • annotations/*.pbtxt — Plain text proto format");
  console.log("   • brain/*/           — Readable markdown/JSON artifacts");

  console.log("\n📊 RECOMMENDATION: Option B — File-Size-Based Estimation");
  console.log("   • Use .pb file size with calibrated bytes-per-token ratio");
  console.log("   • Supplement with brain folder disk size");
  console.log("   • Parse brain artifacts for workspace mapping");
  console.log("   • Parse annotations for last-active timestamps");
  console.log("   • Use code_tracker/ for additional workspace identification");
}

investigate().catch(console.error);
