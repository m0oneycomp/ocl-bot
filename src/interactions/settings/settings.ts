import { SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ContainerBuilder, ThumbnailBuilder, MessageFlags } from 'discord.js';
import { db } from '../../database/db';

export const settingsCommand = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Configure the OCL League parameters and configurations'),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has('Administrator')) return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });

        const settings = await db.settings.findUnique({ where: { id: 'global' } });
        
        const container = new ContainerBuilder()
            .setAccentColor(0x337DEF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('# ⚙️ OCL Configuration Portal'),
                        new TextDisplayBuilder().setContent('Select an administrative subsystem category below to modify settings dynamically.')
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: 'https://i.imgur.com/f5LGesj.png' } }))
            )
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('https://i.imgur.com/KvxOH6m.png'))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('**📊 Points Mode**'),
                new TextDisplayBuilder().setContent(`Win: \`+${settings?.winPoints ?? 25}\` | Loss: \`${(settings?.losePoints ?? 0) > 0 ? '+' : ''}${settings?.losePoints ?? 0}\` | Kill: \`+${settings?.killPoints ?? 5}\``),
                new TextDisplayBuilder().setContent('\n**🔒 RoVer Integration**'),
                new TextDisplayBuilder().setContent(`Verification: \`${settings?.roverEnabled ? 'ENABLED' : 'DISABLED'}\``)
            )
            .addActionRowComponents(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder().setCustomId('settings_selector').setPlaceholder('Select a configuration profile to modify').addOptions(
                        new StringSelectMenuOptionBuilder().setLabel('Points Allocation System').setValue('config_points').setEmoji('📊'),
                        new StringSelectMenuOptionBuilder().setLabel('Role & Permission Hierarchy').setValue('config_roles').setEmoji('🛡️'),
                        new StringSelectMenuOptionBuilder().setLabel('RoVer API Settings').setValue('config_rover').setEmoji('🔗')
                    )
                )
            );

        await interaction.reply({ components: [container] as any[], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }
};
