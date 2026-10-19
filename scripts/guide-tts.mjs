#!/usr/bin/env node
/*
 * Dev saja (T-3k08): suara narasi video panduan. Penyedia di "voice.provider" scripts/guide-narration.json:
 *   - "edge" (bawaan): suara neural Microsoft id-ID lewat CLI edge-tts (pip install edge-tts; path lewat env
 *     EDGE_TTS_BIN), tanpa kunci/biaya — voiceName mis. id-ID-ArdiNeural, rate mis. "+0%". Istilah bahasa
 *     Inggris ditandai "[en:pivot]" di naskah → diucapkan suara en-GB (aksen Inggris, T-9bc2).
 *   - "gemini": Google Gemini TTS, kunci gratis dari aistudio.google.com (GEMINI_API_KEY di env atau
 *     Keychain service "demoday"); voiceName mis. Kore, model preview (cadangan otomatis), style = arahan
 *     gaya bicara. Kuota gratis per menit: 429 ditunggu lalu diulang.
 *   - "elevenlabs": butuh ELEVENLABS_API_KEY (env atau Keychain service "demoday", sama dengan plugin
 *     DemoDay; tidak pernah dicetak) dan paket berbayar untuk lisensi komersial.
 *   node scripts/guide-tts.mjs              → buat mp3 untuk setiap kalimat "voice" di naskah (cache per isi
 *                                             kalimat + setelan suara) di demo/guide-videos/audio/
 *   node scripts/guide-tts.mjs --samples [gemini] → contoh suara ElevenLabs (Voice Library bahasa id) atau
 *                                             8 suara Gemini untuk dipilih, di demo/guide-videos/voice-samples/
 *   node scripts/guide-tts.mjs --check      → hanya laporkan kalimat yang belum punya audio
 * Yang dikirim ke penyedia hanya teks narasi.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIO_DIR, EN_TERM, audioName, captionText } from "./guide-audio.mjs";

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

function apiKey(name = "ELEVENLABS_API_KEY") {
  if (process.env[name]) return process.env[name].trim();
  try {
    return execFileSync("security", ["find-generic-password", "-s", "demoday", "-a", name, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(
      `${name} belum ada. Simpan di terminal Anda sendiri: ` +
        `security add-generic-password -s demoday -a ${name} -w`,
    );
  }
}

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const GEMINI_STYLE =
  "Bacakan dalam bahasa Indonesia dengan suara pemandu yang ramah, hangat, dan santai, tempo sedang, jeda alami di koma dan titik, seperti menjelaskan aplikasi kepada rekan kerja:";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Gemini TTS: PCM 16-bit mono (rate dari mimeType) → mp3 lewat ffmpeg. Model preview bisa berganti
 * nama → coba model berikutnya bila 404; kuota gratis per menit (429) → tunggu retryDelay lalu ulang.
 */
