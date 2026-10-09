build:
	npx @vscode/vsce package

install: build
	code --install-extension hunkwise-$$(node -p "require('./package.json').version").vsix --force
