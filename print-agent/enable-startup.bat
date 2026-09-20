@echo off
set SCRIPT="%TEMP%\CreateShortcut.vbs"
echo Set oWS = CreateObject("WScript.Shell") > %SCRIPT%
echo sLinkFile = oWS.SpecialFolders("Startup") ^& "\HumTumPrintAgent.lnk" >> %SCRIPT%
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %SCRIPT%

if exist "%~dp0start-silent.vbs" (
  echo oLink.TargetPath = "wscript.exe" >> %SCRIPT%
  echo oLink.Arguments = """%~dp0start-silent.vbs""" >> %SCRIPT%
  echo oLink.WorkingDirectory = "%~dp0" >> %SCRIPT%
) else if exist "%~dp0print-agent.js" (
  echo oLink.TargetPath = "node.exe" >> %SCRIPT%
  echo oLink.Arguments = """%~dp0print-agent.js""" >> %SCRIPT%
  echo oLink.WorkingDirectory = "%~dp0" >> %SCRIPT%
) else if exist "%~dp0build\print-agent.exe" (
  echo oLink.TargetPath = "%~dp0build\print-agent.exe" >> %SCRIPT%
  echo oLink.WorkingDirectory = "%~dp0build\" >> %SCRIPT%
) else (
  echo oLink.TargetPath = "%~dp0print-agent.exe" >> %SCRIPT%
  echo oLink.WorkingDirectory = "%~dp0" >> %SCRIPT%
)

echo oLink.Save >> %SCRIPT%
cscript /nologo %SCRIPT%
del %SCRIPT%

echo =======================================================
echo Auto-Start Enabled Successfully!
echo HumTum Print Agent will now start automatically in the background
echo whenever your Windows PC boots up.
echo.
echo Press any key to close this window.
echo =======================================================
pause > nul
