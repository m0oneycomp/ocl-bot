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
            .setDescription('Select an administrative subsystem category below to modify settings dynamically.')
            .setColor('#337def') 
            .setImage('https://i.imgur.com/KvxOH6m.png')
            .addFields(
                { name: '📊 Current Points Mode', value: `Win: \`+${settings?.winPoints ?? 25}\` | Loss: \`${(settings?.losePoints ?? 0) > 0 ? '+' : ''}${settings?.losePoints ?? 0}\` | Kill: \`+${settings?.killPoints ?? 5}\``, inline: false },
                { name: '🔒 Security Toggles', value: `RoVer: \`${settings?.roverEnabled ? 'ON' : 'OFF'}\` | Bloxlink: \`${settings?.bloxlinkEnabled ? 'ON' : 'OFF'}\` | Community Verify: \`${settings?.communityVerifyEnabled ? 'ON' : 'OFF'}\``, inline: false },
                { name: '📍 Deployment Channels', value: `Ranked: ${settings?.rankedChannelId ? `<#${settings.rankedChannelId}>` : 'Unset'} | League: ${settings?.leagueChannelId ? `<#${settings.leagueChannelId}>` : 'Unset'} | Scrim: ${settings?.scrimChannelId ? `<#${settings.scrimChannelId}>` : 'Unset'} | Casual: ${settings?.casualChannelId ? `<#${settings.casualChannelId}>` : 'Unset'}`, inline: false }
            );

        const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId('settings_selector').setPlaceholder('Select a configuration profile to modify').addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Points Allocation System').setValue('config_points').setEmoji('📊'),
                new StringSelectMenuOptionBuilder().setLabel('Role & Hierarchy Manager').setValue('config_roles').setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder().setLabel('Match Deployment Channels').setValue('config_channels').setEmoji('📍'),
                new StringSelectMenuOptionBuilder().setLabel('Third-Party API Keys').setValue('config_apis').setEmoji('🔑'),
                new StringSelectMenuOptionBuilder().setLabel('Security Feature Toggles').setValue('config_toggles').setEmoji('⚙️')
            )
        );

        await interaction.reply({ embeds: [embed], components: [select], ephemeral: true });
    }
};
