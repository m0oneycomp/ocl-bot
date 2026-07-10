import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { db } from '../../database/db';

export const strikeCommand = {
    data: new SlashCommandBuilder()
        .setName('strike')
        .setDescription('Universal strike management (Users & Clans)')
        .addSubcommand(s => s.setName('issue').setDescription('Issue a strike')
            .addStringOption(o => o.setName('reason').setDescription('Reason for strike').setRequired(true))
            .addUserOption(o => o.setName('user').setDescription('Target user (leave blank if clan)'))
            .addStringOption(o => o.setName('clan').setDescription('Target clan name (leave blank if user)')))
        .addSubcommand(s => s.setName('view').setDescription('View strike history')
            .addUserOption(o => o.setName('user').setDescription('Target user'))
            .addStringOption(o => o.setName('clan').setDescription('Target clan name'))),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has('ManageMessages')) return interaction.reply({ content: '⛔ Unauthorized.', ephemeral: true });

        const sub = interaction.options.getSubcommand();
        const userTarget = interaction.options.getUser('user');
        const clanTarget = interaction.options.getString('clan');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!userTarget && !clanTarget) return interaction.reply({ content: '❌ Specify either a User OR a Clan.', ephemeral: true });

        if (sub === 'issue') {
            if (clanTarget) {
                const clan = await db.clan.findUnique({ where: { name: clanTarget } });
                if (!clan) return interaction.reply({ content: `❌ Clan **${clanTarget}** does not exist.`, ephemeral: true });
                
                await db.strike.create({ data: { reason, clanName: clan.name } });
                const embed = new EmbedBuilder().setTitle('⚠️ Clan Strike Issued').setDescription(`**Clan:** ${clan.name}\n**Reason:** ${reason}`).setColor('#e74c3c');
                return interaction.reply({ embeds: [embed] });
            }

            if (userTarget) {
                await db.strike.create({ data: { reason, userId: userTarget.id } });
                const embed = new EmbedBuilder().setTitle('⚠️ User Strike Issued').setDescription(`**User:** <@${userTarget.id}>\n**Reason:** ${reason}`).setColor('#e74c3c');
                return interaction.reply({ embeds: [embed] });
            }
        }

        if (sub === 'view') {
            const strikes = await db.strike.findMany({
                where: clanTarget ? { clanName: clanTarget } : { userId: userTarget?.id }
            });

            const targetName = clanTarget ? clanTarget : `<@${userTarget?.id}>`;
            const embed = new EmbedBuilder()
                .setTitle(`📋 Strike Record: ${clanTarget || userTarget?.username}`)
                .setColor(strikes.length > 0 ? '#e74c3c' : '#2b2d31')
                .setDescription(strikes.length > 0 
                    ? strikes.map((s, i) => `**${i + 1}.** ${s.reason} *(Date: ${s.createdAt.toLocaleDateString()})*`).join('\n') 
                    : `No active strikes found for ${targetName}.`);

            return interaction.reply({ embeds: [embed] });
        }
    }
};
