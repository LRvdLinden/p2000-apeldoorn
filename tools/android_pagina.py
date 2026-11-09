#!/usr/bin/env python3
"""Puts version, build and size from website/downloads/android.json into website/android/index.html (static text and
JSON-LD), so a-alerts.nl/android/ always shows the APK that is online, also before the JavaScript has run."""
import json, re
info = json.load(open("website/downloads/android.json", encoding="utf-8"))
p = "website/android/index.html"
t = open(p, encoding="utf-8").read()
mb = f" · {info['size'] / 1048576:.1f} MB".replace(".", ",")
t = re.sub(r'<span id="ver">[^<]*</span>', f'<span id="ver">{info["version"]} ({info["build"]})</span>', t)
t = re.sub(r'<span id="size">[^<]*</span>', f'<span id="size">{mb}</span>', t)
t = re.sub(r'"softwareVersion":"[^"]*"', f'"softwareVersion":"{info["version"]}"', t)
open(p, "w", encoding="utf-8").write(t)
print(f"Android-pagina: {info['version']} ({info['build']}){mb}")
