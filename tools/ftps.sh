# shellcheck shell=bash
# Legacy compatibility: every A-Alerts website upload now uses ordinary passive FTP.
# Do NOT force TLS/FTPS here; source the shared FTP-only implementation.
source "$(dirname "${BASH_SOURCE[0]}")/ftp.sh"
ftps_connect() { ftp_connect "$@"; FTPS_TARGET="$FTP_TARGET"; }
ftps_run() { ftp_run "$@"; }
ftps_try() { ftp_run "$@"; }
