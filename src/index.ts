import { config } from 'dotenv';
import { OCLClient } from './client/OCLClient';
import { readyEvent } from './events/ready';
import { interactionCreateEvent } from './events/interactionCreate';
config();

const client = new OCLClient();

// 🔥 Changed 'ready' to 'clientReady' to stop the warning
client.once('clientReady', () => readyEvent(client));
client.on('interactionCreate', (interaction) => interactionCreateEvent(client, interaction));

client.login(process.env.DISCORD_TOKEN);

// 🛡️ CRITICAL SAFETY NET: Prevents the bot from crashing on unhandled errors
process.on('uncaughtException', (error) => {
    console.error('[CRIT] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRIT] Unhandled Rejection at:', promise, 'reason:', reason);
});
