@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0deploy_ionic.ps1" %*
