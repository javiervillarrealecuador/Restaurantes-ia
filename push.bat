@echo off
cd /d C:\RESTAURANTES

echo === Eliminando lock files ===
del /f /q .git\HEAD.lock 2>nul
del /f /q .git\index.lock 2>nul

echo === Agregando archivos ===
git add .gitignore
git add next.config.mjs
git add src\app\api\sri\invoice\route.ts
git add src\app\api\sri\xml\route.ts
git add src\app\api\sri\settings\route.ts
git add src\components\Dashboard.tsx
git add src\components\OrderTable.tsx
git add src\lib\sri\firma.ts
git add src\lib\sri\ride.ts
git add src\lib\sri\db.ts
git add src\app\api\sri\next-seq\route.ts
git add src\app\api\sri\test-smtp\route.ts
git add test_firma2.js
git add sql\sri_schema.sql

echo === Estado ===
git status --short

echo === Commit ===
git commit -m "feat: secuencial manual en modal, SMTP por restaurante, fecha autorizacion"

echo === Push ===
git push

pause
