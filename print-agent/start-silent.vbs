Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory of this VBScript file
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
If Right(strPath, 1) <> "\" Then strPath = strPath & "\"

' Set current working directory to script directory
WshShell.CurrentDirectory = strPath

' 1. If standalone print-agent.exe exists, run it directly (no Node.js required)
If fso.FileExists(strPath & "print-agent.exe") Then
    WshShell.Run """" & strPath & "print-agent.exe""", 0, False
ElseIf fso.FileExists(strPath & "build\print-agent.exe") Then
    WshShell.Run """" & strPath & "build\print-agent.exe""", 0, False
Else
    ' 2. Fallback to searching node.exe if running from source (print-agent.js)
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

    If nodePath <> "" And fso.FileExists(strPath & "print-agent.js") Then
        WshShell.Run """" & nodePath & """ """ & strPath & "print-agent.js""", 0, False
    ElseIf fso.FileExists(strPath & "print-agent.js") Then
        ' Try system PATH node
        On Error Resume Next
        WshShell.Run "node """ & strPath & "print-agent.js""", 0, False
        If Err.Number <> 0 Then
            MsgBox "Please install Node.js or run print-agent.exe directly.", 16, "POS Print Agent Error"
        End If
        On Error GoTo 0
    Else
        MsgBox "print-agent.exe or print-agent.js not found in: " & vbCrLf & strPath, 16, "POS Print Agent Error"
    End If
End If
