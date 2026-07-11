import { ChatInputCommandInteraction, EmbedBuilder, TextChannel } from 'discord.js';

export const logCommand = async (interaction: ChatInputCommandInteraction) => {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) return;

    try {
        const channel = await interaction.client.channels.fetch(logChannelId).catch(() => null) as TextChannel;
        if (!channel) return;

        // Formats options (like clan name, target user, etc) so you know exactly what they typed
        const options = interaction.options.data.map(opt => {
            if (opt.options) return `**${opt.name}**: Subcommand Executed`;
            return `**${opt.name}**: ${opt.value}`;
        }).join('\n') || 'None';

        const embed = new EmbedBuilder()
            .setTitle('⌨️ Command Executed')
            .addFields(
                { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Command', value: `\`/${interaction.commandName} ${interaction.options.getSubcommand(false) || ''}\``, inline: true },
                { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true },
                { name: 'Inputs', value: options }
            )
            .setColor('#337def')
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (error) {
        // Fail silently so it doesn't interrupt the actual command if the log channel gets deleted
    }
};
