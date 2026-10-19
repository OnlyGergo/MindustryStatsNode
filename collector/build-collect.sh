cp -r migrations ./dist/
cd ./dist
zip -r ./collector.zip ./
echo "Collector build complete."
cd ..
