Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory of this VBScript file
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
If Right(strPath, 1) <> "\" Then strPath = strPath & "\"

' Set current working directory to script directory
WshShell.CurrentDirectory = strPath

' Find node.exe — PATH is not reliable at startup, so search common locations
Dim nodePath
nodePath = ""

Dim nodeCandidates(5)
nodeCandidates(0) = WshShell.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe")
nodeCandidates(1) = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe")
nodeCandidates(2) = WshShell.ExpandEnvironmentStrings("%APPDATA%\nvm\current\node.exe")
nodeCandidates(3) = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\nodejs\node.exe")
nodeCandidates(4) = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\nvm\current\node.exe")
nodeCandidates(5) = "C:\Program Files\nodejs\node.exe"

Dim i
For i = 0 To 5
    If fso.FileExists(nodeCandidates(i)) Then
        nodePath = nodeCandidates(i)
        Exit For
    End If
Next

' Launch: prefer node + print-agent.js (so updates take effect); else use .exe
If nodePath <> "" And fso.FileExists(strPath & "print-agent.js") Then
    WshShell.Run """" & nodePath & """ """ & strPath & "print-agent.js""", 0, False
ElseIf fso.FileExists(strPath & "build\print-agent.exe") Then
    WshShell.Run """" & strPath & "build\print-agent.exe""", 0, False
ElseIf fso.FileExists(strPath & "print-agent.exe") Then
    WshShell.Run """" & strPath & "print-agent.exe""", 0, False
End If
