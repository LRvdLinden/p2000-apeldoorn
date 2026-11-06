#!/usr/bin/env bash
# Run inside the emulator runner: install, open each screen, screenshot, check for crashes.
set -x
mkdir -p shots
P=nl.lrvdlinden.aalerts
adb install -r app.apk
adb shell pm grant $P android.permission.POST_NOTIFICATIONS || true
adb logcat -c
shot() { sleep "$2"; adb exec-out screencap -p > "shots/$1.png"; }
# Welcome screen first
adb shell am start -n $P/.MainActivity; shot welkom 8
for tab in pager kaart statistieken instellingen waarschuwingen; do
  adb shell am force-stop $P
  adb shell am start -n $P/.MainActivity --ez skipWelkom true -e tab $tab
  shot $tab 14
done
# A real alert detail via a share link
GUID=$(curl -s "https://p2000-apeldoorn-api.lrvdlinden.workers.dev/v1/meldingen?limit=30" | python3 -c "import json,sys;l=json.load(sys.stdin);c=[m for m in l if m.get('locatie') and m.get('lat')] or l;print(c[0]['guid'])")
adb shell am start -a android.intent.action.VIEW -d "https://a-alerts.nl/melding/$GUID" $P; shot melding 14
adb shell input swipe 500 1800 500 600 400; shot melding-onder 3
WID=$(curl -s "https://p2000-apeldoorn-api.lrvdlinden.workers.dev/v1/waarschuwingen?days=14" | python3 -c "import json,sys;l=json.load(sys.stdin);print(l[0]['id'] if l else '')")
if [ -n "$WID" ]; then adb shell am start -a android.intent.action.VIEW -d "aalerts://waarschuwing/$WID" $P; shot waarschuwing 12; fi
adb shell am start -n $P/.MainActivity --ez skipWelkom true -e tab pager; sleep 3
adb shell input keyevent 82
adb logcat -d -b crash > shots/crash.txt
adb logcat -d | grep -E "AndroidRuntime|FATAL|$P" | tail -200 > shots/logcat.txt
if grep -q "FATAL EXCEPTION" shots/crash.txt; then cat shots/crash.txt; exit 1; fi
echo "Geen crashes"
# rerun 1793990107
