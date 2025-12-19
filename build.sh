#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Clean up from last time
echo "Cleaning up..."
rm -rf ./build

# Create build folders
mkdir -p ./build/public/
mkdir -p ./build/dist/

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