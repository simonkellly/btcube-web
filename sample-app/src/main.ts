import { connectSmartCube } from "@/index";
import { TwistyPlayer } from "cubing/twisty";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import type { CubeStateEvent, CubeMoveEvent } from "../../src/events";
import './index.css';

const app = document.getElementById('app')!;
app.innerHTML = `
  <h1>BTCube Web</h1>
  <h3>
    <a href="https://github.com/simonkellly/btcube-web">GitHub</a>
    <a href="https://www.npmjs.com/package/btcube-web">NPM</a>
  </h3>
  <p id="status">No cube connected</p>
  <div class="button-container">
    <button id="connect">Connect</button>
    <button id="disconnect">Disconnect</button>
    <button id="reset">Mark Solved</button>
    <button id="clear">Clear Moves</button>
  </div>
  <p id="moves" style="font-family: monospace;">
    Moves will be displayed here
  </p>
  <div id="player" />
`;

let sync: (() => Promise<void>) | undefined = undefined;
let disconnect: (() => Promise<void>) | undefined = undefined;

const movesParagraph = document.getElementById('moves')!;
const status = document.getElementById('status')!;

const player = new TwistyPlayer({
  background: 'none',
  hintFacelets: 'none',
  controlPanel: 'none',
  cameraLatitude: 25,
  cameraLongitude: 25,
  tempoScale: 5,
  backView: 'top-right'
});
player.style.width = 'calc(500px - 4rem)';
player.style.height = '200px';

document.getElementById('player')?.appendChild(player);

document.getElementById('connect')?.addEventListener('click', async () => {
  const cube = await connectSmartCube(() => {
    // Show helpful information about MAC address and Chrome internals
    const helpText = `To connect to your GAN smart cube, you need to provide its MAC address.

How to find your cube's MAC address:

• Chrome on Windows/Linux/Android: 
  Open chrome://bluetooth-internals/#devices
  Scan for devices while your cube is in pairing mode
  Find your cube in the "Address" column

• macOS: 
  Connect your cube first, then Alt-click the Bluetooth icon in menu bar
  Or run: system_profiler SPBluetoothDataType in Terminal

• Android: 
  Use the free "nRF Connect" app from Google Play

Note: For Chrome, enable chrome://flags/#enable-experimental-web-platform-features
More info: https://gist.github.com/afedotov/52057533a8b27a0277598160c384ae71`;

    // Get saved MAC address from localStorage
    const savedMacAddress = localStorage.getItem('btcube-mac-address');
    
    const macAddress = prompt(helpText + '\n\nEnter your cube\'s MAC address (format: AB:12:34:5D:34:12):', savedMacAddress || '');
    
    if (!macAddress) {
      throw new Error('MAC address is required to connect to the cube');
    }
    
    // Save the MAC address to localStorage for future use
    localStorage.setItem('btcube-mac-address', macAddress);
    
    return Promise.resolve(macAddress);
  });
  sync = cube.commands.sync;
  disconnect = cube.commands.disconnect;
  
  cube.events.state.subscribe(async (event: CubeStateEvent) => {
    if (event.type === 'state' || event.type === 'freshState') return;

    status!.textContent = `Cube connected: ${cube.device.name}`;
    const solution = await experimentalSolve3x3x3IgnoringCenters(event.pattern as any);
    const scramble = solution.invert();
    movesParagraph.textContent = '';
    player.alg = scramble.toString();
  });

  cube.events.moves.subscribe((move: CubeMoveEvent) => {
    movesParagraph.textContent += move.move + ' ';
    player.experimentalAddMove(move.move);
  });
});

document.getElementById('disconnect')?.addEventListener('click', async () => {
  if (disconnect) {
    await disconnect();
    status.textContent = 'No cube connected';
    movesParagraph.textContent = '';
    player.alg = "";
  }
});

document.getElementById('reset')?.addEventListener('click', async () => {
  if (sync) {
    await sync();
  }
});

document.getElementById('clear')?.addEventListener('click', () => {
  movesParagraph.textContent = '';
});
