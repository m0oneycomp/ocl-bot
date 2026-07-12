import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, GuildMember, ButtonBuilder } from 'discord.js';
import { OCLClient } from '../client/OCLClient';
import { db } from '../database/db';
import { verifyPlayer } from '../services/verification';

export const interactionCreateEvent = async (client: OCLClient, interaction: Interaction) => {
    try {
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('join_match_') || interaction.customId.startsWith('leave_match_')) {
                await interaction.deferReply({ ephemeral: true });
                const isJoin = interaction.customId.startsWith('join_match_');
                const leagueId = interaction.customId.replace(isJoin ? 'join_match_' : 'leave_match_', '');
                const league = await db.league.findUnique({ where: { id: leagueId } });
                
                if (!league || league.status !== 'PENDING') return interaction.editReply('❌ Match is closed or generating teams.');
                
                if (isJoin) {
                    await db.user.upsert({ where: { id: interaction.user.id }, update: {}, create: { id: interaction.user.id }});
                    const count = await db.user.count({ where: { activeLeague: leagueId } });
                    if (count >= league.capacity) return interaction.editReply('❌ Queue is completely full.');
                    
                    await db.user.update({ where: { id: interaction.user.id }, data: { activeLeague: leagueId } });
                } else {
                    await db.user.update({ where: { id: interaction.user.id }, data: { activeLeague: null } });
                }

                const newCount = await db.user.count({ where: { activeLeague: leagueId } });
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                embed.setDescription(`**Host:** <@${league.hostId}>\n**Region:** ${league.region}\n\n**Players Joined: ${newCount}/${league.capacity}**`);
                await interaction.message.edit({ embeds: [embed] });
                
                if (isJoin && newCount === league.capacity) {
                    // 🔥 AUTO-TEAMS & 15-MINUTE TIMEOUT TRIGGER 🔥
                    const players = await db.user.findMany({ where: { activeLeague: leagueId } });
                    const shuffled = players.sort(() => 0.5 - Math.random());
                    const mid = Math.ceil(shuffled.length / 2);
                    const teamA = shuffled.slice(0, mid);
                    const teamB = shuffled.slice(mid);
                    
                    for (const p of teamA) await db.user.update({ where: { id: p.id }, data: { activeTeam: 'A' } });
                    for (const p of teamB) await db.user.update({ where: { id: p.id }, data: { activeTeam: 'B' } });
                    
                    const shortId = leagueId.split('-')[0].toUpperCase();
                    await db.league.update({ where: { id: leagueId }, data: { status: 'ACTIVE', shortId } });

                    const teamEmbed = new EmbedBuilder()
                        .setTitle(`🎲 Match Teams Locked | ID: ${shortId}`)
                        .addFields(
                            { name: '🔵 Team A', value: teamA.map(p => `<@${p.id}>`).join('\n') || 'Empty', inline: true },
                            { name: '🔴 Team B', value: teamB.map(p => `<@${p.id}>`).join('\n') || 'Empty', inline: true }
                        )
                        .setColor('#e67e22');
                        
                    await interaction.channel?.send({ content: `🚨 **Match ${shortId}** has begun! You have 15 minutes to post a screenshot in the Results channel or everyone receives a strike.`, embeds: [teamEmbed] });

                    setTimeout(async () => {
                        const check = await db.league.findUnique({ where: { id: leagueId } });
                        if (check && check.status === 'ACTIVE' && !check.proofSubmitted) {
                            const pts = await db.user.findMany({ where: { activeLeague: leagueId } });
                            for (const p of pts) {
                                // Issue the strike silently to DB to prevent crash
                                await db.strike.create({ data: { userId: p.id, reason: `Failed to post Match ${shortId} results in time.`} }).catch(() => null);
                            }
                            const set = await db.settings.findUnique({where:{id:'global'}});
                            if (set?.resultsChannelId) {
                                const rChan = await interaction.guild?.channels.fetch(set.resultsChannelId).catch(()=>null);
                                if (rChan && 'send' in rChan) await rChan.send(`⚠️ **Match ${shortId}** timed out. Strikes have been automatically issued to all participants for failing to post results.`);
                            }
                        }
                    }, 15 * 60 * 1000);
                }
                return interaction.editReply(isJoin ? '✅ Joined the queue successfully!' : '🚪 You left the queue.');
            }
        }

        else if (interaction.isStringSelectMenu() && interaction.customId === 'settings_selector') {
            const s = interaction.values[0];
            const set = await db.settings.findUnique({ where: { id: 'global' } });
            
            if (s === 'config_roles') {
                const m = new ModalBuilder().setCustomId('modal_roles').setTitle('Hierarchy Manager');
                const hInput = new TextInputBuilder().setCustomId('h').setLabel('HiCom Role ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.hiComRoleId) hInput.setValue(set.hiComRoleId);
                const mInput = new TextInputBuilder().setCustomId('m').setLabel('Match Hoster Role ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.matchHosterRoleId) mInput.setValue(set.matchHosterRoleId);
                const repInput = new TextInputBuilder().setCustomId('rep').setLabel('Match Reporter Role ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.matchReporterRoleId) repInput.setValue(set.matchReporterRoleId);
                m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(hInput), new ActionRowBuilder<TextInputBuilder>().addComponents(mInput), new ActionRowBuilder<TextInputBuilder>().addComponents(repInput));
                return interaction.showModal(m);
            } 
            else if (s === 'config_channels') {
                const m = new ModalBuilder().setCustomId('modal_channels').setTitle('Deployment Channels');
                const rInput = new TextInputBuilder().setCustomId('r').setLabel('Ranked Channel ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.rankedChannelId) rInput.setValue(set.rankedChannelId);
                const resInput = new TextInputBuilder().setCustomId('res').setLabel('Match Results Channel ID').setStyle(TextInputStyle.Short).setRequired(false); if (set?.resultsChannelId) resInput.setValue(set.resultsChannelId);
                m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(rInput), new ActionRowBuilder<TextInputBuilder>().addComponents(resInput));
                return interaction.showModal(m);
            }
        }
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_roles') {
                await db.settings.upsert({ where: { id: 'global' }, update: { hiComRoleId: interaction.fields.getTextInputValue('h') || null, matchHosterRoleId: interaction.fields.getTextInputValue('m') || null, matchReporterRoleId: interaction.fields.getTextInputValue('rep') || null }, create: { id: 'global' }});
                return interaction.reply({ content: '✅ Roles saved.', ephemeral: true });
            } else if (interaction.customId === 'modal_channels') {
                await db.settings.upsert({ where: { id: 'global' }, update: { rankedChannelId: interaction.fields.getTextInputValue('r') || null, resultsChannelId: interaction.fields.getTextInputValue('res') || null }, create: { id: 'global' }});
                return interaction.reply({ content: '✅ Channels saved.', ephemeral: true });
            }
        }
    } catch (e) { console.error(e); }
};
