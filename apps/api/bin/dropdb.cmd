@echo off
ruby "%~dp0pg-client.rb" dropdb %*
exit /b %ERRORLEVEL%
