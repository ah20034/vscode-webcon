# 環境整備
node.jsをダウンロード
windowsだったら、ターミナルのGit bashで
node -vでダウンロードできてるか確認

# サーバー起動コマンド
cd vscode-webcon
npm run start

# gitにあげるコマンド例
git add README.md && git commit -m 'docs: add README.md' || echo 'NO_CHANGES' && git push origin main

# スマホで見る方法
ターミナルでifconfig

->LAN内のIPアドレス
例：en0: ... 
   inet 10.18.202.72 netmask 0xffff0000 broadcast 10.18.255.255
   status: active

-> https://10.18.202.72:3443/　
このURLをアクセスする