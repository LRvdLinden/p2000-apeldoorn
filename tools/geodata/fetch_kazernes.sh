#!/usr/bin/env bash
# One-off (GitHub Actions): fire stations, ambulance posts and police stations around Apeldoorn from OpenStreetMap.
set -u
cd "$(dirname "$0")/../.."
Q='[out:json][timeout:90];(nwr["amenity"="fire_station"](51.95,5.55,52.45,6.35);nwr["emergency"="ambulance_station"](51.95,5.55,52.45,6.35);nwr["amenity"="police"](51.95,5.55,52.45,6.35););out center tags;'
UA="A-Alerts/1.0 (https://p2000-apeldoorn.nl; github actions one-off)"
for host in https://overpass-api.de/api/interpreter https://overpass.private.coffee/api/interpreter https://maps.mail.ru/osm/tools/overpass/api/interpreter https://overpass.kumi.systems/api/interpreter; do
  echo "try $host"
  curl -s -m 120 -A "$UA" -H "Accept: application/json" --data-urlencode "data=$Q" "$host" -o /tmp/k.json
  if python3 -c "import json,sys;d=json.load(open('/tmp/k.json'));assert d['elements'];print(len(d['elements']))"; then cp /tmp/k.json tools/geodata/kazernes-osm.json; break; fi
  head -c 300 /tmp/k.json; echo
done
