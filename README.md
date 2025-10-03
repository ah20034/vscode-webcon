# 環境整備
node.jsをダウンロード
windowsだったら、ターミナルのGit bashで
node -vでダウンロードできてるか確認

# サーバー起動コマンド
cd vscode-webcon
npm run start

# gitにあげるコマンド例
git add README.md && git commit -m 'docs: add README.md' || echo 'NO_CHANGES' && git push origin main