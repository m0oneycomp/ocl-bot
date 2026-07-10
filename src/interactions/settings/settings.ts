import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { db } from '../../database/db';

export const settingsCommand = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Configure the OCL League parameters and configurations'),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has('Administrator')) {
            return interaction.reply({ content: '❌ You do not have permission to access the settings matrix.', ephemeral: true });
        }

        const settings = await db.settings.findUnique({ where: { id: 'global' } });
        const win = settings?.winPoints ?? 25;
        const lose = settings?.losePoints ?? 0;
        const kill = settings?.killPoints ?? 5;
        const roverStatus = settings?.roverEnabled ? 'ENABLED' : 'DISABLED';

        const embed = new EmbedBuilder()
            .setTitle('⚙️ OCL Configuration Portal')
            .setDescription('Select an administrative subsystem category below to modify settings dynamically.')
            .setColor('#337def') // Brand Color
            .setThumbnail('https://i.imgur.com/f5LGesj.png') // 1:1 Logo
            .setImage('https://i.imgur.com/KvxOH6m.png') // 16:9 Banner
            .addFields(
                { name: '📊 Current Points Mode', value: `Base Win: \`+${win}\` | Base Loss: \`${lose > 0 ? '+' : ''}${lose}\` | 1 Kill: \`+${kill}\``, inline: true },
                { name: '🔒 RoVer Integration', value: `Verification: \`${roverStatus}\``, inline: true }
            );

        const select = new StringSelectMenuBuilder()
            .setCustomId('settings_selector')
            .setPlaceholder('Select a configuration profile to modify')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Points Allocation System').setValue('config_points').setEmoji('📊'),
                new StringSelectMenuOptionBuilder().setLabel('Role & Permission Hierarchy').setValue('config_roles').setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder().setLabel('RoVer API Settings').setValue('config_rover').setEmoji('🔗')
            );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
};
