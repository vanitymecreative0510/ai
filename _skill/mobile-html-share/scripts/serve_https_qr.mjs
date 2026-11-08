// AI学習フォルダ内のHTMLを自動でGitHub Pages（永続URL）にデプロイし、
// 一覧ポータル（index.html）の自動更新とQRコードウィジェット生成を行うスクリプト
// （自宅PC・会社PCの複数台から同時利用してもお互いの要約HTMLが消えない自動同期機能付き）
// 使い方: node serve_https_qr.mjs <htmlPath> <widgetOutputPath>
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const htmlPath = process.argv[2];
const widgetPath = process.argv[3];

if (!htmlPath || !widgetPath) {
  console.error('Usage: node serve_https_qr.mjs <htmlPath> <widgetOutputPath>');
  process.exit(1);
}

const studyDir = path.dirname(path.resolve(htmlPath));
const targetFileName = path.basename(htmlPath);
const repoName = 'ai';

// QRコードSVG生成関数（Version 3-L, Byte mode, 53バイトまで対応）
function generateQRSvg(text) {
  const dataBytes = Buffer.from(text, 'utf8');
  const size = 29;
  const totalDataBytes = 55;
  const ecBytesCount = 15;

  let bits = '0100' + dataBytes.length.toString(2).padStart(8, '0');
  for (const b of dataBytes) bits += b.toString(2).padStart(8, '0');
  bits += '0000';
  while (bits.length % 8 !== 0) bits += '0';

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const padBytes = [0xEC, 0x11];
  let padIdx = 0;
  while (codewords.length < totalDataBytes) {
    codewords.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : exp[log[a] + log[b]];

  let gen = [1];
  for (let i = 0; i < ecBytesCount; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], exp[i]);
    }
    gen = next;
  }

  const msg = [...codewords, ...new Array(ecBytesCount).fill(0)];
  for (let i = 0; i < codewords.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  const ecCodewords = msg.slice(codewords.length);
  const allCodewords = [...codewords, ...ecCodewords];

  const matrix = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  function setModule(r, c, val, res = true) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val ? 1 : 0;
      if (res) reserved[r][c] = true;
    }
  }

  function placeFinder(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const isBorder = r === -1 || r === 7 || c === -1 || c === 7;
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(row + r, col + c, !isBorder && (isOuter || isInner), true);
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  const ar = 22, ac = 22;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const val = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      setModule(ar + r, ac + c, val, true);
    }
  }

  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0, true);
    setModule(i, 6, i % 2 === 0, true);
  }

  setModule(size - 8, 8, 1, true);
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  let dataBits = '';
  for (const cw of allCodewords) dataBits += cw.toString(2).padStart(8, '0');

  let bitIdx = 0;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = up ? size - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!reserved[row][c]) {
          const bit = bitIdx < dataBits.length ? parseInt(dataBits[bitIdx++], 10) : 0;
          const masked = ((row + c) % 2 === 0) ? (bit ^ 1) : bit;
          matrix[row][c] = masked;
        }
      }
    }
    up = !up;
  }

  const formatBits = '111011111000100';
  const formatCoords1 = [
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
    [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
  ];
  const formatCoords2 = [
    [size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],
    [8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]
  ];
  for (let i = 0; i < 15; i++) {
    const b = parseInt(formatBits[i], 10);
    matrix[formatCoords1[i][0]][formatCoords1[i][1]] = b;
    matrix[formatCoords2[i][0]][formatCoords2[i][1]] = b;
  }

  const margin = 3;
  const total = size + margin * 2;
  let pathD = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) pathD += `M${c + margin},${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" class="w-44 h-44 rounded-xl bg-white p-2 shadow-sm border border-gray-200"><path d="${pathD}" fill="#000000"/></svg>`;
}

