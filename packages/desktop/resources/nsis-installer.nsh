!include "LogicLib.nsh"
!include "StrFunc.nsh"
!include "WinMessages.nsh"

${StrStr}
${UnStrTok}

Var WisCodeCliDir
Var WisCodePathCurrent
Var WisCodePathProbe
Var WisCodePathNeedle
Var WisCodePathNew
Var WisCodeToken

!macro WISCODE_BROADCAST_ENV
  System::Call 'user32::SendMessageTimeoutW(p 0xffff, i ${WM_SETTINGCHANGE}, p 0, w "STR:Environment", i 0, i 5000, *i .r0)'
!macroend

!macro customInstall
  StrCpy $WisCodeCliDir "$PROFILE\.wiscode\bin"
  CreateDirectory "$WisCodeCliDir"
  DetailPrint "WisCode: installing CLI to $WisCodeCliDir"

  ${If} ${FileExists} "$INSTDIR\resources\wiscode-cli.exe"
    CopyFiles /SILENT "$INSTDIR\resources\wiscode-cli.exe" "$WisCodeCliDir\wiscode.exe"
    DetailPrint "WisCode: copied from $INSTDIR\resources\wiscode-cli.exe"
  ${ElseIf} ${FileExists} "$INSTDIR\wiscode-cli.exe"
    CopyFiles /SILENT "$INSTDIR\wiscode-cli.exe" "$WisCodeCliDir\wiscode.exe"
    DetailPrint "WisCode: copied from $INSTDIR\wiscode-cli.exe"
  ${ElseIf} ${FileExists} "$INSTDIR\resources\wiscode-cli"
    CopyFiles /SILENT "$INSTDIR\resources\wiscode-cli" "$WisCodeCliDir\wiscode.exe"
    DetailPrint "WisCode: copied from $INSTDIR\resources\wiscode-cli"
  ${ElseIf} ${FileExists} "$INSTDIR\wiscode-cli"
    CopyFiles /SILENT "$INSTDIR\wiscode-cli" "$WisCodeCliDir\wiscode.exe"
    DetailPrint "WisCode: copied from $INSTDIR\wiscode-cli"
  ${Else}
    DetailPrint "WisCode: WARNING - wiscode-cli binary not found in $INSTDIR"
  ${EndIf}

  ${If} ${FileExists} "$INSTDIR\resources\uv.exe"
    CopyFiles /SILENT "$INSTDIR\resources\uv.exe" "$WisCodeCliDir\uv.exe"
    CopyFiles /SILENT "$INSTDIR\resources\uv-LICENSE-MIT" "$WisCodeCliDir\uv-LICENSE-MIT"
  ${Else}
    DetailPrint "WisCode: WARNING - bundled uv not found in $INSTDIR\resources"
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\resources\bmad\SOURCE.json"
    RMDir /r "$WisCodeCliDir\bmad"
    ExecWait '"$SYSDIR\xcopy.exe" "$INSTDIR\resources\bmad" "$WisCodeCliDir\bmad" /E /I /Y' $0
    ${If} $0 != 0
      DetailPrint "WisCode: WARNING - failed to copy BMAD resources (xcopy exit $0)"
    ${EndIf}
  ${Else}
    DetailPrint "WisCode: WARNING - bundled BMAD not found in $INSTDIR\resources"
  ${EndIf}

  ReadRegStr $WisCodePathCurrent HKCU "Environment" "Path"
  ${If} "$WisCodePathCurrent" == ""
    WriteRegExpandStr HKCU "Environment" "Path" "$WisCodeCliDir"
    DetailPrint "WisCode: wrote PATH=$WisCodeCliDir"
  ${Else}
    StrCpy $WisCodePathProbe ";$WisCodePathCurrent;"
    StrCpy $WisCodePathNeedle ";$WisCodeCliDir;"
    ${StrStr} $0 $WisCodePathProbe $WisCodePathNeedle
    ${If} "$0" == ""
      WriteRegExpandStr HKCU "Environment" "Path" "$WisCodePathCurrent;$WisCodeCliDir"
      DetailPrint "WisCode: appended $WisCodeCliDir to PATH"
    ${Else}
      DetailPrint "WisCode: $WisCodeCliDir already in PATH"
    ${EndIf}
  ${EndIf}

  !insertmacro WISCODE_BROADCAST_ENV
!macroend

!macro customUnInstall
  StrCpy $WisCodeCliDir "$PROFILE\.wiscode\bin"
  DetailPrint "WisCode: removing CLI from $WisCodeCliDir"
  Delete "$WisCodeCliDir\wiscode.exe"
  Delete "$WisCodeCliDir\uv.exe"
  Delete "$WisCodeCliDir\uv-LICENSE-MIT"
  RMDir /r "$WisCodeCliDir\bmad"
  RMDir "$WisCodeCliDir"

  ReadRegStr $WisCodePathCurrent HKCU "Environment" "Path"
  ${If} "$WisCodePathCurrent" != ""
    StrCpy $WisCodePathNew ""
    StrCpy $0 1

    loop:
      ${UnStrTok} $WisCodeToken "$WisCodePathCurrent" ";" "$0" "1"
      ${If} "$WisCodeToken" == ""
        Goto done
      ${EndIf}

      StrCpy $1 $WisCodeToken
      StrCpy $2 $1 1 -1
      ${If} $2 == "\"
        StrLen $3 $1
        IntOp $3 $3 - 1
        StrCpy $1 $1 $3
      ${EndIf}

      StrCpy $2 $WisCodeCliDir
      StrCpy $4 $2 1 -1
      ${If} $4 == "\"
        StrLen $3 $2
        IntOp $3 $3 - 1
        StrCpy $2 $2 $3
      ${EndIf}

      System::Call 'kernel32::CompareStringOrdinal(w "$1", i -1, w "$2", i -1, i 1)i.r5'
      IntCmp $5 2 skip

      ${If} "$WisCodePathNew" == ""
        StrCpy $WisCodePathNew $WisCodeToken
      ${Else}
        StrCpy $WisCodePathNew "$WisCodePathNew;$WisCodeToken"
      ${EndIf}

      skip:
      IntOp $0 $0 + 1
      Goto loop

    done:
    ${If} "$WisCodePathNew" == ""
      DeleteRegValue HKCU "Environment" "Path"
      DetailPrint "WisCode: removed PATH entry (PATH now empty)"
    ${Else}
      WriteRegExpandStr HKCU "Environment" "Path" "$WisCodePathNew"
      DetailPrint "WisCode: removed $WisCodeCliDir from PATH"
    ${EndIf}
  ${EndIf}

  !insertmacro WISCODE_BROADCAST_ENV
!macroend
