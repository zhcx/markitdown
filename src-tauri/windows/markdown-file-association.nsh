; Tauri's generated file association points DefaultIcon at the application
; executable. Override only the Markdown document class after installation so
; Explorer uses the dedicated document artwork bundled with MarkitDown.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\MarkitDown.Markdown\DefaultIcon" "" "$\"$INSTDIR\icons\markdown-file.ico$\",0"
  !insertmacro UPDATEFILEASSOC
!macroend
