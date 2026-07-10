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
