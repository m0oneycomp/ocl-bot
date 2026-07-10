import { SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { db } from '../../database/db';

export const leagueCommand = {
    data: new SlashCommandBuilder()
        .setName('league')
        .setDescription('Core OCL League Management System')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Host a new competitive league')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('End your currently active league')
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            // 1. Database Check: Is user already hosting?
            const existingLeague = await db.league.findFirst({
                where: { hostId: interaction.user.id, status: 'PENDING' }
            });

            if (existingLeague) {
                return interaction.reply({ content: '❌ You are already hosting a pending league.', ephemeral: true });
            }

            // 2. Create League in DB
            const league = await db.league.create({
                data: {
                    hostId: interaction.user.id,
                    channelId: interaction.channelId,
                }
            });

            // 3. Premium V2 Components Embed
            const embed = new EmbedBuilder()
                .setTitle('🏆 OCL Competitive League')
                .setDescription(`Hosted by <@${interaction.user.id}>\n\n**Status:** Waiting for players...\n**Capacity:** 0/10`)
                .setColor('#2b2d31')
                .setFooter({ text: `League ID: ${league.id}` });

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('join_league')
                        .setLabel('Join League')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('leave_league')
                        .setLabel('Leave / Forfeit')
                        .setStyle(ButtonStyle.Danger)
                );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (subcommand === 'end') {
            await interaction.reply({ content: 'League ended process initiated.', ephemeral: true });
        }
    },
};
