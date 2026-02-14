/**
 * Local libp2p relay server for IPFS peer connectivity.
 * Run with: node scripts/libp2p-relay.mjs
 * 
 * This provides a circuit relay that browser/Tauri nodes can use
 * to reach each other when they can't connect directly.
 */
import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { tcp } from '@libp2p/tcp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 9010;

async function main() {
  const node = await createLibp2p({
    addresses: {
      listen: [
        `/ip4/0.0.0.0/tcp/${PORT}/ws`,
        `/ip4/0.0.0.0/tcp/${PORT + 1}`,
      ],
    },
    transports: [
      webSockets(),
      tcp(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: 100,
          reservationTtl: 60 * 60 * 1000, // 1 hour
          // Increase limits for file transfers (defaults: 128KB, 2min)
          defaultDataLimit: BigInt(1 << 24), // 16MB
          defaultDurationLimit: 10 * 60 * 1000, // 10 minutes
        },
        maxInboundHopStreams: 64,
        maxOutboundStopStreams: 64,
      }),
    },
    connectionManager: {
      maxConnections: 300,
      minConnections: 0,
    },
  });

  await node.start();

  const peerId = node.peerId.toString();
  const addrs = node.getMultiaddrs().map(a => a.toString());

  // Find the localhost WebSocket address
  const wsAddr = addrs.find(a => a.includes('/ws/p2p/'));
  const localWsAddr = wsAddr 
    ? wsAddr.replace(/\/ip4\/[^/]+\/tcp/, '/ip4/127.0.0.1/tcp')
    : `/ip4/127.0.0.1/tcp/${PORT}/ws/p2p/${peerId}`;

  // Write relay info to file for clients to read
  const relayInfo = {
    peerId,
    wsAddr: localWsAddr,
    addrs,
    timestamp: Date.now(),
  };
  
  const relayInfoPath = join(__dirname, '..', 'data', 'relay-info.json');
  try {
    writeFileSync(relayInfoPath, JSON.stringify(relayInfo, null, 2));
    console.log('Relay info written to:', relayInfoPath);
  } catch (e) {
    console.warn('Could not write relay info file:', e.message);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('           libp2p Relay Server Started');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('PeerId:', peerId);
  console.log('');
  console.log('Listening on:');
  addrs.forEach(a => console.log('  ', a));
  console.log('');
  console.log('WebSocket address for browsers:');
  console.log(`  ${localWsAddr}`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');

  // Log connections
  node.addEventListener('peer:connect', (evt) => {
    console.log(`[Relay] Peer connected: ${evt.detail.toString()}`);
  });

  node.addEventListener('peer:disconnect', (evt) => {
    console.log(`[Relay] Peer disconnected: ${evt.detail.toString()}`);
  });

  // Keep running
  process.on('SIGINT', async () => {
    console.log('\nShutting down relay...');
    await node.stop();
    process.exit(0);
  });
}

main().catch(console.error);
