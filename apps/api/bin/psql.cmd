@echo off
ruby "%~dp0pg-client.rb" psql %*
exit /b %ERRORLEVEL%
