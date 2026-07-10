import { Client, GatewayIntentBits, Collection } from 'discord.js';

export class OCLClient extends Client {
    public commands: Collection<string, any> = new Collection();
    public components: Collection<string, any> = new Collection();

    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
            ],
        });
    }
}
