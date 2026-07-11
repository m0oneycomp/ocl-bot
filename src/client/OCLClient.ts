import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';

export class OCLClient extends Client {
    public commands: Collection<string, any>;

    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.DirectMessages // 🥷 ALLOWS LISTENING TO DMs
            ],
            partials: [
                Partials.Channel, // 🥷 REQUIRED TO READ UNCACHED DM CHANNELS
                Partials.Message,
                Partials.User
            ]
        });
        this.commands = new Collection();
    }
}
