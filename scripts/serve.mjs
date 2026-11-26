// Keeps a throwaway instance running for manual exploration (Ctrl+C stops and wipes it).
import { BASE_URL, startInstance } from '../lib/instance.mjs';

const instance = await startInstance();
console.log(`Budgero running on ${BASE_URL} (data: ${instance.dataDir})`);
const stop = () => {
  instance.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
