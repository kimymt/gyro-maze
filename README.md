# GYRO

指で世界を回し、球をゴールへ運ぶ3D自然素材の立体迷路。日本語、大型化する3ステージ、落下なし、端末内記録、オフラインPWA。

## 開発

Node.js 22.12以上。

```sh
npm ci
npm run dev
```

本番ビルドとオフライン検証:

```sh
npm run build
npm run preview -- --port 4173
```

Macで http://localhost:4173 を開く。通常の開発サーバーではService Workerを登録しない。本番プレビューで登録・全素材保存を検証する。同一ポートに別アプリのService Workerが残っている場合は、別ポートまたは新しいブラウザプロファイルを使う。

iPhoneのPWA試験はHTTPS配信元で行う。同じWi-FiのMacのHTTP IPアドレスだけではオフライン機能を試験できない。

## 操作

- ドラッグ: 360度回転。2本指のひねり: 画面軸で回転。ピンチ: ズーム。
- デスクトップ: ドラッグ、ホイール、矢印キー、Q/E。
- 金色の中継点を順に通り、緑のゴールで球を止める。
- 球は裏返しても常に床に接し、見えない側面・端の境界でコース内に保つ。視点リセットのみ球を中継点へ戻す。
- 「球に寄る」またはピンチで、球を中心に拡大。内部では地形を透視表示する。
- 最速のクリア記録を保存。途中の走行は保存しない。旧ステージの記録は新ステージへ引き継がず、画質設定は維持する。

## 構成

- `src/levels.ts`: 立方体状の木・土・水の地形と、外周・内部を結ぶ通路。
- `src/physics.ts`: Rapier、120Hz重力積分、継ぎ目のない床と見えない通路境界。球の速度を制限し、毎ステップ境界内に収める。
- `src/scene.ts`: Three.js、材質、手前の遮蔽部材の透過、画質。
- `src/input.ts`: Pointer Events、多点入力、ズーム、キーボード。
- `src/state.ts`: 進行・完了判定・保存検証。
- `src/main.ts`: 画面、ゲームループ、バックグラウンド停止。
- `src/offline.ts`, `src/sw.template.js`, `scripts/build-sw.mjs`: 全素材キャッシュ、修復、更新。

RapierのWASMはcompatパッケージ内に埋め込まれ、JavaScriptと一緒に配信・キャッシュされる。環境照明と3D形状はコードで生成し、外部モデル・フォント・画像サービスは使わない。

## テスト

```sh
npm test
npx playwright install chromium
npm run build
npm run test:e2e
```

物理テストは球をテレポートさせず、重力方向だけを変えて全ステージの通路を走破する。自動制御は指操作の難易度やiPhone性能の保証ではない。実機チェックは `DEVICE_TESTS.md` に記録する。

## Cloudflare

```sh
npx wrangler login
npx wrangler whoami
npm run deploy
```

既存の公開先は Worker `gyro-maze`。このプロジェクトの `npm run deploy` は既存公開版を更新する。別の環境へ配信する場合は `wrangler.jsonc` の名前を変更する。ゲームAPIやDBは不要。

公開URL: https://gyro-maze.kei1127miyamoto.workers.dev

静的配信の説明: https://developers.cloudflare.com/workers/static-assets/

Safariで配信URLを開き、共有メニューからホーム画面に追加。追加したアプリで「オフラインで遊べます」を確認してから機内モードを試す。iOSがサイトデータを削除した場合は再取得する。

更新版は選択画面の「更新する」で適用する。旧タブの遅延読み込みを壊さないよう旧版キャッシュを保持するため、更新ごとに保存容量が増える。初版では自動で旧キャッシュを消去しない。