// GitHub認証情報の取得
function getGitHubCredentials() {
  const out = execSync('git credential fill', {
    input: 'protocol=https\nhost=github.com\n\n'
  }).toString();
  const userMatch = out.match(/username=(.+)/);
  const passMatch = out.match(/password=(.+)/);
  if (!userMatch || !passMatch) {
    throw new Error('GitHub credentials not found in git credential manager.');
  }
  return {
    username: userMatch[1].trim(),
    token: passMatch[1].trim()
  };
}

// 複数PC間で他のPCが追加したHTMLファイルを事前に取り込む関数
function syncRemoteFilesBeforeBuild(dir, username, repo) {
  const remoteUrl = `https://github.com/${username}/${repo}.git`;
  const gitDir = path.join(dir, '.git');
  if (!fs.existsSync(gitDir)) {
    execSync('git init -b main', { cwd: dir, stdio: 'inherit' });
  }
  try {
    execSync(`git remote set-url origin ${remoteUrl}`, { cwd: dir, stdio: 'ignore' });
  } catch {
    execSync(`git remote add origin ${remoteUrl}`, { cwd: dir, stdio: 'inherit' });
  }
  try {
    execSync('git fetch origin main', { cwd: dir, stdio: 'ignore' });
    const remoteFiles = execSync('git ls-tree -r --name-only origin/main', { cwd: dir })
      .toString()
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    for (const rf of remoteFiles) {
      const localTarget = path.join(dir, rf);
      if (!fs.existsSync(localTarget)) {
        execSync(`git checkout origin/main -- "${rf}"`, { cwd: dir, stdio: 'ignore' });
      }
    }
  } catch {
    // 初回プッシュ前などで origin/main がない場合はスキップ
  }
}

