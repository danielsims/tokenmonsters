#!/usr/bin/env bun
/**
 * One-off script to generate placeholder chiptune WAV files.
 * Run: bun src/audio/generate.ts
 * Outputs: src/audio/assets/evolve.wav, src/audio/assets/feed.wav
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const SAMPLE_RATE = 22050;
const BITS = 16;
const CHANNELS = 1;

function writeWav(path: string, samples: Int16Array) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);

  // RIFF header
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);

  // fmt chunk
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), 28); // byte rate
  buf.writeUInt16LE(CHANNELS * (BITS / 8), 32); // block align
  buf.writeUInt16LE(BITS, 34);

  // data chunk
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  const view = new DataView(buf.buffer, buf.byteOffset + 44, dataSize);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(i * 2, samples[i], true);
  }

  writeFileSync(path, buf);
}

/** Square wave tone with volume envelope */
function tone(freq: number, duration: number, volume: number, decay = 0.5): Int16Array {
  const len = Math.floor(SAMPLE_RATE * duration);
  const samples = new Int16Array(len);
  const period = SAMPLE_RATE / freq;

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.max(0, volume * (1 - (t / duration) * decay));
    const val = (i % period) < (period / 2) ? 1 : -1;
    samples[i] = Math.round(val * env * 16000);
  }
  return samples;
}

/** Concatenate multiple sample arrays */
function concat(...parts: Int16Array[]): Int16Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// --- Evolve sound: ascending arpeggio chime (~1.2s) ---
const evolve = concat(
  tone(523.25, 0.2, 0.8, 0.3),  // C5
  tone(659.25, 0.2, 0.85, 0.3), // E5
  tone(783.99, 0.2, 0.9, 0.3),  // G5
  tone(1046.5, 0.4, 1.0, 0.6),  // C6 (held longer)
  new Int16Array(Math.floor(SAMPLE_RATE * 0.2)), // silence tail
);

// --- Feed sound: short chirp ping (~0.3s) ---
const feed = concat(
  tone(880, 0.08, 0.6, 0.2),    // A5 quick
  tone(1174.66, 0.12, 0.5, 0.8), // D6 with decay
  new Int16Array(Math.floor(SAMPLE_RATE * 0.1)), // silence tail
);

const assetsDir = join(import.meta.dir, "assets");
mkdirSync(assetsDir, { recursive: true });

writeWav(join(assetsDir, "evolve.wav"), evolve);
writeWav(join(assetsDir, "feed.wav"), feed);

console.log("Generated: src/audio/assets/evolve.wav, src/audio/assets/feed.wav");
