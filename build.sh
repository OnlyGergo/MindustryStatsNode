#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Clean up from last time
echo "Cleaning up..."
rm -rf ./build
rm -rf ./frontend/dist
rm -rf ./backend/dist

# Create build folders
mkdir -p ./build/backend/src/

# 1. Get the current commit hash (short version)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# 2. Ask user for version, default to current version from the ts file
CURRENT_VERSION="unknown"
if [ -f ./common/version_build.ts ]; then
  CURRENT_VERSION=$(grep -E "export const BUILD_VERSION" ./common/version_build.ts | sed -E "s/.*'([^']+)'.*/\1/" || echo "unknown")
fi
read -p "What version do you want? [${CURRENT_VERSION}] : " VERSION
VERSION=${VERSION:-$CURRENT_VERSION}

# 3. Write to the shared file
echo "Updating shared version info..."
cat <<EOF > ./common/version_build.ts
export const BUILD_VERSION = '$VERSION';
export const BUILD_COMMIT = '$GIT_COMMIT';
export const BUILD_BUILD_DATE = '$(date)';
EOF

# Workspace manifests + the single root lockfile, so `bun install --production
# --frozen-lockfile` in the release folder resolves exactly what was tested here.
# The frontend manifest is needed too: the SSR bundle imports react/tanstack at runtime.
echo "Installing dependencies..."
bun install --frozen-lockfile
cp ./package.json ./bun.lock ./bunfig.toml ./build/
mkdir -p ./build/frontend
cp ./frontend/package.json ./build/frontend/
cp ./backend/package.json ./build/backend/

# Build frontend (the backend serves it from frontend/dist)
echo "Building frontend..."
bun run build
cp -r ./frontend/dist ./build/frontend/

# Sort backend
echo "Building backend..."
(cd ./backend && bunx tsc) # We don't need the files, but we do need the checks
cp -r ./backend/src/* ./build/backend/src/
cp -r ./common ./build/

# Zip the build folder
echo "Creating zip archive..."
cd ./build
zip -r build.zip ./*
cd ..

echo "Build completed successfully!"
