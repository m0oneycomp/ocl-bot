import { ChatInputCommandInteraction, EmbedBuilder, TextChannel, CommandInteractionOption } from 'discord.js';

export const logCommand = async (interaction: ChatInputCommandInteraction) => {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) return;

    try {
        const channel = await interaction.client.channels.fetch(logChannelId).catch(() => null) as TextChannel;
        if (!channel) return;

        // Recursively extract all data, including attachment URLs
        const extractOptions = (options: readonly CommandInteractionOption[]): string => {
            let result = '';
            for (const opt of options) {
                if (opt.options) result += `**[Subcommand] ${opt.name}**\n${extractOptions(opt.options)}`;
                else if (opt.type === 11) result += `• **${opt.name}**: [File/Image Attached](${opt.attachment?.url})\n`;
                else if (opt.user) result += `• **${opt.name}**: <@${opt.user.id}>\n`;
                else if (opt.role) result += `• **${opt.name}**: <@&${opt.role.id}>\n`;
                else result += `• **${opt.name}**: ${opt.value}\n`;
            }
            return result;
        };

        const inputs = extractOptions(interaction.options.data) || '*No additional parameters*';

        const embed = new EmbedBuilder()
            .setTitle('⌨️ Administrative Command Audit')
            .addFields(
                { name: 'Executor', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Command Matrix', value: `\`/${interaction.commandName} ${interaction.options.getSubcommand(false) || ''}\``, inline: true },
                { name: 'Origin Channel', value: `<#${interaction.channelId}>`, inline: true },
                { name: 'Payload Data', value: inputs }
            )
            .setColor('#337def')
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (error) {}
};
