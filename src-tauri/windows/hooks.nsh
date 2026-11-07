; glance installer hooks (NSIS, wired up in tauri.conf.json).
;
; Puts the install folder on the current user's PATH so `glance notes.md`
; works from a terminal, and takes it off again on uninstall. glance installs
; per user, so this only touches HKCU and needs no admin prompt.
;
; PATH is edited by Windows PowerShell, not in NSIS: NSIS strings have a fixed
; size (often 1024 characters) and many real PATHs are longer, so reading PATH
; into NSIS could truncate it. The script reads the raw registry value (keeping
; %VARIABLES% unexpanded), adds or removes only the exact install folder entry,
; and leaves every other byte alone. NSIS then tells Windows the environment
; changed. `$$` is NSIS's escape for a literal `$`.

!include "WinMessages.nsh"

!define GLANCE_PS `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command`
!define GLANCE_PS_READ `$$k=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment');$$p=[string]$$k.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);$$d='$INSTDIR'`

!macro NSIS_HOOK_POSTINSTALL
  nsExec::Exec `${GLANCE_PS} "${GLANCE_PS_READ};if(@($$p -split ';') -notcontains $$d){$$n=if($$p -eq ''){$$d}elseif($$p.EndsWith(';')){$$p+$$d+';'}else{$$p+';'+$$d};$$k.SetValue('Path',$$n,'ExpandString')}"`
  Pop $0
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  nsExec::Exec `${GLANCE_PS} "${GLANCE_PS_READ};$$n=(';'+$$p+';') -replace (';'+[regex]::Escape($$d)+'(?=;)'),'';$$n=$$n -replace '^;','' -replace ';$$','';if($$n -cne $$p){$$k.SetValue('Path',$$n,'ExpandString')}"`
  Pop $0
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
