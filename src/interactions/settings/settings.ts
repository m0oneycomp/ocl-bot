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
            .setImage('https://i.imgur.com/KvxOH6m.png') // Banner ONLY
            .addFields(
                { name: '📊 Current Points Mode', value: `Base Win: \`+${settings?.winPoints ?? 25}\` | Base Loss: \`${(settings?.losePoints ?? 0) > 0 ? '+' : ''}${settings?.losePoints ?? 0}\` | 1 Kill: \`+${settings?.killPoints ?? 5}\``, inline: true },
                { name: '🔒 RoVer Integration', value: `Verification: \`${settings?.roverEnabled ? 'ENABLED' : 'DISABLED'}\``, inline: true }
            );

        const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId('settings_selector').setPlaceholder('Select a configuration profile to modify').addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Points Allocation System').setValue('config_points').setEmoji('📊'),
                new StringSelectMenuOptionBuilder().setLabel('Role & Permission Hierarchy').setValue('config_roles').setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder().setLabel('RoVer API Settings').setValue('config_rover').setEmoji('🔗')
            )
        );
        await interaction.reply({ embeds: [embed], components: [select], ephemeral: true });
    }
};
