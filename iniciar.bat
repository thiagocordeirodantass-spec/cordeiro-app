@echo off
REM Script de inicializacao - NF-e / CT-e Consulta
echo ============================================================
echo  NF-e / CT-e - Consulta Local
echo ============================================================
echo.

REM Verifica Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado.
    echo.
    echo Instale o Node.js:
    echo   1) Acesse https://nodejs.org/
    echo   2) Baixe a versao LTS (recomendada)
    echo   3) Instale com opcoes padrao
    echo   4) Reinicie o terminal e execute este script novamente
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js encontrado:
node -v
echo.

cd /d "%~dp0backend"

if exist "node_modules" (
    echo [OK] Dependencias ja incluidas na pasta ^(node_modules^). Pulando npm.
) else (
    echo Pasta node_modules nao encontrada. Tentando "npm install" ^(precisa de internet^)...
    where npm >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERRO] npm nao encontrado e node_modules ausente.
        echo Copie novamente a pasta "backend\node_modules" do pacote original,
        echo ou instale o npm junto com o Node.js.
        pause
        exit /b 1
    )
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)

echo.
echo Iniciando servidor...
echo Acesse: http://localhost:3000
echo Pressione Ctrl+C para parar.
echo.
node server.js
pause
