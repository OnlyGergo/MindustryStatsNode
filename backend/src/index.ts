import { createServer } from './server';

const PORT = process.env.SERVER_PORT || 3000;

async function main() {
  try {
    const server = await createServer();
    
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`WebSocket server running at ws://localhost:${PORT}/ws`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();