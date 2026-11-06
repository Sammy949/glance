; glance installer hooks (NSIS, wired up in tauri.conf.json).
;
; Puts the install folder on the current user's PATH so `glance notes.md`
; works from a terminal, and takes it off again on uninstall. glance installs
; per user, so this only touches HKCU and needs no admin prompt.
;
; NSIS strings have a fixed size. A PATH too long to read comes back empty with
; the error flag set, and writing that back would wipe it. So PATH is only
; rewritten when it was read whole, and with room to spare.

!include "WinMessages.nsh"
!include "WordFunc.nsh"

!define GLANCE_PATH_HEADROOM 260

!macro NSIS_HOOK_POSTINSTALL
  ClearErrors
  ReadRegStr $R0 HKCU "Environment" "Path"
  IfErrors glance_path_add_done
  StrLen $R1 $R0
  IntOp $R2 ${NSIS_MAX_STRLEN} - ${GLANCE_PATH_HEADROOM}
  IntCmp $R1 $R2 glance_path_add_done 0 glance_path_add_done
  ; Already there? Compare whole entries, not substrings.
  StrCpy $R1 ";$R0;"
  ${WordReplace} "$R1" ";$INSTDIR;" ";" "+*" $R2
  StrCmp $R1 $R2 0 glance_path_add_done
  StrCmp $R0 "" 0 glance_path_add_append
    StrCpy $R0 "$INSTDIR"
    Goto glance_path_add_write
  glance_path_add_append:
    StrCpy $R2 $R0 1 -1
    StrCmp $R2 ";" 0 +3
      StrCpy $R0 "$R0$INSTDIR"
      Goto glance_path_add_write
    StrCpy $R0 "$R0;$INSTDIR"
  glance_path_add_write:
    WriteRegExpandStr HKCU "Environment" "Path" "$R0"
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  glance_path_add_done:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ClearErrors
  ReadRegStr $R0 HKCU "Environment" "Path"
  IfErrors glance_path_remove_done
  StrLen $R1 $R0
  IntOp $R2 ${NSIS_MAX_STRLEN} - ${GLANCE_PATH_HEADROOM}
  IntCmp $R1 $R2 glance_path_remove_done 0 glance_path_remove_done
  StrCpy $R1 ";$R0;"
  ${WordReplace} "$R1" ";$INSTDIR;" ";" "+*" $R2
  StrCmp $R1 $R2 glance_path_remove_done
  ; Drop the separators added above.
  StrCpy $R2 $R2 "" 1
  StrCpy $R2 $R2 -1
  WriteRegExpandStr HKCU "Environment" "Path" "$R2"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  glance_path_remove_done:
!macroend
