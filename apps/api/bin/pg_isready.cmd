@echo off
ruby "%~dp0pg-client.rb" pg_isready %*
exit /b %ERRORLEVEL%
