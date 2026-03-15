Set objFSO = CreateObject("Scripting.FileSystemObject")
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

Set objShell = CreateObject("WScript.Shell")

' Run backend and frontend commands using the detected dynamic relative path (hidden window)
objShell.Run "cmd.exe /c cd /d """ & strPath & """ && node server.cjs", 0, False
objShell.Run "cmd.exe /c cd /d """ & strPath & """ && npm run dev", 0, False

' Wait 7 seconds for the Vite React server to spin up, then launch the browser
WScript.Sleep 7000
objShell.Run "http://localhost:5173"
