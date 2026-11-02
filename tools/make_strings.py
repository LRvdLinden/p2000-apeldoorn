#!/usr/bin/env python3
"""Builds P2000Apeldoorn/Localizable.xcstrings from every L("…")/Lf("…") key (nl = source, en from tools/en.json)."""
import re, glob, json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
keys = set()
for f in glob.glob(os.path.join(root, '**/*.swift'), recursive=True):
    for m in re.finditer(r'\bLf?\(\s*"((?:[^"\\]|\\.)*)"', open(f, encoding='utf-8').read()):
        keys.add(m.group(1).replace('\\"', '"'))
en = json.load(open(os.path.join(root, 'tools/en.json'), encoding='utf-8'))
# Also keep literal keys (App Intents / widget names) that appear as string literals in the sources.
alltext = "".join(open(f, encoding='utf-8').read() for f in glob.glob(os.path.join(root, '**/*.swift'), recursive=True))
for k in en:
    if '"' + k + '"' in alltext:
        keys.add(k)
missing = sorted(k for k in keys if k not in en)
if missing:
    print("Missing English:", *missing, sep="\n  "); sys.exit(1)
strings = {}
for k in sorted(keys):
    strings[k] = {"extractionState": "manual", "localizations": {
        "en": {"stringUnit": {"state": "translated", "value": en[k]}},
        "nl": {"stringUnit": {"state": "translated", "value": k}}}}
out = {"sourceLanguage": "nl", "strings": strings, "version": "1.0"}
for target in ["Shared/Localizable.xcstrings"]:
    with open(os.path.join(root, target), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2, sort_keys=True)
print(f"{len(keys)} strings")
