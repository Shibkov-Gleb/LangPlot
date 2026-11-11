import { app, finishRoutes } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { registerCoreRoutes } from './routes.js';
import { recoverChats, registerChatRoutes } from './chat-routes.js';
import { recoverJobs, registerStudioRoutes } from './studio-routes.js';
await db.$connect();
if (config.UI_VARIANT === 'original') {
  await recoverChats();
  await recoverJobs();
}
registerCoreRoutes();
registerChatRoutes();
registerStudioRoutes();
finishRoutes();
const server = app.listen(config.PORT, config.HOST);
server.on('listening', () => console.log(`LangPlot API: http://${config.HOST}:${config.PORT}`));
server.on('error', (error) => {
  console.error('Не удалось запустить LangPlot API:', error.message);
  void db.$disconnect().finally(() => process.exit(1));
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    void db.$disconnect().finally(() => process.exit(1));
  }, 40000);
  deadline.unref();
  server.close(async (error) => {
    try {
      await db.$disconnect();
      clearTimeout(deadline);
      process.exit(error ? 1 : 0);
    } catch {
      process.exit(1);
    }
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
