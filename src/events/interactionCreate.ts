import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, GuildMember, AttachmentBuilder } from 'discord.js';
import { OCLClient } from '../client/OCLClient';
import { db } from '../database/db';
import { verifyUserRoblox } from '../services/rover';
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
            
            // 🚨 Secretly log the command before executing it
            await logCommand(interaction);
            await command.execute(interaction);
        } 
        
        else if (interaction.isButton()) {
            if (interaction.customId.startsWith('join_match_')) {
                await interaction.deferReply({ ephemeral: true });
                const leagueId = interaction.customId.replace('join_match_', '');
                const league = await db.league.findUnique({ where: { id: leagueId } });
                if (!league || league.status !== 'PENDING') return interaction.editReply('❌ Match is no longer accepting players.');
                const user = await db.user.upsert({ where: { id: interaction.user.id }, update: {}, create: { id: interaction.user.id }});
                if (user.activeLeague) return interaction.editReply('❌ You are already in an active match queue.');
                const playerCount = await db.user.count({ where: { activeLeague: leagueId } });
                if (playerCount >= league.capacity) return interaction.editReply('❌ This match is completely full (10/10).');
                
                const memberRoles = (interaction.member as GuildMember).roles.cache.map(r => r.id);
                const roverCheck = await verifyUserRoblox(interaction.user.id, interaction.guildId!, memberRoles);
                if (!roverCheck.verified) return interaction.editReply(`❌ ${roverCheck.message}`);
                
                await db.user.update({ where: { id: interaction.user.id }, data: { activeLeague: leagueId } });
                const newCount = playerCount + 1;
                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                originalEmbed.setDescription(`**Host:** <@${league.hostId}>\n\n**Players Joined: ${newCount}/${league.capacity}**\n*Click below to enter the queue.*`);
                await interaction.message.edit({ embeds: [originalEmbed] });
                if (newCount === league.capacity) await interaction.channel?.send(`🚨 <@${league.hostId}>, the queue has reached 10/10 capacity! Please use \`/match teams\` to begin.`);
                return interaction.editReply('✅ You successfully joined the match queue!');
            }
            if (interaction.customId.startsWith('leave_match_')) {
                const leagueId = interaction.customId.replace('leave_match_', '');
                await db.user.update({ where: { id: interaction.user.id }, data: { activeLeague: null } });
                const playerCount = await db.user.count({ where: { activeLeague: leagueId } });
                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                originalEmbed.setDescription(`**Host:** <@${interaction.message.embeds[0].description?.match(/<@(\d+)>/)?.[1]}>\n\n**Players Joined: ${playerCount}/10**\n*Click below to enter the queue.*`);
                await interaction.message.edit({ embeds: [originalEmbed] });
                return interaction.reply({ content: '🚪 You have left the match queue.', ephemeral: true });
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
                    if (fs.existsSync('logs/error.log')) {
                        const file = new AttachmentBuilder('logs/error.log');
                        return interaction.reply({ content: '📄 **Here is your requested Error Log.**', files: [file], ephemeral: true });
                    }
                    return interaction.reply({ content: '🧹 No errors have been recorded yet!', ephemeral: true });
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
                    const m = new ModalBuilder().setCustomId('modal_roles').setTitle('Role Hierarchy');
                    m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('r').setLabel('HiCom Role ID').setStyle(TextInputStyle.Short).setValue(set?.hiComRoleId||'1525333690723471442').setRequired(true)));
                    return interaction.showModal(m);
                }
                else if (s === 'config_rover') {
                    const m = new ModalBuilder().setCustomId('modal_rover').setTitle('RoVer API');
                    m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('k').setLabel('API Key').setStyle(TextInputStyle.Short).setValue(set?.roverApiKey||'').setRequired(true)), new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('t').setLabel('Enabled (true/false)').setStyle(TextInputStyle.Short).setValue(set?.roverEnabled?'true':'false').setRequired(true)));
                    return interaction.showModal(m);
                }
            }
        }
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_points') {
                await db.settings.upsert({ where: { id: 'global' }, update: { winPoints: parseInt(interaction.fields.getTextInputValue('w')), losePoints: parseInt(interaction.fields.getTextInputValue('l')), killPoints: parseInt(interaction.fields.getTextInputValue('k')) }, create: { id: 'global', winPoints: parseInt(interaction.fields.getTextInputValue('w')), losePoints: parseInt(interaction.fields.getTextInputValue('l')), killPoints: parseInt(interaction.fields.getTextInputValue('k')) }});
                return interaction.reply({ content: '✅ Points saved.', ephemeral: true });
            }
            else if (interaction.customId === 'modal_roles') {
                await db.settings.upsert({ where: { id: 'global' }, update: { hiComRoleId: interaction.fields.getTextInputValue('r') }, create: { id: 'global', hiComRoleId: interaction.fields.getTextInputValue('r') }});
                return interaction.reply({ content: '✅ HiCom Role saved.', ephemeral: true });
            }
            else if (interaction.customId === 'modal_rover') {
                const e = interaction.fields.getTextInputValue('t').toLowerCase() === 'true';
                await db.settings.upsert({ where: { id: 'global' }, update: { roverApiKey: interaction.fields.getTextInputValue('k'), roverEnabled: e }, create: { id: 'global', roverApiKey: interaction.fields.getTextInputValue('k'), roverEnabled: e }});
                return interaction.reply({ content: '✅ RoVer settings saved.', ephemeral: true });
            }
        }
    } catch (error) {
        logger.error('Global Interaction Handler', error);
        if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({ content: '❌ A critical system error occurred. This has been logged.', ephemeral: true }).catch(() => null);
        }
    }
};
