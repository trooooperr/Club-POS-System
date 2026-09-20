Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory of this VBScript file
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
If Right(strPath, 1) <> "\" Then strPath = strPath & "\"

' Set current working directory to script directory
WshShell.CurrentDirectory = strPath

' Prioritize node print-agent.js so code edits and updates take effect immediately
If fso.FileExists(strPath & "print-agent.js") Then
    WshShell.Run "node print-agent.js", 0, False
ElseIf fso.FileExists(strPath & "build\print-agent.exe") Then
    WshShell.Run """" & strPath & "build\print-agent.exe""", 0, False
ElseIf fso.FileExists(strPath & "print-agent.exe") Then
    WshShell.Run """" & strPath & "print-agent.exe""", 0, False
End If
