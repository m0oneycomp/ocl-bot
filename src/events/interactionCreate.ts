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
                    
                    // Secure VIP Server Delivery
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

            // ... poll logic remains identical (truncated for safety, existing file handles it)
        }
        
        // ... select menus remain identical
    } catch (error) {
        logger.error('Global Interaction Handler', error);
    }
};
