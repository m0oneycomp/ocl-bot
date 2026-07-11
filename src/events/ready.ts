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

// 🥷 OMNI-READER: Converts Text, Embeds, Forwards, and Attachments into readable string data
const extractMessageData = (msg: Message): string => {
    let data = msg.content || '';
    
    // Read standard Embeds
    if (msg.embeds && msg.embeds.length > 0) {
        msg.embeds.forEach((e, i) => {
            data += `\n\n[EMBED ${i + 1}]\n`;
            if (e.title) data += `Title: ${e.title}\n`;
            if (e.description) data += `Description: ${e.description}\n`;
            if (e.fields) e.fields.forEach(f => data += `Field [${f.name}]: ${f.value}\n`);
            if (e.footer) data += `Footer: ${e.footer.text}\n`;
        });
    }

    // Read Native Discord "Forwarded" Messages
    if ('messageSnapshots' in msg && (msg as any).messageSnapshots.size > 0) {
        (msg as any).messageSnapshots.forEach((snap: any, index: number) => {
            data += `\n\n[FORWARDED MESSAGE SNAPSHOT ${index + 1}]\n`;
            if (snap.content) data += `Content: ${snap.content}\n`;
            if (snap.embeds && snap.embeds.length > 0) {
                snap.embeds.forEach((e: any, i: number) => {
                    data += `\n[Forwarded Embed ${i + 1}]\n`;
                    if (e.title) data += `Title: ${e.title}\n`;
                    if (e.description) data += `Description: ${e.description}\n`;
                    if (e.fields) e.fields.forEach((f: any) => data += `Field [${f.name}]: ${f.value}\n`);
                });
            }
        });
    }

    // List Attachments
    if (msg.attachments && msg.attachments.size > 0) {
        data += `\n\n[ATTACHMENTS]\n`;
        msg.attachments.forEach(a => {
            data += `File: ${a.name} (${a.contentType || 'Unknown Type'}) - URL: ${a.url}\n`;
        });
    }

    return data.trim();
};

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

        // Use the new Omni-Reader on your DM input
        let finalPrompt = extractMessageData(message);
        
        // Failsafe in case a user sends something entirely unreadable
        if (!finalPrompt) finalPrompt = "[User sent a message, but the text/embed content was empty or unreadable by the API.]";

        let groundedContext = '';

        // Context Link Parsing (Now uses the Omni-Reader on the fetched link too!)
        const messageUrlRegex = /discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
        const match = message.content.match(messageUrlRegex);

        if (match) {
            const [, guildId, channelId, messageId] = match;
            try {
                const guild = await client.guilds.fetch(guildId).catch(() => null);
                if (guild) {
                    const channel = await guild.channels.fetch(channelId).catch(() => null);
                    if (channel && 'messages' in channel) {
                        const targetMessage = await channel.messages.fetch(messageId).catch(() => null);
                        if (targetMessage) {
                            const extractedContext = extractMessageData(targetMessage);
                            groundedContext = `\n\n[CONTEXT MESSAGE FROM SYSTEM]:\nAuthor: @${targetMessage.author.username}\nChannel: #${channel.name}\nExtracted Data:\n"""\n${extractedContext}\n"""\n[END CONTEXT]\n\n`;
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

        const systemInstructionText = `You are a specialized developer assistant built directly inside a Discord management bot. 
You are currently speaking in a secure Direct Message channel. 
Live Environment Data:
- The user you are talking to: @${message.author.username}
- Their Discord User ID: ${message.author.id}
- Your Bot Client Username: @${client.user?.username}
- Current Server Time: ${new Date().toLocaleString()}

If the user asks who they are or who is messaging you, use the Live Environment Data above. 
If the user provides a [CONTEXT MESSAGE] block, or [EMBED] blocks, you MUST read its contents and analyze it as if you are looking at the live system data. Answer the user's questions about it directly and technically.`;

        const systemInstruction = { parts: [{ text: systemInstructionText }] };

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
