# 環境整備
node.jsをダウンロード
windowsだったら、ターミナルのGit bashで
node -vでダウンロードできてるか確認

# サーバー起動コマンド
cd vscode-webcon
npm run start

# gitにあげるコマンド例
git add README.md && git commit -m 'docs: add README.md' || echo 'NO_CHANGES' && git push origin main
->git add 'ファイル名'（ステージング状態）
どのファイルをリモートリポジトリに上げるかをこのコマンドで設定します。
どこを変更した部分かわかるようになります。

->git commit -m 'メッセージ'
メッセージと書かれている場所には好きな言葉を書いて大丈夫です。

->git push origin main
GitHub上へファイルを上げることができます。

->git pull origin <ブランチ名 ex. main , master etc.>
既にローカルに存在するリポジトリに対して、リモートリポジトリの変更を取り込む操作です。
つまり、他の人がどこを変更したかわかるようになります。

# スマホで見る方法
ターミナルでifconfig

->LAN内のIPアドレス
例：en0: ... 
   inet 10.18.202.72 netmask 0xffff0000 broadcast 10.18.255.255
   status: active

-> https://10.18.202.72:3443/　
このURLをアクセスする

# QRコード読み込みできるようになった
jsQRで読み込むことはできた