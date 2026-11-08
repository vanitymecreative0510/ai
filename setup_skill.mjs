// 会社のPC（または別PC）で実行するだけで、以下を一括セットアップするスクリプト：
// 1. Antigravity用グローバルスキル (~/.gemini/config/skills/mobile-html-share) の登録
// 2. Claude Code用スキル (~/.claude/skills/mobile-html-share) の登録
// 3. ワークスペース内の .agents/skills/mobile-html-share の登録
// 4. そのPCの「AI学習」フォルダのパスに合わせて SKILL.md 内のパスを自動書き換え
// 使い方: node setup_skill.mjs
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const studyDir = path.dirname(__filename); // このスクリプトがある「AI学習」フォルダ
const srcSkillDir = path.join(studyDir, '_skill', 'mobile-html-share');
const homeDir = os.homedir();

const targetSkillDirs = [
  path.join(homeDir, '.gemini', 'config', 'skills', 'mobile-html-share'),
  path.join(homeDir, '.claude', 'skills', 'mobile-html-share'),
  path.join(path.dirname(studyDir), '.agents', 'skills', 'mobile-html-share')
];

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function buildSkillMd(installedSkillDir, aiStudyDir) {
  const fetchScript = path.join(installedSkillDir, 'scripts', 'fetch_youtube.mjs');
  const serveScript = path.join(installedSkillDir, 'scripts', 'serve_https_qr.mjs');
  const templateFile = path.join(installedSkillDir, 'resources', 'mobile_guide_template.html');
  const fetchUrl = 'file:///' + fetchScript.replace(/\\/g, '/');
  const serveUrl = 'file:///' + serveScript.replace(/\\/g, '/');
  const templateUrl = 'file:///' + templateFile.replace(/\\/g, '/');

  return `---
name: mobile-html-share
description: >-
  Use this skill whenever the user asks to summarize a YouTube video, article, or document
  into an HTML file, or asks to view an HTML summary on their smartphone (mobile).
  Provides automated YouTube transcript extraction, a smartphone-first HTML template
  (bottom tab bar, font size toggle, mobile card views), and automatic deployment to
  GitHub Pages (https://vanitymecreative0510.github.io/ai/) with a permanent QR code widget.
---

# YouTube詳細図解HTML作成 ＆ スマホ常時閲覧（GitHub Pages永続公開＋QRコード）スキル

ユーザーから「YouTube動画を要約・HTMLにまとめてほしい」「スキルを起動してほしい」「スマホで見れるようにしてほしい」と依頼された際は、**途中の確認で止まらずに Step 1 〜 Step 3（チャットでの詳細要約 ＋ \`AI学習\` フォルダへのHTML保存 ＋ GitHub Pagesへの自動デプロイ＆永続QRコード表示）までを一気通貫で自動実行**してください。

---

## Step 1: YouTube動画の字幕・メタデータ取得（YouTubeまとめの場合）

YouTubeのURLが指定された場合は、2026年対応の \`ANDROID\` Innertubeクライアントを使用したスクリプト [fetch_youtube.mjs](${fetchUrl}) を実行して、タイトル・概要欄・タイムスタンプ付き字幕全文を取得します。

\`\`\`powershell
node "${fetchScript}" "<YouTube_URL>" "<scratch_dir>/transcript.txt"
\`\`\`

* 取得した字幕の音声認識誤変換（同音異義語や専門用語のカナ表記など）は、概要欄や公式ドキュメントの知識と照らし合わせて正確な技術用語に補正してからまとめること。
* URLに秒数指定（\`&t=xxx\`）がある場合は、その該当箇所を特定して重点解説として明記すること。

---

## Step 2: スマホ完全対応（モバイルファースト）HTMLの作成と \`AI学習\` フォルダへの保存

HTMLを作成する際は、[mobile_guide_template.html](${templateUrl}) の設計に準拠し、必ず以下の要素を含めて作成します。

1. **片手操作用の下部固定ボトムナビゲーション（\`md:hidden fixed bottom-0\`）**：スマホの親指でカテゴリを即座に切り替えられるタブバー。
2. **「🔠 文字を大きく」ボタン**：スマホの小さな画面でもワンタップで文字サイズを拡大できるトグルボタン。
3. **比較表のスマホ専用カード表示**：横スクロールが必要な表（\`<table>\`）は \`hidden md:block\` にし、スマホ画面（\`md:hidden\`）では縦型のビフォーアフターカード表示に切り替わるようにする。
4. **オフライン・アプリ内プレビュー耐性**：\`<style>\` 内にフォールバックCSS変数と基本クラスを内蔵する。
5. **保存先**：必ず **\`${aiStudyDir}\\<name>.html\`** に保存する。

---

## Step 3: GitHub Pagesへの永続公開＆QRコードの即時発行（確認不要で自動実行）

Step 2のHTML作成が完了したら、**ユーザーへの事前確認で止まらずにそのまま自動で** [serve_https_qr.mjs](${serveUrl}) を実行します。
このスクリプトは \`AI学習\` フォルダ内の全HTMLから一覧ポータル（\`index.html\`）を自動生成し、GitHub Pages（\`https://vanitymecreative0510.github.io/ai/\`）へ自動プッシュして、**期限切れにならない永続URLとQRコードウィジェット**を発行します。

\`\`\`powershell
node "${serveScript}" "${aiStudyDir}\\<name>.html" "<ArtifactDir>/https_qr_widget.html"
\`\`\`

* **最終出力に含める内容（必須）**：
  1. チャット上での分かりやすい構造化要約（結論3行・パート別詳細表・重要ポイント）
  2. 生成したローカルHTMLファイルのリンク（\`AI学習\` フォルダ内）
  3. 生成された \`https_qr_widget.html\` の \`<agent-embed>\` タグによるチャット内直接表示と、永続短縮URL（\`https://vanitymecreative0510.github.io/ai/?v=N\`）および全動画一覧ポータルURL（\`https://vanitymecreative0510.github.io/ai/\`）の案内
`;
}

for (const destDir of targetSkillDirs) {
  copyDirRecursive(srcSkillDir, destDir);
  const skillMdContent = buildSkillMd(destDir, studyDir);
  fs.writeFileSync(path.join(destDir, 'SKILL.md'), skillMdContent, 'utf8');
  console.log(`✅ スキルをインストールしました: ${destDir}`);
}

console.log('🎉 セットアップ完了！このPCでもYouTube URLを貼るだけで「AI学習」保存＆スマホ永続公開が自動実行されます。');
