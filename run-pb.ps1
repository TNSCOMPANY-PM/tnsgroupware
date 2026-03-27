Set-Location "c:\Users\user1\Dropbox\Vibe coding project\groupware"
while ($true) {
    node scripts\pushbullet-stream.js
    Start-Sleep -Seconds 5
}
