import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import os from 'os';

export const developerCommand = {
    data: new SlashCommandBuilder()
        .setName('dev')
        .setDescription('Root Developer Dashboard'),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has('Administrator')) return interaction.reply({ content: '⛔ Unauthorized.', ephemeral: true });

        const ramTotal = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const ramFree = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);

        const embed = new EmbedBuilder()
            .setTitle('👨‍💻 OCL Developer & System Dashboard')
            .setDescription('**Warning:** Destructive actions bypass standard confirmation guards.')
            .setColor('#337def')
            .addFields(
                { name: '🖥️ Host System', value: `RAM: ${ramFree}GB / ${ramTotal}GB Free`, inline: true },
                { name: '📦 Database', value: `Status: Connected (Prisma)`, inline: true }
            );

        const toolSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('dev_tools')
                .setPlaceholder('Select a maintenance tool...')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('Download Error Logs').setValue('download_logs').setEmoji('📄'),
                    new StringSelectMenuOptionBuilder().setLabel('Wipe All Polls').setValue('wipe_polls').setEmoji('🗑️'),
                    new StringSelectMenuOptionBuilder().setLabel('Clear Entry Channel').setValue('clear_entry').setEmoji('🧹'),
                    new StringSelectMenuOptionBuilder().setLabel('Sync All Ranks').setValue('sync_ranks').setEmoji('🔄')
                )
        );

        await interaction.reply({ embeds: [embed], components: [toolSelect], ephemeral: true });
    }
};
