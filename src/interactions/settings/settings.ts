import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { db } from '../../database/db';

export const settingsCommand = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Configure the OCL League parameters and configurations'),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has('Administrator')) return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });

        const settings = await db.settings.findUnique({ where: { id: 'global' } });
        
        const embed = new EmbedBuilder()
            .setTitle('⚙️ OCL Configuration Portal')
            .setColor('#337def') 
            .addFields(
                { name: '🛡️ Hierarchy', value: `Reporter Role: ${settings?.matchReporterRoleId ? `<@&${settings.matchReporterRoleId}>` : 'Unset'}`, inline: false },
                { name: '📍 Deployment Channels', value: `Ranked: ${settings?.rankedChannelId ? `<#${settings.rankedChannelId}>` : 'Unset'} | Results: ${settings?.resultsChannelId ? `<#${settings.resultsChannelId}>` : 'Unset'}`, inline: false }
            );

        const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId('settings_selector').setPlaceholder('Select a configuration profile to modify').addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Role & Hierarchy Manager').setValue('config_roles').setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder().setLabel('Match Deployment Channels').setValue('config_channels').setEmoji('📍')
            )
        );

        await interaction.reply({ embeds: [embed], components: [select], ephemeral: true });
    }
};
