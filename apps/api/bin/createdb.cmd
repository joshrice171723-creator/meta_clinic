@echo off
ruby "%~dp0pg-client.rb" createdb %*
exit /b %ERRORLEVEL%
