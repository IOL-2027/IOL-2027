#!/usr/bin/env bash
# Generate Thai phrase audio files using macOS Kanya voice.
# Outputs M4A (AAC) into public/audio/th/ — browsers support it natively.
set -e
OUT="$(dirname "$0")/../public/audio/th"
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

gen() {
  local text="$1" name="$2"
  local aiff="$TMP/$name.aiff"
  local out="$OUT/$name.m4a"
  say -v Kanya -r 130 -o "$aiff" "$text"
  afconvert "$aiff" "$out" -d aac -f m4af -b 64000
  echo "  ✓ $name.m4a"
}

echo "Generating Thai audio (Kanya, 130 wpm)…"
gen "สวัสดีครับ"          "sawatdee-khrap"
gen "สวัสดีค่ะ"           "sawatdee-kha"
gen "ขอบคุณครับ"          "khobkhun-khrap"
gen "ขอบคุณค่ะ"           "khobkhun-kha"
gen "ขอโทษครับ"           "khothoat-khrap"
gen "ขอโทษค่ะ"            "khothoat-kha"
gen "ไม่เป็นไร"           "mai-penrai"
gen "ใช่"                 "chai"
gen "ไม่ใช่"              "mai-chai"
gen "อร่อย"              "aroi"
gen "ชอบ"                "chob"
gen "ห้องน้ำอยู่ที่ไหน"    "hongnam"
gen "เท่าไหร่"            "thaorai"
gen "ช่วยด้วย"            "chuai-duai"
gen "พูดภาษาอังกฤษได้ไหม"  "phut-angkrit"
echo "Done — $(ls "$OUT"/*.m4a | wc -l | tr -d ' ') files in public/audio/th/"