// 各HTMLに「🏠 一覧ポータルへ」ボタンを自動注入＆メタ情報抽出
function buildPortalAndMetadata(dir, baseUrl) {
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => {
      const fullPath = path.join(dir, f);
      let content = fs.readFileSync(fullPath, 'utf8');

      // ポータルへ戻るリンクが未挿入なら上部ツールバーの右側に追加
      if (!content.includes('href="./index.html"')) {
        content = content.replace(
          '<button onclick="toggleFontSize()"',
          '<a href="./index.html" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 transition">🏠 一覧</a>\n        <button onclick="toggleFontSize()"'
        );
        fs.writeFileSync(fullPath, content, 'utf8');
      }
      const updatedStat = fs.statSync(fullPath);

      const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
      const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const cleanTitle = (titleMatch ? titleMatch[1] : f)
        .replace(/｜スマホ完全対応.*$/, '')
        .trim();
      const cleanH1 = h1Match
        ? h1Match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        : cleanTitle;

      return {
        fileName: f,
        title: cleanTitle,
        description: cleanH1,
        mtime: updatedStat.mtime,
        dateStr: updatedStat.mtime.toLocaleDateString('ja-JP')
      };
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName));

  files.forEach((item, idx) => {
    item.id = idx + 1;
    item.shortUrl = `${baseUrl}?v=${item.id}`;
    item.fullUrl = `${baseUrl}${item.fileName}`;
  });

  const displayList = [...files].reverse();
  const redirectMapJson = JSON.stringify(
    Object.fromEntries(files.map(f => [String(f.id), `./${f.fileName}`]))
  );

  const cardsHtml = displayList.map(item => `
    <a href="./${item.fileName}" class="card-item block bg-[var(--card)] border border-[var(--border)] hover:border-amber-500/60 rounded-2xl p-4 sm:p-5 shadow-sm transition group">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30">No.${item.id}</span>
          <span class="text-xs text-[var(--muted-foreground)]">📅 ${item.dateStr}</span>
        </div>
        <span class="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">${item.fileName}</span>
      </div>
      <h2 class="text-base sm:text-lg font-extrabold group-hover:text-amber-400 transition mb-1.5">${item.title}</h2>
      <p class="text-xs sm:text-sm text-[var(--muted-foreground)] line-clamp-2">${item.description}</p>
      <div class="mt-3 flex items-center justify-between text-xs font-bold text-amber-400">
        <span>📖 タップして図解まとめを読む →</span>
        <span class="font-mono text-[11px] text-[var(--muted-foreground)]">?v=${item.id}</span>
      </div>
    </a>
  `).join('\n');

  const indexHtml = `<!DOCTYPE html>
<html lang="ja" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>📚 AI学習まとめポータル｜スマホ常時閲覧</title>
  <script>
    // 短縮URL (?v=1 など) でアクセスされた場合は該当の図解HTMLへ即座に遷移
    (function() {
      const map = ${redirectMapJson};
      const params = new URLSearchParams(window.location.search);
      const v = params.get('v');
      if (v && map[v]) {
        window.location.replace(map[v]);
      }
    })();
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --background: #f8fafc; --foreground: #0f172a; --card: #ffffff;
      --muted-foreground: #475569; --border: #e2e8f0; --secondary: #f1f5f9;
    }
    html.dark {
      --background: #0b0f19; --foreground: #f1f5f9; --card: #131b2e;
      --muted-foreground: #94a3b8; --border: #1e293b; --secondary: #1e293b;
    }
    body {
      margin: 0; background-color: var(--background); color: var(--foreground);
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Meiryo", sans-serif;
      line-height: 1.6;
    }
  </style>
</head>
<body class="p-3 sm:p-6 md:p-10">
  <div class="max-w-4xl mx-auto space-y-5">
    <header class="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-3">
      <div class="flex items-center justify-between">
        <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">🌐 24時間365日 永続公開ポータル</span>
        <button onclick="document.documentElement.classList.toggle('dark')" class="px-3 py-1 rounded-lg text-xs font-bold bg-[var(--secondary)] border border-[var(--border)]">🌗 テーマ切替</button>
      </div>
      <h1 class="text-xl sm:text-2xl font-extrabold">📚 AI学習 YouTube図解まとめ一覧（全${files.length}本）</h1>
      <p class="text-xs sm:text-sm text-[var(--muted-foreground)]">
        PCを閉じていても、いつでもスマホからアクセスできます。このページをiPhoneの「ホーム画面に追加」またはLINEの「Keepメモ」に保存しておくと、今後追加される要約もすべてここから閲覧できます。
      </p>
      <input
        type="search"
        placeholder="🔍 タイトルやキーワードで検索..."
        oninput="const q=this.value.toLowerCase(); document.querySelectorAll('.card-item').forEach(el => el.style.display = el.innerText.toLowerCase().includes(q) ? '' : 'none');"
        class="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:border-amber-500"
      >
    </header>
    <div class="space-y-3.5">
      ${cardsHtml}
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(dir, 'index.html'), indexHtml, 'utf8');
  return files;
}

// GitHubリポジトリ作成＆GitHub Pages有効化
async function ensureGitHubRepoAndPages(username, token, repo) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Antigravity-Mobile-HTML-Share',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  let res = await fetch(`https://api.github.com/repos/${username}/${repo}`, { headers });
  if (res.status === 404) {
    console.log(`Creating public GitHub repository ${username}/${repo}...`);
    res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: repo,
        description: 'AI学習 スマホ完全対応HTMLまとめポータル',
        private: false,
        auto_init: false
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to create repo: ${res.status} ${await res.text()}`);
    }
  }
}

async function enableGitHubPages(username, token, repo) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Antigravity-Mobile-HTML-Share',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  const check = await fetch(`https://api.github.com/repos/${username}/${repo}/pages`, { headers });
  if (check.status === 404) {
    console.log('Enabling GitHub Pages on main branch...');
    await fetch(`https://api.github.com/repos/${username}/${repo}/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: { branch: 'main', path: '/' }
      })
    });
  }
}

function pushStudyFolderToGitHub(dir, username, repo) {
  const remoteUrl = `https://github.com/${username}/${repo}.git`;
  const gitDir = path.join(dir, '.git');
  if (!fs.existsSync(gitDir)) {
    execSync('git init -b main', { cwd: dir, stdio: 'inherit' });
  }
  try {
    execSync(`git remote set-url origin ${remoteUrl}`, { cwd: dir, stdio: 'ignore' });
  } catch {
    execSync(`git remote add origin ${remoteUrl}`, { cwd: dir, stdio: 'inherit' });
  }
  execSync('git add -A', { cwd: dir, stdio: 'inherit' });
  try {
    execSync('git commit -m "Update AI study summaries"', { cwd: dir, stdio: 'inherit' });
  } catch {
    // 変更なしの場合
  }
  execSync('git push -u origin main --force', { cwd: dir, stdio: 'inherit' });
}

function writeWidget(widgetOut, shortUrl, fullUrl, portalUrl, title) {
  const svg = generateQRSvg(shortUrl);
  const content = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3">
  <div class="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center gap-5">
    <div class="shrink-0 flex flex-col items-center">
      ${svg}
      <span class="mt-1.5 text-[11px] text-[var(--muted-foreground)] font-semibold">📱 カメラでスキャン</span>
    </div>
    <div class="space-y-2.5 text-left flex-1 min-w-0">
      <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
        <span>🌐 GitHub Pages 永続公開済み（期限切れなし・PC閉じてOK）</span>
      </div>
      <h3 class="text-sm sm:text-base font-bold text-[var(--foreground)] truncate">${title}</h3>
      <p class="text-xs text-[var(--muted-foreground)] leading-relaxed">
        時間制限（no tunnel）にならず、24時間365日いつでもスマホから閲覧できます！LINEに送っても一生リンク切れになりません。
      </p>
      <div class="space-y-1.5">
        <div class="text-[11px] font-bold text-[var(--muted-foreground)]">🔗 この動画の直通URL（短縮版）：</div>
        <div class="flex items-center gap-2">
          <div class="flex-1 p-2 rounded-xl bg-[var(--background)] border border-[var(--border)] font-mono text-xs font-bold text-amber-600 dark:text-amber-400 select-all truncate">
            ${shortUrl}
          </div>
          <button onclick="navigator.clipboard.writeText('${shortUrl}'); this.textContent='✅ コピー済'" class="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 shrink-0">
            📋 コピー
          </button>
        </div>
        <div class="text-[11px] font-bold text-[var(--muted-foreground)] pt-1">📚 全動画まとめポータルURL（ブックマーク推奨）：</div>
        <div class="flex items-center gap-2">
          <div class="flex-1 p-2 rounded-xl bg-[var(--background)] border border-[var(--border)] font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 select-all truncate">
            ${portalUrl}
          </div>
          <button onclick="navigator.clipboard.writeText('${portalUrl}'); this.textContent='✅ コピー済'" class="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 shrink-0">
            📋 コピー
          </button>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  fs.writeFileSync(widgetOut, content, 'utf8');
}

const creds = getGitHubCredentials();
const portalUrl = `https://${creds.username}.github.io/${repoName}/`;

await ensureGitHubRepoAndPages(creds.username, creds.token, repoName);
syncRemoteFilesBeforeBuild(studyDir, creds.username, repoName);
const allFiles = buildPortalAndMetadata(studyDir, portalUrl);
pushStudyFolderToGitHub(studyDir, creds.username, repoName);
await enableGitHubPages(creds.username, creds.token, repoName);

const targetItem = allFiles.find(f => f.fileName === targetFileName) || allFiles[allFiles.length - 1];
writeWidget(widgetPath, targetItem.shortUrl, targetItem.fullUrl, portalUrl, targetItem.title);

console.log('=== PERMANENT_URL_READY ===');
console.log('PORTAL_URL:', portalUrl);
console.log('SHORT_URL:', targetItem.shortUrl);
console.log('FULL_URL:', targetItem.fullUrl);
