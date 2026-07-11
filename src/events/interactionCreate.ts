import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, GuildMember, AttachmentBuilder } from 'discord.js';
import { OCLClient } from '../client/OCLClient';
import { db } from '../database/db';
import { verifyPlayer } from '../services/verification';
import { logger } from '../utils/logger';
import { logCommand } from '../utils/commandLogger';
import { aiMemory } from '../utils/aiMemory';
import fs from 'fs';

const AUTHORIZED_DEVELOPER_ID = '1197110500333469720';

export const interactionCreateEvent = async (client: OCLClient, interaction: Interaction) => {
    try {
        if (interaction.isAutocomplete() && interaction.commandName === 'clan') {
            const focusedValue = interaction.options.getFocused();
            const clans = await db.clan.findMany({ where: { name: { contains: focusedValue, mode: 'insensitive' } }, take: 25 });
            return interaction.respond(clans.map(clan => ({ name: clan.name, value: clan.name })));
        }

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await logCommand(interaction);
            await command.execute(interaction);
        } 
        
        else if (interaction.isButton()) {
            if (interaction.customId.startsWith('join_match_') || interaction.customId.startsWith('leave_match_')) {
                await interaction.deferReply({ ephemeral: true });
                const isJoin = interaction.customId.startsWith('join_match_');
                const leagueId = interaction.customId.replace(isJoin ? 'join_match_' : 'leave_match_', '');
                const league = await db.league.findUnique({ where: { id: leagueId } });
                
                if (!league || league.status !== 'PENDING') return interaction.editReply('❌ Match is closed or generating teams.');
                
                if (isJoin) {
                    const user = await db.user.upsert({ where: { id: interaction.user.id }, update: {}, create: { id: interaction.user.id }});
                    if (user.activeLeague) return interaction.editReply('❌ You are already in an active queue.');
                    const count = await db.user.count({ where: { activeLeague: leagueId } });
                    if (count >= league.capacity) return interaction.editReply('❌ Queue is completely full.');
                    
                    const memberRoles = (interaction.member as GuildMember).roles.cache.map(r => r.id);
                    const authCheck = await verifyPlayer(interaction.user.id, interaction.guildId!, memberRoles);
                    if (!authCheck.verified) return interaction.editReply(`❌ ${authCheck.message}`);
                    
                    await db.user.update({ where: { id: interaction.user.id }, data: { activeLeague: leagueId } });
                    
                    if (league.vipServer) {
                        try { await interaction.user.send(`🔒 **OCL Match Joined**\nHere is your private server link for the match. Do not share this.\n${league.vipServer}`); } 
                        catch (e) { return interaction.editReply('✅ Joined the queue, but I could not DM you the VIP Server link. Please open your DMs.'); }
                    }
                } else {
                    if (interaction.user.id === league.hostId) return interaction.editReply('❌ The match host cannot abandon their own queue. Use `/match manage cancel` if you need to abort the match.');
                    const user = await db.user.findUnique({ where: { id: interaction.user.id } });
                    if (user?.activeLeague !== leagueId) return interaction.editReply('❌ You are not in this queue.');
                    await db.user.update({ where: { id: interaction.user.id }, data: { activeLeague: null } });
                }

                const newCount = await db.user.count({ where: { activeLeague: leagueId } });
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                embed.setDescription(`**Host:** <@${league.hostId}>\n**Region:** ${league.region}\n\n**Players Joined: ${newCount}/${league.capacity}**\n*Click Join Match to verify and receive the VIP server link.*`);
                await interaction.message.edit({ embeds: [embed] });
                
                if (isJoin && newCount === league.capacity) await interaction.channel?.send(`🚨 <@${league.hostId}>, the queue has reached capacity! Use \`/match teams\` to begin.`);
                
                return interaction.editReply(isJoin ? '✅ Joined the queue successfully! Check DMs for server link.' : '🚪 You left the queue.');
            }

            if (interaction.customId.startsWith('poll_vote_')) {
                const [, , choice, ...pollParts] = interaction.customId.split('_');
                const pollId = pollParts.join('_');
                const poll = await db.poll.findUnique({ where: { id: pollId } });
                if (!poll || !poll.active) return interaction.reply({ content: '❌ This poll is closed.', ephemeral: true });
                const existing = await db.pollVote.findFirst({ where: { pollId, userId: interaction.user.id } });
                if (existing) return interaction.reply({ content: '❌ You already voted.', ephemeral: true });
                await db.pollVote.create({ data: { pollId, userId: interaction.user.id, choice } });
                return interaction.reply({ content: `✅ Voted **${choice}**!`, ephemeral: true });
            }
        }

        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'dev_tools') {
                const selected = interaction.values[0];
                
                if (selected === 'download_logs') {
                    if (fs.existsSync('logs/error.log')) return interaction.reply({ content: '📄 **Here is your requested Error Log.**', files: [new AttachmentBuilder('logs/error.log')], ephemeral: true });
                    return interaction.reply({ content: '🧹 No errors have been recorded yet!', ephemeral: true });
                }
                
                if (selected === 'launch_ai') {
                    if (interaction.user.id !== AUTHORIZED_DEVELOPER_ID) return interaction.reply({ content: '⛔ Unauthorized.', ephemeral: true });
                    
                    const modal = new ModalBuilder().setCustomId('modal_ai_agent').setTitle('🧠 Ignite Agent & Send to DMs');
                    modal.addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('prompt').setLabel('Initial Instructions').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('link').setLabel('Message Link Context (Optional)').setStyle(TextInputStyle.Short).setRequired(false))
                    );
                    return interaction.showModal(modal);
                }

                return interaction.reply({ content: `💻 Executing Dev Operation: **${selected}**`, ephemeral: true });
            }
            
            if (interaction.customId === 'settings_selector') {
                const s = interaction.values[0];
                const set = await db.settings.findUnique({ where: { id: 'global' } });
                
                if (s === 'config_points') {
                    const m = new ModalBuilder().setCustomId('modal_points').setTitle('Edit Points');
                    m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('w').setLabel('Win').setStyle(TextInputStyle.Short).setValue(set?.winPoints.toString()||'25')), new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('l').setLabel('Loss').setStyle(TextInputStyle.Short).setValue(set?.losePoints.toString()||'0')), new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('k').setLabel('Kill').setStyle(TextInputStyle.Short).setValue(set?.killPoints.toString()||'5')));
                    return interaction.showModal(m);
                } 
                else if (s === 'config_roles') {
                    const m = new ModalBuilder().setCustomId('modal_roles').setTitle('Role Hierarchy Manager');
                    const hInput = new TextInputBuilder().setCustomId('h').setLabel('HiCom Role ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.hiComRoleId) hInput.setValue(set.hiComRoleId);
                    const mInput = new TextInputBuilder().setCustomId('m').setLabel('Match Hoster Role ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.matchHosterRoleId) mInput.setValue(set.matchHosterRoleId);
                    const cInput = new TextInputBuilder().setCustomId('c').setLabel('Community Verify Role ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.communityVerifyRoleId) cInput.setValue(set.communityVerifyRoleId);
                    m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(hInput), new ActionRowBuilder<TextInputBuilder>().addComponents(mInput), new ActionRowBuilder<TextInputBuilder>().addComponents(cInput));
                    return interaction.showModal(m);
                } 
                else if (s === 'config_channels') {
                    const m = new ModalBuilder().setCustomId('modal_channels').setTitle('Match Deployment Channels');
                    const rInput = new TextInputBuilder().setCustomId('r').setLabel('Ranked Channel ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.rankedChannelId) rInput.setValue(set.rankedChannelId);
                    const lInput = new TextInputBuilder().setCustomId('l').setLabel('League Channel ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.leagueChannelId) lInput.setValue(set.leagueChannelId);
                    const sInput = new TextInputBuilder().setCustomId('s').setLabel('Scrim Channel ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.scrimChannelId) sInput.setValue(set.scrimChannelId);
                    const cInput = new TextInputBuilder().setCustomId('c').setLabel('Casual Channel ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.casualChannelId) cInput.setValue(set.casualChannelId);
                    m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(rInput), new ActionRowBuilder<TextInputBuilder>().addComponents(lInput), new ActionRowBuilder<TextInputBuilder>().addComponents(sInput), new ActionRowBuilder<TextInputBuilder>().addComponents(cInput));
                    return interaction.showModal(m);
                }
                else if (s === 'config_apis') {
                    const m = new ModalBuilder().setCustomId('modal_apis').setTitle('API Keys');
                    const rInput = new TextInputBuilder().setCustomId('r').setLabel('RoVer API Key').setStyle(TextInputStyle.Short).setRequired(false); if (set?.roverApiKey) rInput.setValue(set.roverApiKey);
                    const bInput = new TextInputBuilder().setCustomId('b').setLabel('Bloxlink API Key').setStyle(TextInputStyle.Short).setRequired(false); if (set?.bloxlinkApiKey) bInput.setValue(set.bloxlinkApiKey);
                    m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(rInput), new ActionRowBuilder<TextInputBuilder>().addComponents(bInput));
                    return interaction.showModal(m);
                } 
                else if (s === 'config_toggles') {
                    const m = new ModalBuilder().setCustomId('modal_toggles').setTitle('Security Toggles (Type "true" or "false")');
                    m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('r').setLabel('Require RoVer').setStyle(TextInputStyle.Short).setValue(set?.roverEnabled?'true':'false')), new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('b').setLabel('Require Bloxlink').setStyle(TextInputStyle.Short).setValue(set?.bloxlinkEnabled?'true':'false')), new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('c').setLabel('Require Community Verify Role').setStyle(TextInputStyle.Short).setValue(set?.communityVerifyEnabled?'true':'false')));
                    return interaction.showModal(m);
                }
            }
        }
        else if (interaction.isModalSubmit()) {
            
            if (interaction.customId === 'modal_ai_agent') {
                await interaction.deferReply({ ephemeral: true });
                
                const prompt = interaction.fields.getTextInputValue('prompt');
                const contextLink = interaction.fields.getTextInputValue('link') || null;
                const apiKey = process.env.GEMINI_API_KEY?.trim();

                if (!apiKey) return interaction.editReply('❌ System configuration error: `GEMINI_API_KEY` is missing in .env');

                let groundedContext = '';
                if (contextLink) {
                    const messageUrlRegex = /discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
                    const match = contextLink.match(messageUrlRegex);
                    if (match) {
                        const [, , channelId, messageId] = match;
                        try {
                            const channel = await interaction.guild?.channels.fetch(channelId);
                            if (channel && 'messages' in channel) {
                                const targetMessage = await channel.messages.fetch(messageId);
                                groundedContext = `[Context Message from @${targetMessage.author.username} in #${channel.name}]:\n"${targetMessage.content}"\n\n`;
                            }
                        } catch (e) {
                            return interaction.editReply('⚠️ Unable to retrieve context message.');
                        }
                    }
                }

                // Clear memory for a fresh conversation block
                aiMemory.length = 0;
                
                const systemInstruction = { parts: [{ text: "You are a specialized developer assistant built directly inside a Discord management bot. You analyze system issues, inspect message contexts, and provide strategic instructions on how to maintain, patch, or configure the application." }] };
                const fullPromptPayload = `${groundedContext}Developer Request: ${prompt}`;

                // Push initial user query into memory
                aiMemory.push({ role: 'user', parts: [{ text: fullPromptPayload }] });

                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ systemInstruction, contents: aiMemory })
                    });

                    if (!response.ok) {
                        const rawErrorText = await response.text();
                        return interaction.editReply(`🚫 **Gemini API Rejected the Request**\n**Status Code:** \`${response.status}\`\n**Raw Error Output:** \`\`\`json\n${rawErrorText.substring(0, 1000)}\n\`\`\``);
                    }

                    const data = await response.json();
                    const aiOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;

                    if (!aiOutput) return interaction.editReply('❌ Received an empty response from the AI cluster.');

                    // Push AI response into memory
                    aiMemory.push({ role: 'model', parts: [{ text: aiOutput }] });

                    // DM the user the response instead of putting it in the channel
                    if (aiOutput.length > 2000) {
                        const chunks = aiOutput.match(/[\s\S]{1,1900}/g) || [];
                        await interaction.user.send(chunks[0]);
                        for (let i = 1; i < chunks.length; i++) {
                            await interaction.user.send(chunks[i]);
                        }
                    } else {
                        await interaction.user.send(aiOutput);
                    }
                    
                    await interaction.editReply('✅ **Agent deployed securely to your Direct Messages.** You can now chat continuously there.');
                } catch (apiError: any) {
                    await interaction.editReply(`❌ **Network Exception:** \`${apiError.message}\``);
                }
                return;
            }

            // ... Settings saves
            if (interaction.customId === 'modal_points') {
                await db.settings.upsert({ where: { id: 'global' }, update: { winPoints: parseInt(interaction.fields.getTextInputValue('w')), losePoints: parseInt(interaction.fields.getTextInputValue('l')), killPoints: parseInt(interaction.fields.getTextInputValue('k')) }, create: { id: 'global', winPoints: parseInt(interaction.fields.getTextInputValue('w')), losePoints: parseInt(interaction.fields.getTextInputValue('l')), killPoints: parseInt(interaction.fields.getTextInputValue('k')) }});
                return interaction.reply({ content: '✅ Points saved.', ephemeral: true });
            } else if (interaction.customId === 'modal_roles') {
                await db.settings.upsert({ where: { id: 'global' }, update: { hiComRoleId: interaction.fields.getTextInputValue('h') || null, matchHosterRoleId: interaction.fields.getTextInputValue('m') || null, communityVerifyRoleId: interaction.fields.getTextInputValue('c') || null }, create: { id: 'global' }});
                return interaction.reply({ content: '✅ Roles saved.', ephemeral: true });
            } else if (interaction.customId === 'modal_channels') {
                await db.settings.upsert({ where: { id: 'global' }, update: { rankedChannelId: interaction.fields.getTextInputValue('r') || null, leagueChannelId: interaction.fields.getTextInputValue('l') || null, scrimChannelId: interaction.fields.getTextInputValue('s') || null, casualChannelId: interaction.fields.getTextInputValue('c') || null }, create: { id: 'global' }});
                return interaction.reply({ content: '✅ Match deployment channels securely mapped.', ephemeral: true });
            } else if (interaction.customId === 'modal_apis') {
                await db.settings.upsert({ where: { id: 'global' }, update: { roverApiKey: interaction.fields.getTextInputValue('r') || null, bloxlinkApiKey: interaction.fields.getTextInputValue('b') || null }, create: { id: 'global' }});
                return interaction.reply({ content: '✅ APIs saved.', ephemeral: true });
            } else if (interaction.customId === 'modal_toggles') {
                await db.settings.upsert({ where: { id: 'global' }, update: { roverEnabled: interaction.fields.getTextInputValue('r').toLowerCase()==='true', bloxlinkEnabled: interaction.fields.getTextInputValue('b').toLowerCase()==='true', communityVerifyEnabled: interaction.fields.getTextInputValue('c').toLowerCase()==='true' }, create: { id: 'global' }});
                return interaction.reply({ content: '✅ Security settings updated.', ephemeral: true });
            }
        }
    } catch (error) {
        logger.error('Global Interaction Handler', error);
        if (interaction.isRepliable() && !interaction.replied) await interaction.reply({ content: '❌ System error logged.', ephemeral: true }).catch(() => null);
    }
};
