#!/usr/bin/env bash
# Fetches one sample of each new A-Alerts source, so the parsers can be built against the real formats.
set -u
cd "$(dirname "$0")"
UA="A-Alerts/1.0 (+https://p2000-apeldoorn.nl)"
curl -sS -m 30 -A "$UA" -H "Accept: application/json" "https://api.public-warning.app/api/v1/providers/nl-alert/alerts" -o nlalert.json; echo "nl-alert $?"
curl -sS -m 30 -A "$UA" -H "Accept: application/json" "https://www.burgernet.nl/active" -o burgernet.json; echo "burgernet $?"
curl -sS -m 30 -A "$UA" -H "Accept: application/json" "https://www.knmi.nl/api/v1/weather-warnings.json" -o knmi.json; echo "knmi $?"
curl -sS -m 30 -A "$UA" -H "Accept: application/json" "https://www.knmi.nl/api/v1/weather-warnings/version" -o knmi-version.json; echo "knmi-version $?"
curl -sS -m 30 -A "$UA" "https://api.airplanes.live/v2/callsign/LIFELN3" -o airplaneslive-lifeln3.json; echo "airplanes.live $?"
curl -sS -m 30 -A "$UA" "https://api.adsb.lol/v2/callsign/LIFELN3" -o adsblol-lifeln3.json; echo "adsb.lol $?"
curl -sS -m 30 -A "$UA" "https://api.airplanes.live/v2/point/52.21/5.97/60" -o airplaneslive-point.json; echo "point $?"
ls -la
# run 1
