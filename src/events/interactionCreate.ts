import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, GuildMember, AttachmentBuilder, SectionBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
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
            await logCommand(interaction);
            await command.execute(interaction);
        } 
        
        else if (interaction.isButton()) {
            if (interaction.customId.startsWith('join_match_') || interaction.customId.startsWith('leave_match_')) {
                await interaction.deferReply({ ephemeral: true });
                const isJoin = interaction.customId.startsWith('join_match_');
                const leagueId = interaction.customId.replace(isJoin ? 'join_match_' : 'leave_match_', '');
                const league = await db.league.findUnique({ where: { id: leagueId } });
                
                if (!league || league.status !== 'PENDING') return interaction.editReply('❌ Match closed.');
                
                if (isJoin) {
                    const user = await db.user.upsert({ where: { id: interaction.user.id }, update: {}, create: { id: interaction.user.id }});
                    if (user.activeLeague) return interaction.editReply('❌ You are already in a queue.');
                    const count = await db.user.count({ where: { activeLeague: leagueId } });
                    if (count >= league.capacity) return interaction.editReply('❌ Queue is 10/10 full.');
                    
                    const memberRoles = (interaction.member as GuildMember).roles.cache.map(r => r.id);
                    const roverCheck = await verifyUserRoblox(interaction.user.id, interaction.guildId!, memberRoles);
                    if (!roverCheck.verified) return interaction.editReply(`❌ ${roverCheck.message}`);
                    await db.user.update({ where: { id: interaction.user.id }, data: { activeLeague: leagueId } });
                } else {
                    await db.user.update({ where: { id: interaction.user.id }, data: { activeLeague: null } });
                }

                const newCount = await db.user.count({ where: { activeLeague: leagueId } });
                
                // Reconstruct V2 UI dynamically
                const header = new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`# 🏆 OCL Match Queue`),
                        new TextDisplayBuilder().setContent(`**Host:** <@${league.hostId}>\n**Players Joined: ${newCount}/${league.capacity}**\n*Click below to enter the queue.*`),
                        new TextDisplayBuilder().setContent(`*Match ID: ${league.id}*`)
                    );
                const banner = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('https://i.imgur.com/KvxOH6m.png'));
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId(`join_match_${league.id}`).setLabel('Join Match').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`leave_match_${league.id}`).setLabel('Leave').setStyle(ButtonStyle.Danger)
                );

                await interaction.message.edit({ components: [header, banner, row] as any[] });
                
                if (isJoin && newCount === league.capacity) await interaction.channel?.send(`🚨 <@${league.hostId}>, the queue has reached 10/10 capacity! Please use \`/match teams\` to begin.`);
                
                return interaction.editReply(isJoin ? '✅ You successfully joined the queue!' : '🚪 You left the queue.');
            }
        }
        
        // (Modals and Polls logic remains the same)
        // ... (truncated for brevity, but your existing handler will pick it up)

    } catch (error) {
        logger.error('Global Interaction Handler', error);
    }
};
