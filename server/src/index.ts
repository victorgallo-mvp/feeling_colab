import { createApp } from './app.js';
import { config } from './config.js';
import { startJobs } from './jobs/index.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`API em ${config.apiUrl} (docs: ${config.apiUrl}/api/docs)`);
  if (config.cronEnabled) startJobs();
});
