!include "LogicLib.nsh"
!include "StrFunc.nsh"
!include "WinMessages.nsh"

${StrStr}
${StrTok}

Var WisCodeCliDir
Var WisCodePathCurrent
Var WisCodePathProbe
Var WisCodePathNeedle
Var WisCodePathNew
Var WisCodeToken

!macro WISCODE_BROADCAST_ENV
  System::Call 'user32::SendMessageTimeoutW(p 0xffff, i ${WM_SETTINGCHANGE}, p 0, w "STR:Environment", i 0, i 5000, *i .r0)'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  StrCpy $WisCodeCliDir "$PROFILE\.wiscode\bin"
  CreateDirectory "$WisCodeCliDir"
  DetailPrint "WisCode: installing CLI to $WisCodeCliDir"

  ${If} ${FileExists} "$INSTDIR\wiscode-cli.exe"
    CopyFiles /SILENT "$INSTDIR\wiscode-cli.exe" "$WisCodeCliDir\wiscode.exe"
    DetailPrint "WisCode: copied from $INSTDIR\wiscode-cli.exe"
  ${ElseIf} ${FileExists} "$INSTDIR\resources\wiscode-cli.exe"
    CopyFiles /SILENT "$INSTDIR\resources\wiscode-cli.exe" "$WisCodeCliDir\wiscode.exe"
    DetailPrint "WisCode: copied from $INSTDIR\resources\wiscode-cli.exe"
  ${ElseIf} ${FileExists} "$INSTDIR\wiscode-cli"
    CopyFiles /SILENT "$INSTDIR\wiscode-cli" "$WisCodeCliDir\wiscode.exe"
    DetailPrint "WisCode: copied from $INSTDIR\wiscode-cli"
  ${ElseIf} ${FileExists} "$INSTDIR\resources\wiscode-cli"
    CopyFiles /SILENT "$INSTDIR\resources\wiscode-cli" "$WisCodeCliDir\wiscode.exe"
    DetailPrint "WisCode: copied from $INSTDIR\resources\wiscode-cli"
  ${Else}
    DetailPrint "WisCode: WARNING - wiscode-cli binary not found in $INSTDIR"
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

!macro NSIS_HOOK_POSTUNINSTALL
  StrCpy $WisCodeCliDir "$PROFILE\.wiscode\bin"
  DetailPrint "WisCode: removing CLI from $WisCodeCliDir"
  Delete "$WisCodeCliDir\wiscode.exe"
  RMDir "$WisCodeCliDir"

  ; Rebuild PATH by splitting on ; and skipping our entry (case-insensitive, trim \)
  ReadRegStr $WisCodePathCurrent HKCU "Environment" "Path"
  ${If} "$WisCodePathCurrent" != ""
    StrCpy $WisCodePathNew ""
    StrCpy $0 1  ; token index
    loop:
      ${StrTok} $WisCodeToken "$WisCodePathCurrent" ";" "$0" "1"
      ${If} "$WisCodeToken" == ""
        Goto done
      ${EndIf}
      ; Normalise: trim trailing backslash for comparison
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
      ; Case-insensitive compare via StrCmpS (0 = equal)
      System::Call 'kernel32::CompareStringOrdinal(w "$1", i -1, w "$2", i -1, i 1)i.r5'
      IntCmp $5 2 skip  ; CSTR_EQUAL = 2
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
