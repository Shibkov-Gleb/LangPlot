import { app, finishRoutes } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { registerCoreRoutes } from './routes.js';
await db.$connect();
registerCoreRoutes();
finishRoutes();
const server = app.listen(config.PORT, config.HOST, () => console.log(`LangPlot API: http://${config.HOST}:${config.PORT}`));
async function shutdown() { server.close(); await db.$disconnect(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
