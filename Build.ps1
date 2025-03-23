# Clean up from last time
Remove-Item -Path "./build" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "./build.zip" -Recurse -Force -ErrorAction SilentlyContinue

# Create build folders
mkdir "./build"
mkdir "./build/public/"
mkdir "./build/dist/"

# Build frontend
Write-Output "Building frontend..."
Set-Location "./frontend"
npm run build
Copy-Item -r "./dist/*" "../build/public/"
Set-Location ".."

# Build backend
Write-Output "Building backend..."
Set-Location "./backend"
npm run build
Copy-Item -r "./dist/*" "../build/dist/"
Copy-Item "./package.json" "../build/"
Copy-Item "./package-lock.json" "../build/"
Set-Location ".."

Write-Output "Build completed successfully!"