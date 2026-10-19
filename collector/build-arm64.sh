rm -rf ./dist
mkdir -p ./dist

GOOS=linux GOARCH=arm64 go build -o collector-arm64 ./cmd/collector/main.go
mv collector-arm64 ./dist/

./build-collect.sh