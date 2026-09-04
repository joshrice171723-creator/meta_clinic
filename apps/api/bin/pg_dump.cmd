@echo off
ruby "%~dp0pg-client.rb" pg_dump %*
exit /b %ERRORLEVEL%
