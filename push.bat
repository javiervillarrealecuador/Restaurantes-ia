@echo off
cd /d C:\RESTAURANTES

echo === Eliminando lock files ===
del /f /q .git\HEAD.lock 2>nul
del /f /q .git\index.lock 2>nul

echo === Reseteando index (sin tocar archivos) ===
git reset HEAD -- .

echo === Quitando archivos con credenciales del indice ===
git rm --cached test_cert.js 2>nul
git rm --cached test_invoice_full.js 2>nul
git rm --cached test_invoice_real.js 2>nul
git rm --cached test_pwd.js 2>nul
git rm --cached test_sb_p12.js 2>nul
git rm --cached "test_sb_p12.js.txt" 2>nul
git rm --cached test_autorizar.js 2>nul
git rm --cached guardar_firma.js 2>nul
git rm --cached fix_final.js 2>nul
git rm --cached fix_issuername.js 2>nul
git rm --cached fix_sb.js 2>nul
git rm --cached patch.js 2>nul
git rm --cached signed_test.xml 2>nul
git rm --cached signed_real.xml 2>nul
git rm --cached unsigned_real.xml 2>nul
git rm --cached sri_response_real.xml 2>nul
git rm --cached copiar_a_C.bat 2>nul
git rm --cached deploy_firma_rpc.bat 2>nul
git rm --cached hacer_deploy.bat 2>nul
git rm --cached push_now.bat 2>nul
git rm --cached deploy.bat 2>nul
git rm --cached Vercel 2>nul
git rm -r --cached "BASE XML SRI" 2>nul

echo === Agregando solo los archivos necesarios ===
git add .gitignore
git add src/app/api/sri/invoice/route.ts
git add src/app/api/sri/xml/route.ts
git add test_firma2.js
git add push.bat
git add next.config.mjs

echo === Estado actual ===
git status --short

echo === Commit ===
git commit -m "fix: XML autorizado con fecha hora Ecuador en email y descarga"

echo === Push ===
git push

pause
