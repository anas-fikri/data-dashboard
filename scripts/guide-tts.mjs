#!/usr/bin/env node
/*
 * Dev saja (T-3k08): suara narasi video panduan dengan ElevenLabs.
 *   node scripts/guide-tts.mjs              → buat mp3 untuk setiap kalimat "voice" di scripts/guide-narration.json
 *                                             (cache per isi kalimat + suara + model) di demo/guide-videos/audio/
 *   node scripts/guide-tts.mjs --samples    → contoh suara penutur Indonesia (Voice Library, bahasa id) di
 *                                             demo/guide-videos/voice-samples/ untuk dipilih; isi voiceId di naskah
 *   node scripts/guide-tts.mjs --check      → hanya laporkan kalimat yang belum punya audio (tanpa kunci/biaya)
 * Kunci: env ELEVENLABS_API_KEY, atau Keychain macOS (service "demoday", akun ELEVENLABS_API_KEY — sama
 * dengan plugin DemoDay). Kunci tidak pernah dicetak. Yang dikirim ke ElevenLabs hanya teks narasi.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIO_DIR, audioName } from "./guide-audio.mjs";

const NARRATION = "scripts/guide-narration.json";
const OUT = "demo/guide-videos";
const AUDIO = AUDIO_DIR;
const API = "https://api.elevenlabs.io";
const SAMPLE_TEXT =
  "Halo, selamat datang di Data Dashboard. Di video singkat ini, kita akan menyusun dashboard pertama Anda, langkah demi langkah.";

const narration = JSON.parse(readFileSync(NARRATION, "utf8"));
const mode = process.argv.includes("--samples")
  ? "samples"
  : process.argv.includes("--check")
    ? "check"
    : "generate";

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", "demoday", "-a", "ELEVENLABS_API_KEY", "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    throw new Error(
      "ELEVENLABS_API_KEY belum ada. Simpan di terminal Anda sendiri: " +
        "security add-generic-password -s demoday -a ELEVENLABS_API_KEY -w",
    );
  }
}

async function call(path, init, key) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "xi-api-key": key, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300).replace(/[A-Za-z0-9_-]{32,}/g, "…");
    throw new Error(
      `ElevenLabs ${init?.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${body}`,
    );
  }
  return res;
}

async function speak(key, voice, text, file) {
  const res = await call(
    `/v1/text-to-speech/${voice.voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      body: JSON.stringify({
        text,
        model_id: voice.model,
        language_code: "id",
        voice_settings: voice.settings,
      }),
    },
    key,
  );
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const duration = (file) =>
  Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]).toString(),
  );

async function samples() {
  const key = apiKey();
  const dir = join(OUT, "voice-samples");
  mkdirSync(dir, { recursive: true });
  // Penutur asli Indonesia dari Voice Library, diurutkan pemakaian; narasi/percakapan lebih dulu.
  const res = await call(
    "/v1/shared-voices?language=id&page_size=40&sort=usage_character_count_1y",
    {},
    key,
  );
  const fit = ["narrative_story", "informative_educational", "conversational"];
  const rank = (v) => (fit.includes(v.use_case) ? fit.indexOf(v.use_case) : fit.length);
  const voices = ((await res.json()).voices ?? []).sort((a, b) => rank(a) - rank(b)).slice(0, 8);
  const list = [];
  for (const v of voices) {
    const voice = { ...narration.voice, voiceId: v.voice_id };
    const file = join(dir, `${v.name.replace(/[^\w-]+/g, "_")}-${v.voice_id.slice(0, 6)}.mp3`);
    try {
      // Suara library harus ditambahkan ke akun dulu agar bisa dipakai lewat API.
      await call(
        `/v1/voices/add/${v.public_owner_id}/${v.voice_id}`,
        { method: "POST", body: JSON.stringify({ new_name: `${v.name} (panduan)` }) },
        key,
      ).catch(() => {});
      await speak(key, voice, SAMPLE_TEXT, file);
      list.push({
        name: v.name,
        voiceId: v.voice_id,
        gender: v.gender,
        age: v.age,
        accent: v.accent,
        use: v.use_case,
        file,
      });
      console.log(`contoh: ${file}`);
    } catch (e) {
      console.warn(`lewati ${v.name}: ${e.message}`);
    }
  }
  writeFileSync(join(dir, "voices.json"), `${JSON.stringify(list, null, 2)}\n`);
  console.log(
    `\n${list.length} contoh suara di ${dir}. Dengarkan, lalu isi "voiceId" di ${NARRATION}.`,
  );
}

async function generate(check) {
  const voice = narration.voice;
  const lines = Object.values(narration.scenes).flat();
  const missing = lines.filter((l) => !existsSync(join(AUDIO, audioName(voice, l.voice))));
  console.log(`${lines.length} kalimat; ${missing.length} belum punya audio.`);
  if (check || missing.length === 0) return;
  if (!voice.voiceId)
    throw new Error(`voiceId di ${NARRATION} masih kosong — jalankan --samples dulu`);
  const key = apiKey();
  mkdirSync(AUDIO, { recursive: true });
  for (const [i, l] of missing.entries()) {
    const file = join(AUDIO, audioName(voice, l.voice));
    await speak(key, voice, l.voice, file);
    console.log(
      `${i + 1}/${missing.length} ${duration(file).toFixed(1)} s — ${l.voice.slice(0, 60)}`,
    );
  }
}

if (mode === "samples") await samples();
else await generate(mode === "check");
