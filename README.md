# BTCube Web

A TypeScript library for interacting with multiple models of bluetooth speedcubes via Web Bluetooth API.
It is an evolution of the previous qysc-web package which only supported the QY-SC

This library is availible on the NPM registry at https://www.npmjs.com/package/btcube-web
A sample app can be seen at https://simonkellly.github.io/btcube-web

## Features

- Web Bluetooth integration for QYSC devices
- Support for Moyu Smart cubes (Not sure which ones, at least v11 AI)
- Cube state management and manipulation
- RxJS integration for reactive programming
- TypeScript support with full type definitions

Note: The moyu protocol implementation is unfinished - particularly there is no handling of the gyro feature

This library follows closely to the standard set by [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth) and implements the qiyi smart cube protocol described at [qiyi_smartcube_protocol](https://github.com/Flying-Toast/qiyi_smartcube_protocol/) with some help from [qy-cube](https://github.com/agolovchuk/qy-cube/blob/main/LICENSE)

## Installation

```bash
npm install btcube-web
# or
yarn add btcube-web
# or
bun add btcube-web
```

## Usage

There is a very basic sample-app within this repository, but the core usage can be seen below.

```typescript
import { connectBTCube } from 'btcube-web';

// Connect to a speedcube
const cube = await connectBTCube();

// Listen for cube state changes
cube.events.moves.subscribe(move => {
  console.log('Cube Moved:', move);
});

// Disconnect when done
cube.disconnect();
```

## Development

This project uses Bun as the package manager and build tool.

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Publish the package to NPM
bun publish
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
