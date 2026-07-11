import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits } from 'discord.js';
import os from 'os';

const AUTHORIZED_DEVELOPER_ID = '1197110500333469720';

export const developerCommand = {
    data: new SlashCommandBuilder()
        .setName('dev')
        .setDescription('Root Developer Dashboard')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction: ChatInputCommandInteraction) {
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

        // Standard Options for all Admins
        const menuOptions = [
            new StringSelectMenuOptionBuilder().setLabel('Download Error Logs').setValue('download_logs').setEmoji('📄'),
            new StringSelectMenuOptionBuilder().setLabel('Wipe All Polls').setValue('wipe_polls').setEmoji('🗑️'),
            new StringSelectMenuOptionBuilder().setLabel('Clear Entry Channel').setValue('clear_entry').setEmoji('🧹'),
            new StringSelectMenuOptionBuilder().setLabel('Sync All Ranks').setValue('sync_ranks').setEmoji('🔄')
        ];

        // STEALTH INJECTION: Only add the AI option if YOU execute the command
        if (interaction.user.id === AUTHORIZED_DEVELOPER_ID) {
            menuOptions.push(new StringSelectMenuOptionBuilder().setLabel('Launch AI Agent').setValue('launch_ai').setEmoji('🧠'));
        }

        const toolSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('dev_tools')
                .setPlaceholder('Select a maintenance tool...')
                .addOptions(menuOptions)
        );

        await interaction.reply({ embeds: [embed], components: [toolSelect], ephemeral: true });
    }
};