async function speakGemini(key, voice, text, file) {
  const models = [...new Set([voice.model, ...GEMINI_MODELS].filter(Boolean))];
  for (const model of models) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await fetch(`${GEMINI}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${voice.style ?? GEMINI_STYLE}\n\n${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.voiceName } } },
          },
        }),
      });
      if (res.status === 404) break; // model ini tidak tersedia → model berikutnya
      const body = await res.text();
      if (res.status === 429 || res.status >= 500) {
        const delay = Number(/"retryDelay":\s*"(\d+)s"/.exec(body)?.[1] ?? 30);
        console.warn(`gemini ${res.status}, tunggu ${delay} s (percobaan ${attempt + 1})`);
        await wait((delay + 2) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`Gemini ${model} → ${res.status}: ${body.slice(0, 300)}`);
      const part = JSON.parse(body).candidates?.[0]?.content?.parts?.find((x) => x.inlineData);
      if (!part) throw new Error(`Gemini ${model}: respons tanpa audio`);
      const rate = /rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? "24000";
      execFileSync(
        "ffmpeg",
        [
          ...["-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ar", rate, "-ac", "1"],
          ...["-i", "pipe:0", "-c:a", "libmp3lame", "-q:a", "3", file],
        ],
        { input: Buffer.from(part.inlineData.data, "base64") },
      );
      return model;
    }
  }
  throw new Error(`Gemini: tidak ada model TTS yang bisa dipakai (${models.join(", ")})`);
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

/** 8 suara Gemini dengan 3 kalimat naskah yang sama seperti contoh Microsoft (edge-*.mp3). */
async function samplesGemini() {
  const key = apiKey("GEMINI_API_KEY");
  const dir = join(OUT, "voice-samples");
  mkdirSync(dir, { recursive: true });
  const text = narration.scenes["pemilik-unggah"]
    .slice(0, 3)
    .map((l) => l.voice)
    .join(" ");
  const list = [];
  for (const name of ["Kore", "Aoede", "Leda", "Sulafat", "Charon", "Puck", "Achird", "Iapetus"]) {
    const file = join(dir, `gemini-${name}.mp3`);
    try {
      const model = await speakGemini(key, { voiceName: name }, text, file);
      list.push({ name, model, file, seconds: Number(duration(file).toFixed(1)) });
      console.log(`contoh: ${file} (${model})`);
    } catch (e) {
      console.warn(`lewati ${name}: ${e.message}`);
    }
  }
  writeFileSync(join(dir, "gemini-voices.json"), `${JSON.stringify(list, null, 2)}\n`);
  console.log(`\n${list.length} contoh suara Gemini di ${dir}.`);
}

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

/** Suara istilah bahasa Inggris (T-9bc2): aksen Inggris, pria seperti suara narator. */
const EN_VOICE = "en-GB-RyanNeural";

function edgeClip(voiceName, rate, text, file) {
  execFileSync(
    process.env.EDGE_TTS_BIN ?? "edge-tts",
    ["--voice", voiceName, `--rate=${rate}`, "--text", text, "--write-media", file],
    // Layanan kadang menggantung tanpa galat: gagal cepat lalu ulangi (cache melanjutkan).
    { stdio: ["ignore", "ignore", "pipe"], timeout: 60_000 },
  );
}

/**
 * Suara neural Microsoft lewat CLI edge-tts (mp3 24 kHz); teks lewat argumen, bukan shell. Kalimat
 * berpenanda [en:…] dipotong: bagian Indonesia memakai suara naskah, istilah memakai EN_VOICE; hening di
 * ujung tiap potongan dipangkas lalu disambung (jeda 80 ms) dengan ffmpeg.
 * shortcut: EN_VOICE tidak masuk kunci cache audio (audioName); ganti suaranya → hapus mp3 berpenanda.
 */
function speakEdge(voice, text, out) {
  // Ditulis ke berkas sementara lalu di-rename: proses yang mati tidak meninggalkan mp3 rusak di cache.
  const file = `${out}.part.mp3`;
  speakEdgeTo(voice, text, file);
  renameSync(file, out);
}

function speakEdgeTo(voice, text, file) {
  const rate = voice.rate ?? "+0%";
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(EN_TERM)) {
    parts.push({ voice: voice.voiceName, text: text.slice(last, m.index) });
    parts.push({ voice: EN_VOICE, text: m[1] });
    last = m.index + m[0].length;
  }
  parts.push({ voice: voice.voiceName, text: text.slice(last) });
  const spoken = parts.filter((p) => /[\p{L}\p{N}]/u.test(p.text));
  if (spoken.length === 1) return edgeClip(spoken[0].voice, rate, spoken[0].text.trim(), file);
  const clips = spoken.map((_, i) => `${file}.${i}.mp3`);
  const trim =
    "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.08";
  const graph =
    clips.map((_, i) => `[${i}:a]${trim}[a${i}]`).join(";") +
    `;${clips.map((_, i) => `[a${i}]`).join("")}concat=n=${clips.length}:v=0:a=1[out]`;
  try {
    spoken.forEach((p, i) => edgeClip(p.voice, rate, p.text.trim(), clips[i]));
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        ...clips.flatMap((c) => ["-i", c]),
        "-filter_complex",
        graph,
        "-map",
        "[out]",
        "-ar",
        "24000",
        "-ac",
        "1",
        "-b:a",
        "48k",
        file,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } finally {
    for (const c of clips) rmSync(c, { force: true });
  }
}

async function generate(check) {
  const voice = narration.voice;
  const lines = Object.values(narration.scenes).flat();
  const missing = lines.filter((l) => !existsSync(join(AUDIO, audioName(voice, l.voice))));
  console.log(`${lines.length} kalimat; ${missing.length} belum punya audio.`);
  if (check || missing.length === 0) return;
  const edge = voice.provider === "edge";
  const gemini = voice.provider === "gemini";
  if (edge || gemini ? !voice.voiceName : !voice.voiceId)
    throw new Error(
      `suara di ${NARRATION} belum diisi (voiceName untuk edge/gemini, voiceId untuk elevenlabs)`,
    );
  const key = edge ? null : apiKey(gemini ? "GEMINI_API_KEY" : "ELEVENLABS_API_KEY");
  mkdirSync(AUDIO, { recursive: true });
  for (const [i, l] of missing.entries()) {
    const file = join(AUDIO, audioName(voice, l.voice));
    if (edge) speakEdge(voice, l.voice, file);
    // Penyedia lain tidak memecah suara: penanda [en:…] dibuang agar tidak ikut dibaca.
    else if (gemini) await speakGemini(key, voice, captionText(l.voice), file);
    else await speak(key, voice, captionText(l.voice), file);
    console.log(
      `${i + 1}/${missing.length} ${duration(file).toFixed(1)} s — ${l.voice.slice(0, 60)}`,
    );
  }
}

if (mode === "samples" && process.argv.includes("gemini")) await samplesGemini();
else if (mode === "samples") await samples();
else await generate(mode === "check");
