#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  apt-get update
  apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    file \
    libappindicator3-dev \
    libdbus-1-dev \
    librsvg2-dev \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    patchelf \
    pkg-config
else
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    file \
    libappindicator3-dev \
    libdbus-1-dev \
    librsvg2-dev \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    patchelf \
    pkg-config
fi

pkg-config --modversion dbus-1
pkg-config --modversion webkit2gtk-4.1
pkg-config --modversion gtk+-3.0
