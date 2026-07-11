import { OCLClient } from '../client/OCLClient';
import { REST, Routes, ChannelType, Message } from 'discord.js';
import { developerCommand } from '../interactions/developer/developer';
import { settingsCommand } from '../interactions/settings/settings';
import { matchCommand } from '../interactions/match/match';
import { clanCommand } from '../interactions/clan/clan';
import { strikeCommand } from '../interactions/moderation/strike';
import { pollCommand } from '../interactions/utility/poll';
import { hubCommand } from '../interactions/hub/hub';
import { hicomCommand } from '../interactions/moderation/hicom';
import { aiMemory } from '../utils/aiMemory';

const AUTHORIZED_DEVELOPER_ID = '1197110500333469720';

export const readyEvent = async (client: OCLClient) => {
    console.log(`[SYS] Connected cleanly as application user: ${client.user?.tag}`);

    const commandCollection = [ developerCommand, settingsCommand, matchCommand, clanCommand, strikeCommand, pollCommand, hubCommand, hicomCommand ];

    for (const cmd of commandCollection) client.commands.set(cmd.data.name, cmd);

    const payload = commandCollection.map(cmd => cmd.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), { body: payload });
        console.log('[SYS] Cluster commands deployed. Core engine live and listening.');
    } catch (error) {
        console.error('[CRIT] Core synchronization deployment error:', error);
    }

    client.on('messageCreate', async (message: Message) => {
        if (message.author.bot) return;
        if (message.channel.type !== ChannelType.DM) return;
        if (message.author.id !== AUTHORIZED_DEVELOPER_ID) return;

        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (!apiKey) return;

        await message.channel.sendTyping();

        let finalPrompt = message.content;
        let groundedContext = '';

        // 🧠 ACTIVE LINK PARSER: If you paste a link in DMs, the bot will now fetch it.
        const messageUrlRegex = /discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
        const match = message.content.match(messageUrlRegex);

        if (match) {
            const [, guildId, channelId, messageId] = match;
            try {
                // Ensure the bot is in the server the link points to
                const guild = await client.guilds.fetch(guildId).catch(() => null);
                if (guild) {
                    const channel = await guild.channels.fetch(channelId).catch(() => null);
                    if (channel && 'messages' in channel) {
                        const targetMessage = await channel.messages.fetch(messageId).catch(() => null);
                        if (targetMessage) {
                            groundedContext = `\n\n[CONTEXT MESSAGE FROM SYSTEM]:\nAuthor: @${targetMessage.author.username}\nChannel: #${channel.name}\nContent: "${targetMessage.content}"\n[END CONTEXT]\n\n`;
                            // Replace the raw link in the prompt with the actual context so the AI doesn't get confused
                            finalPrompt = finalPrompt.replace(messageUrlRegex, groundedContext);
                        }
                    }
                }
            } catch (e) {
                console.error("Agent failed to fetch context link:", e);
            }
        }

        aiMemory.push({ role: 'user', parts: [{ text: finalPrompt }] });

        if (aiMemory.length > 20) aiMemory.splice(0, aiMemory.length - 20);

        // Updated instructions so the AI knows to prioritize the [CONTEXT MESSAGE] block
        const systemInstruction = { parts: [{ text: "You are a specialized developer assistant built directly inside a Discord management bot. If the user provides a [CONTEXT MESSAGE] block, you MUST read its contents and analyze it. Do not just explain what a Discord link is. Actually read the text provided in the context block and answer the user's question about it." }] };

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemInstruction, contents: aiMemory })
            });

            if (!response.ok) {
                aiMemory.pop(); 
                const errorText = await response.text();
                await message.reply(`🚫 **API Error [${response.status}]**\n\`\`\`json\n${errorText.substring(0, 500)}\n\`\`\``);
                return;
            }

            const data = await response.json();
            const aiOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!aiOutput) {
                aiMemory.pop();
                await message.reply('❌ Received empty response from AI.');
                return;
            }

            aiMemory.push({ role: 'model', parts: [{ text: aiOutput }] });

            if (aiOutput.length > 2000) {
                const chunks = aiOutput.match(/[\s\S]{1,1900}/g) || [];
                for (const chunk of chunks) await message.reply(chunk);
            } else {
                await message.reply(aiOutput);
            }
        } catch (error: any) {
            aiMemory.pop();
            await message.reply(`❌ **Network Exception:** \`${error.message}\``);
        }
    });
};
