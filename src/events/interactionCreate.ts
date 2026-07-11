import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, GuildMember, AttachmentBuilder } from 'discord.js';
import { OCLClient } from '../client/OCLClient';
import { db } from '../database/db';
import { verifyPlayer } from '../services/verification';
import { logger } from '../utils/logger';
import { logCommand } from '../utils/commandLogger';
import fs from 'fs';

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
                    if (user.activeLeague) return interaction.editReply('❌ You are already in a queue.');
                    const count = await db.user.count({ where: { activeLeague: leagueId } });
                    if (count >= league.capacity) return interaction.editReply('❌ Queue is completely full.');
                    
                    const memberRoles = (interaction.member as GuildMember).roles.cache.map(r => r.id);
                    const authCheck = await verifyPlayer(interaction.user.id, interaction.guildId!, memberRoles);
                    if (!authCheck.verified) return interaction.editReply(`❌ ${authCheck.message}`);
                    
                    await db.user.update({ where: { id: interaction.user.id }, data: { activeLeague: leagueId } });
                    
                    if (league.vipServer) {
                        try {
                            await interaction.user.send(`🔒 **OCL Match Joined**\nHere is your private server link for the match. Do not share this.\n${league.vipServer}`);
                        } catch (e) {
                            return interaction.editReply('✅ Joined the queue, but I could not DM you the VIP Server link. Please open your DMs.');
                        }
                    }
                } else {
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
                return interaction.reply({ content: `💻 Executing Dev Operation: **${selected}**`, ephemeral: true });
            }
            
            if (interaction.customId === 'settings_selector') {
                const s = interaction.values[0];
                const set = await db.settings.findUnique({ where: { id: 'global' } });
                
                if (s === 'config_points') {
                    const m = new ModalBuilder().setCustomId('modal_points').setTitle('Edit Points');
                    m.addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('w').setLabel('Win').setStyle(TextInputStyle.Short).setValue(set?.winPoints.toString()||'25')),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('l').setLabel('Loss').setStyle(TextInputStyle.Short).setValue(set?.losePoints.toString()||'0')), 
                        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('k').setLabel('Kill').setStyle(TextInputStyle.Short).setValue(set?.killPoints.toString()||'5'))
                    );
                    await interaction.showModal(m);
                    return;
                } 
                else if (s === 'config_roles') {
                    const m = new ModalBuilder().setCustomId('modal_roles').setTitle('Role Hierarchy Manager');
                    
                    const hInput = new TextInputBuilder().setCustomId('h').setLabel('HiCom Role ID').setStyle(TextInputStyle.Short).setRequired(false);
                    if (set?.hiComRoleId) hInput.setValue(set.hiComRoleId);
                    else hInput.setValue('1525333690723471442');

                    const mInput = new TextInputBuilder().setCustomId('m').setLabel('Match Hoster Role ID').setStyle(TextInputStyle.Short).setRequired(false);
                    if (set?.matchHosterRoleId) mInput.setValue(set.matchHosterRoleId);

                    const cInput = new TextInputBuilder().setCustomId('c').setLabel('Community Verify Role ID').setStyle(TextInputStyle.Short).setRequired(false);
                    if (set?.communityVerifyRoleId) cInput.setValue(set.communityVerifyRoleId);

                    m.addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(hInput),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(mInput),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(cInput)
                    );
                    await interaction.showModal(m);
                    return;
                } 
                else if (s === 'config_apis') {
                    const m = new ModalBuilder().setCustomId('modal_apis').setTitle('API Keys');
                    
                    const rInput = new TextInputBuilder().setCustomId('r').setLabel('RoVer API Key').setStyle(TextInputStyle.Short).setRequired(false);
                    if (set?.roverApiKey) rInput.setValue(set.roverApiKey);

                    const bInput = new TextInputBuilder().setCustomId('b').setLabel('Bloxlink API Key').setStyle(TextInputStyle.Short).setRequired(false);
                    if (set?.bloxlinkApiKey) bInput.setValue(set.bloxlinkApiKey);

                    m.addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(rInput),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(bInput)
                    );
                    await interaction.showModal(m);
                    return;
                } 
                else if (s === 'config_toggles') {
                    const m = new ModalBuilder().setCustomId('modal_toggles').setTitle('Security Toggles (Type "true" or "false")');
                    m.addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('r').setLabel('Require RoVer').setStyle(TextInputStyle.Short).setValue(set?.roverEnabled?'true':'false')),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('b').setLabel('Require Bloxlink').setStyle(TextInputStyle.Short).setValue(set?.bloxlinkEnabled?'true':'false')),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('c').setLabel('Require Community Verify Role').setStyle(TextInputStyle.Short).setValue(set?.communityVerifyEnabled?'true':'false'))
                    );
                    await interaction.showModal(m);
                    return;
                }
            }
        }
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_points') {
                await db.settings.upsert({ where: { id: 'global' }, update: { winPoints: parseInt(interaction.fields.getTextInputValue('w')), losePoints: parseInt(interaction.fields.getTextInputValue('l')), killPoints: parseInt(interaction.fields.getTextInputValue('k')) }, create: { id: 'global', winPoints: parseInt(interaction.fields.getTextInputValue('w')), losePoints: parseInt(interaction.fields.getTextInputValue('l')), killPoints: parseInt(interaction.fields.getTextInputValue('k')) }});
                return interaction.reply({ content: '✅ Points saved.', ephemeral: true });
            } 
            else if (interaction.customId === 'modal_roles') {
                const h = interaction.fields.getTextInputValue('h') || null;
                const m = interaction.fields.getTextInputValue('m') || null;
                const c = interaction.fields.getTextInputValue('c') || null;
                await db.settings.upsert({ where: { id: 'global' }, update: { hiComRoleId: h, matchHosterRoleId: m, communityVerifyRoleId: c }, create: { id: 'global', hiComRoleId: h, matchHosterRoleId: m, communityVerifyRoleId: c }});
                return interaction.reply({ content: '✅ Roles saved.', ephemeral: true });
            } 
            else if (interaction.customId === 'modal_apis') {
                const r = interaction.fields.getTextInputValue('r') || null;
                const b = interaction.fields.getTextInputValue('b') || null;
                await db.settings.upsert({ where: { id: 'global' }, update: { roverApiKey: r, bloxlinkApiKey: b }, create: { id: 'global', roverApiKey: r, bloxlinkApiKey: b }});
                return interaction.reply({ content: '✅ APIs saved.', ephemeral: true });
            } 
            else if (interaction.customId === 'modal_toggles') {
                await db.settings.upsert({ where: { id: 'global' }, update: { roverEnabled: interaction.fields.getTextInputValue('r').toLowerCase()==='true', bloxlinkEnabled: interaction.fields.getTextInputValue('b').toLowerCase()==='true', communityVerifyEnabled: interaction.fields.getTextInputValue('c').toLowerCase()==='true' }, create: { id: 'global' }});
                return interaction.reply({ content: '✅ Security settings updated.', ephemeral: true });
            }
        }
    } catch (error) {
        logger.error('Global Interaction Handler', error);
        if (interaction.isRepliable() && !interaction.replied) await interaction.reply({ content: '❌ System error logged. Check `/dev` logs for details.', ephemeral: true }).catch(() => null);
    }
};
