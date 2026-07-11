import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { db } from '../../database/db';

export const strikeCommand = {
    data: new SlashCommandBuilder()
        .setName('strike')
        .setDescription('Moderation system for competitive infractions')
        .addSubcommand(s => s.setName('add').setDescription('Strike a user or clan')
            .addStringOption(o => o.setName('reason').setDescription('Infraction reason').setRequired(true))
            .addUserOption(o => o.setName('user').setDescription('Specific user to strike').setRequired(false))
            .addStringOption(o => o.setName('clan').setDescription('Specific clan to strike').setRequired(false).setAutocomplete(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Remove a strike (Undo)')
            .addStringOption(o => o.setName('strike_id').setDescription('Exact ID of the strike to remove').setRequired(true))),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has('Administrator')) return interaction.reply({ content: '⛔ Unauthorized.', ephemeral: true });

        const sub = interaction.options.getSubcommand();
        
        if (sub === 'add') {
            const reason = interaction.options.getString('reason', true);
            const user = interaction.options.getUser('user');
            const clan = interaction.options.getString('clan');

            if (!user && !clan) return interaction.reply({ content: '❌ You must specify either a user or a clan to strike.', ephemeral: true });

            const strike = await db.strike.create({ data: { reason, userId: user?.id, clanName: clan } });

            const embed = new EmbedBuilder()
                .setTitle('⚠️ Official Moderation Strike Issued')
                .setDescription(`**Reason:** ${reason}\n**Target:** ${user ? `<@${user.id}>` : `Clan ${clan}`}\n**Strike ID:** \`${strike.id}\``)
                .setColor('#e74c3c')
                .setTimestamp();

            await interaction.reply({ content: '✅ Strike recorded.', ephemeral: true });
            await interaction.channel?.send({ embeds: [embed] });
        }

        if (sub === 'remove') {
            const strikeId = interaction.options.getString('strike_id', true);
            const strike = await db.strike.findUnique({ where: { id: strikeId } });
            if (!strike) return interaction.reply({ content: '❌ Strike ID not found in database.', ephemeral: true });

            await db.strike.delete({ where: { id: strikeId } });
            return interaction.reply({ content: `✅ Strike \`${strikeId}\` has been completely revoked and removed from records.`, ephemeral: true });
        }
    }
};
