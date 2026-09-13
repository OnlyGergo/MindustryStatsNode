#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Clean up from last time
echo "Cleaning up..."
rm -rf ./build
rm -rf ./frontend/dist
rm -rf ./backend/dist

# Create build folders
mkdir -p ./build/public/
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

# Build frontend
echo "Building frontend..."
cd ./frontend
bun install  # Optional: ensures dependencies are there
bun run build
cp -r ./dist/* ../build/public/
cd ..

# Sort backend
echo "Building backend..."
cd ./backend
bunx tsc # We don't need the files, but we do need the checks
cp -r ./src/* ../build/backend/src/
cp ./package.json ../build/
cp ./bun.lock ../build/
cp -r ./migrations ../build/
cd ..
cp -r ./common ./build/

# Zip the build folder
echo "Creating zip archive..."
cd ./build
zip -r build.zip ./*
cd ..

echo "Build completed successfully!"
