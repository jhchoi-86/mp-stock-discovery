Set WshShell = CreateObject("WScript.Shell")
' 0 = Hidden, 1 = Normal, 2 = Minimized
WshShell.Run chr(34) & "C:\Users\danbe\Documents\Antigravity\주식종목발굴\aws_update.bat" & Chr(34), 0, False
Set WshShell = Nothing
