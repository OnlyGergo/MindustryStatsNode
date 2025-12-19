#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Clean up from last time
echo "Cleaning up..."
rm -rf ./build

# Create build folders
mkdir -p ./build/public/
mkdir -p ./build/dist/

# 1. Get the current commit hash (short version)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# 2. Ask user for version
read -p "What version do you want? : " VERSION

# 3. Write to the shared file
echo "Updating shared version info..."
cat <<EOF > ./common/version.ts
export const VERSION = '$VERSION';
export const COMMIT = '$GIT_COMMIT';
export const BUILD_DATE = '$(date)';
EOF

# Build frontend
echo "Building frontend..."
cd ./frontend
npm install  # Optional: ensures dependencies are there
npm run build
cp -r ./dist/* ../build/public/
cd ..

# Build backend
echo "Building backend..."
cd ./backend
npm install  # Optional: ensures dependencies are there
npm run build
cp -r ./dist/* ../build/dist/
cp ./package.json ../build/
cp ./package-lock.json ../build/
cd ..

echo "Build completed successfully!"