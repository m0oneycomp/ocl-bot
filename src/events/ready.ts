import { OCLClient } from '../client/OCLClient';
import { REST, Routes } from 'discord.js';
import { developerCommand } from '../interactions/developer/developer';
import { settingsCommand } from '../interactions/settings/settings';
import { matchCommand } from '../interactions/match/match';
import { clanCommand } from '../interactions/clan/clan';
import { strikeCommand } from '../interactions/moderation/strike';
import { pollCommand } from '../interactions/utility/poll';
import { hubCommand } from '../interactions/hub/hub';

export const readyEvent = async (client: OCLClient) => {
    console.log(`[SYS] Connected cleanly as application user: ${client.user?.tag}`);

    const commandCollection = [ developerCommand, settingsCommand, matchCommand, clanCommand, strikeCommand, pollCommand, hubCommand ];

    for (const cmd of commandCollection) client.commands.set(cmd.data.name, cmd);

    const payload = commandCollection.map(cmd => cmd.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), { body: payload });
        console.log('[SYS] Cluster commands deployed. Core engine live and listening.');
    } catch (error) {
        console.error('[CRIT] Core synchronization deployment error:', error);
    }
};
