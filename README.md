# 🏙️ CodeCity 3D — GitHubリポジトリを3D都市に

GitHubのURLを貼るだけで、ソースコードを3Dの街として可視化するWebアプリ。
**JavaScriptのみ・ビルド不要・そのままGitHub Pagesで公開できます。**

![concept](https://img.shields.io/badge/Three.js-r160-blue) ![pages](https://img.shields.io/badge/GitHub_Pages-OK-green)

## ✨ できること

- 🔗 GitHub URL → `api.github.com` でファイルツリー取得（CORS対応・トークン不要）
- 🏢 ビル1棟 = 1ファイル（高さ = ファイルサイズ logスケール）
- 🎨 色 = 拡張子（JS黄・Python黄・C++橙…）
- 🗺️ 地区 = 先頭フォルダごとに地面プレート＋ラベル
- 🖱️ ドラッグ回転 / ホイールズーム / 右ドラッグ移動
- 👆 ビルクリックでファイル詳細＋GitHubリンク
- 🔍 パス・拡張子で絞り込みハイライト、📏高さスライダー
- 🔁 自動回転、`?repo=owner/repo` で共有リンク

## 🚀 GitHub Pagesで公開（3ステップ）

```powershell
# このフォルダをそのままpush
git init
git add index.html style.css app.js README.md .nojekyll
git commit -m "CodeCity3D web"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

1. GitHubリポジトリの **Settings → Pages**
2. **Deploy from branch → `main` / `/ (root)`** を選択してSave
3. 数十秒後に `https://<you>.github.io/<repo>/` で公開 🎉

> ビルド工程なし。`index.html` がルートにあればOK。`.nojekyll` 同梱済み。

## 💻 ローカルで試す

```powershell
# Pythonがあればこれだけ
python -m http.server 8000
# → http://localhost:8000 を開く
```

※ `file://` 直開きはESモジュール(CORS)のためNG。必ずhttpサーバー経由で。

## 📁 構成

```
index.html  … UI + importmap (three@0.160.0 CDN)
style.css   … ダークガラスUI
app.js      … GitHub API取得 + Three.js都市生成 (ES Module)
.nojekyll   … Pages用
```

## ⚠️ 注意

- 公開GitHub APIの未認証枠は **1時間 約60回** まで。403が出たら少し待って再試行。
- 巨大リポジトリは大きい順に **上位2500ファイル** に絞って表示。
- プライベートリポジトリは非対応（公開リポジトリのみ）。

## 🛠️ カスタマイズ

- `EXT_COLORS` … 拡張子→色
- `MAX_FILES` … 表示上限
- `heightForSize()` … 高さ式
- `DISTRICT_ACCENTS` … 地区カラー

## 🤖 AIについて

このリポジトリのコード（`index.html` / `style.css` / `app.js` / `README.md`）は、AIコーディングアシスタント（OpenCode + Muse Spark）との対話を通じて生成されました。
バグ報告や改善案はIssue・PRで歓迎します。
