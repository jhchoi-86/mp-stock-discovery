const fs = require('fs');

const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$dir = "c:\\Users\\danbe\\Documents\\Antigravity\\주식종목발굴"

Start-Process "cmd.exe" -ArgumentList "/c node server.cjs" -WorkingDirectory $dir -WindowStyle Hidden
Start-Process "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $dir -WindowStyle Hidden

Start-Sleep -Seconds 7
Start-Process "http://localhost:5173"
`;

// PowerShell EncodedCommand requires UTF-16LE
const buffer = Buffer.from(psScript, 'utf16le');
const base64 = buffer.toString('base64');

// Generate the VBS file that runs the PowerShell command completely hidden
const vbsContent = 'Set objShell = CreateObject("WScript.Shell")\n' +
'objShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ' + base64 + '", 0, False';

fs.writeFileSync('C:\\\\Users\\\\danbe\\\\Desktop\\\\PRD주식발굴_실행.vbs', vbsContent, 'utf-8');

// Also keep the .bat file as a backup
const batContent = '@echo off\n' +
'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + base64 + '\n';
fs.writeFileSync('C:\\\\Users\\\\danbe\\\\Desktop\\\\PRD주식발굴_실행.bat', batContent, 'ascii');

console.log("Launcher scripts generated successfully.");
