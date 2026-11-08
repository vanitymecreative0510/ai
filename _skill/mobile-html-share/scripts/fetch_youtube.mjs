// YouTube動画のメタデータ（タイトル・概要欄・目次）と字幕全文をタイムスタンプ付きで取得するスクリプト
// 使い方: node fetch_youtube.mjs <YouTubeのURLまたは動画ID> [出力先テキストファイルパス]
import fs from 'fs';

const input = process.argv[2] || '';
const outPath = process.argv[3] || '';

const idMatch = input.match(/(?:v=|youtu\.be\/|shorts\/|^)([a-zA-Z0-9_-]{11})/);
if (!idMatch) {
  console.error('有効なYouTube URLまたは11文字の動画IDを指定してください。');
  process.exit(1);
}
const videoId = idMatch[1];

const clientVersion = '21.38.38';
const ua = `com.google.android.youtube/${clientVersion} (Linux; U; Android 15; ja_JP) gzip`;

const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': ua
  },
  body: JSON.stringify({
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion,
        androidSdkVersion: 35,
        hl: 'ja',
        gl: 'JP'
      }
    },
    videoId
  })
});

const data = await playerRes.json();
const vd = data?.videoDetails || {};
const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

let output = [];
output.push(`=== タイトル ===\n${vd.title || '不明'}`);
output.push(`=== チャンネル ===\n${vd.author || '不明'}`);
output.push(`=== 再生時間(秒) ===\n${vd.lengthSeconds || '不明'}`);
output.push(`=== 概要欄 ===\n${vd.shortDescription || ''}`);

if (tracks.length > 0) {
  const jaTrack = tracks.find(t => t.languageCode === 'ja') || tracks[0];
  const capRes = await fetch(jaTrack.baseUrl, { headers: { 'User-Agent': ua } });
  const xml = await capRes.text();

  const lines = [];
  const pRegex = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const startSec = Math.floor(parseInt(match[1], 10) / 1000);
    const mm = String(Math.floor(startSec / 60)).padStart(2, '0');
    const ss = String(startSec % 60).padStart(2, '0');
    const rawText = match[3]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    if (rawText) {
      lines.push(`[${mm}:${ss}] ${rawText}`);
    }
  }
  output.push(`=== 字幕全文 (${jaTrack.languageCode}, ${lines.length}行) ===\n` + lines.join('\n'));
} else {
  output.push('=== 字幕トラックが見つかりませんでした ===');
}

const fullText = output.join('\n\n');
if (outPath) {
  fs.writeFileSync(outPath, fullText, 'utf8');
  console.log(`Saved transcript to ${outPath} (${fullText.length} chars)`);
} else {
  console.log(fullText);
}
