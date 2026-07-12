import { OCLClient } from '../client/OCLClient';
import { REST, Routes, Message } from 'discord.js';
import { db } from '../database/db';
import fs from 'fs';
import path from 'path';

export const readyEvent = async (client: OCLClient) => {
    console.log(`[SYS] Connected cleanly as application user: ${client.user?.tag}`);

    const commandsPayload: any[] = [];
    const interactionsPath = path.join(__dirname, '../interactions');

    const loadCommands = (dir: string) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) loadCommands(filePath);
            else if (file.endsWith('.ts') || file.endsWith('.js')) {
                const commandModule = require(filePath);
                const command = Object.values(commandModule).find((val: any) => val && val.data && val.data.name);
                if (command) {
                    client.commands.set((command as any).data.name, command);
                    commandsPayload.push((command as any).data.toJSON());
                }
            }
        }
    };
    loadCommands(interactionsPath);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), { body: commandsPayload });

    // 🔥 AUTOMATIC PROOF LISTENER 🔥
    client.on('messageCreate', async (message: Message) => {
        if (message.author.bot) return;
        const settings = await db.settings.findUnique({ where: { id: 'global' } });
        
        if (settings?.resultsChannelId && message.channel.id === settings.resultsChannelId) {
            const user = await db.user.findUnique({ where: { id: message.author.id } });
            if (user?.activeLeague) {
                const league = await db.league.findUnique({ where: { id: user.activeLeague } });
                if (league && league.status === 'ACTIVE' && !league.proofSubmitted) {
                    await db.league.update({ where: { id: league.id }, data: { proofSubmitted: true } });
                    await message.react('✅');
                    await message.reply(`✅ Match **${league.shortId}** results logged. Staff will review shortly.`);
                }
            }
        }
    });
};
